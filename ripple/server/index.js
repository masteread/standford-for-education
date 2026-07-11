// Express server + deterministic tick loop. Owns the Lemonville world; the LLM
// agents plug in through the frozen HTTP contract (shared/contracts.md).
//
// Tick model: clients poll GET /state every 2s (no WebSockets — per spec).
// A round resolves when every active human has confirmed OR the 20s timer fires.
// Empty slots / single-phone play are driven by a simple SCRIPTED NPC (not an LLM):
// it matches the rival's price with a 1-round lag and defects from the cartel at R11.
//
// Scripted events fire at the START of their round (frost R4, tax R6, shady
// supplier R8, cartel R10) so players decide under them. See server/events.js.

import express from "express";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { resolveRound, totalCrates } from "./market.js";
import { applyEvent, eventForRound, eventById, resolveOffer, pendingOffers } from "./events.js";
import { castStudent } from "./agents/orchestrator.js";
import { runDelegate } from "./agents/delegate.js";
import { gradeCohort } from "./agents/examiner.js";
import { saveState, appendDecision, saveOverride, getOverrides } from "./storage.js";
import { seededCohort, sampleCascade } from "../test/fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(path.join(__dirname, "../shared/scenario.json"), "utf8"));

const SLOT_IDS = ["A", "B"]; // Lemonville is a duopoly
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const PORT = process.env.PORT || 3001;

// Best shareable URL for the QR / join link: PUBLIC_URL (tunnel) if set, else the
// machine's LAN IP so phones on the same wifi can scan and join.
function shareUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/?$/, "/");
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) return `http://${ni.address}:${PORT}/`;
    }
  }
  return `http://localhost:${PORT}/`;
}

// ── Game state ────────────────────────────────────────────────────────────────
function freshGrower(id, name, goal) {
  return {
    id,
    name: name ?? `Stand ${id}`,
    price: 5,
    produced: 0,
    sold: 0,
    inventory: [{ age: 0, crates: scenario.startCrates }],
    cash: scenario.startCash,
    unitCost: scenario.unitCost,
    goal: goal ?? "max_profit",
    goalProgress: 0,
    // cumulative bookkeeping for goal progress + reporting
    soldCumulative: 0,
    producedCumulative: scenario.startCrates,
    spoiledCumulative: 0,
    prevRevenue: null,
    reputationUntil: 0, // rounds through which a bad-lemon boycott applies
    badStockPending: false, // holding unsold shady stock
    isHuman: false,
    lastAction: { price: 5, produce: 20 },
  };
}

function newGame() {
  return {
    scenario,
    round: 1,
    phase: "collecting", // collecting | resolving | done
    growers: {
      A: freshGrower("A", "Stand A"),
      B: freshGrower("B", "Stand B"),
    },
    market: { totalDemand: null, avgPrice: null, news: null },
    cascade: [],
    decisionLog: [],
    pendingDecisions: {},
    confirmed: new Set(),
    joinOrder: [], // studentIds in join order
    roundStartedAt: Date.now(),
    started: false,
    frostDone: false,
    // event machinery
    firedEvents: new Set(),
    mailbox: {},
    banner: null,
    salesTax: 0,
    cartel: null,
    repPenalty: 0,
    repRounds: 0,
  };
}

let game = newGame();

// Fire the scripted event (if any) for the current round. Called on start + advance.
function startRound() {
  const ev = eventForRound(scenario, game.round);
  if (ev) applyEvent(game, ev);
}

// ── TickState builder (with per-viewer visibility filtering) ──────────────────
function buildTickState(g, viewerId) {
  const growers = Object.keys(g.growers).map((id) => {
    const gr = g.growers[id];
    const isSelf = viewerId === id || viewerId === "admin";
    if (isSelf) {
      return {
        id: gr.id, name: gr.name, price: gr.price, produced: gr.produced, sold: gr.sold,
        inventory: gr.inventory.map((b) => ({ ...b })), cash: gr.cash, unitCost: gr.unitCost,
        goal: gr.goal, goalProgress: gr.goalProgress,
      };
    }
    // Rival is public only: price + last sold. Cash/inventory/goal stay hidden
    // (inferring the rival's objective from behavior is the skill we're teaching).
    return { id: gr.id, name: gr.name, price: gr.price, sold: gr.sold };
  });
  return {
    round: g.round,
    phase: g.phase,
    growers,
    market: { ...g.market },
    cascade: g.cascade,
  };
}

// ── Scripted NPC for empty slots / single-phone play (NOT an LLM) ─────────────
// Matches the rival's price with a 1-round lag, defends margin after frost,
// cooperates the round a cartel forms, then DEFECTS (undercuts) from R11.
function botDecision(game, id) {
  const gr = game.growers[id];
  const rivalId = Object.keys(game.growers).find((x) => x !== id);
  const rival = game.growers[rivalId];
  const cost = gr.unitCost;
  const cartel = game.cartel;
  let price = gr.price;
  let note = "(NPC) matched the rival with a lag";

  if (cartel && game.round >= cartel.npcDefectsRound) {
    price = Math.max(cost + 1, (rival?.price ?? cartel.price) - 1); // defect: undercut the cartel
    note = "(NPC) defected from the cartel — undercut for market share";
  } else if (cartel && game.round >= cartel.round) {
    price = cartel.price; // cooperate at the cartel price
    note = `(NPC) cooperated at the cartel price $${cartel.price}`;
  } else if (rival) {
    if (rival.price < gr.price - 0.25) price = Math.max(cost + 1, rival.price - 0.25); // undercut → follow down
    else if (rival.price > gr.price + 1) price = gr.price + 0.5; // umbrella → capture a little margin
  }
  if (cost > 2) price = Math.max(price, cost + 2); // frost/tax → defend margin

  price = clamp(Math.round(price * 4) / 4, 1, 15); // quarter-dollar, clamped
  const produce = clamp(gr.sold > 0 ? gr.sold + 5 : 25, 15, 60);
  return { price, produce, intent: note, source: "bot" };
}

// ── Round resolution + advance ────────────────────────────────────────────────
function resolveAndAdvance() {
  game.phase = "resolving";

  // Fill any missing decision (NPC, or humans who didn't confirm → repeat last).
  for (const id of Object.keys(game.growers)) {
    if (!game.pendingDecisions[id]) {
      const gr = game.growers[id];
      game.pendingDecisions[id] = gr.isHuman
        ? { ...gr.lastAction, intent: "(no input) repeat last action", source: "repeat" }
        : botDecision(game, id);
    }
  }

  resolveRound(game);

  // Persist snapshot (best-effort; never blocks).
  saveState(game.round, buildTickState(game, "admin")).catch(() => {});

  // Remember last actions for repeat/NPC logic.
  for (const id of Object.keys(game.growers)) {
    const dec = game.pendingDecisions[id];
    game.growers[id].lastAction = { price: dec.price, produce: dec.produce };
  }

  game.round += 1;
  game.confirmed = new Set();
  game.pendingDecisions = {};
  game.roundStartedAt = Date.now();
  game.phase = game.round > scenario.rounds ? "done" : "collecting";
  if (game.phase === "collecting") startRound(); // fire this round's scripted event
}

// Tick: check every 500ms whether the round should resolve.
setInterval(() => {
  if (game.phase !== "collecting" || !game.started) return;
  const humans = game.joinOrder.filter((id) => game.growers[id]?.isHuman);
  const allConfirmed = humans.length > 0 && humans.every((id) => game.confirmed.has(id));
  const elapsed = Date.now() - game.roundStartedAt;
  if (allConfirmed || elapsed >= scenario.roundSeconds * 1000) resolveAndAdvance();
}, 500);

// ── HTTP ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// GET /config → the shareable join URL for the QR code (works from phones).
app.get("/config", (req, res) => res.json({ joinUrl: shareUrl() }));

// POST /join {name} → assign the next open slot via the orchestrator.
app.post("/join", async (req, res) => {
  const name = String(req.body?.name ?? "").trim() || "Anonymous";
  const slot = SLOT_IDS.find((id) => !game.growers[id].isHuman);
  if (!slot) return res.status(409).json({ error: "market full (2 stands max)" });

  const index = game.joinOrder.length;
  let cast;
  try {
    cast = await castStudent({ name, index });
  } catch (err) {
    cast = { studentId: slot, name, goal: "max_profit", castingReason: "fallback: orchestrator error", roleCard: null };
  }
  const gr = game.growers[slot];
  gr.name = name;
  gr.goal = cast.goal ?? gr.goal;
  gr.isHuman = true;
  game.joinOrder.push(slot);
  game.started = true;
  game.roundStartedAt = Date.now();
  startRound(); // in case they join on an event round

  res.json({ studentId: slot, roleCard: cast.roleCard, castingReason: cast.castingReason, goal: gr.goal });
});

// GET /state/:studentId → TickState filtered to what that student may see + UI extras.
app.get("/state/:studentId", (req, res) => {
  const id = req.params.studentId;
  if (!game.growers[id] && id !== "admin") return res.status(404).json({ error: "unknown student" });
  res.json({
    ...buildTickState(game, id),
    you: id,
    townsfolk: scenario.townsfolk,
    banner: game.banner,
    salesTax: game.salesTax,
    cartel: game.cartel ? { price: game.cartel.price, round: game.cartel.round } : null,
    offers: pendingOffers(game, id),
    roundStartedAt: game.roundStartedAt,
    roundSeconds: scenario.roundSeconds,
    totalRounds: scenario.rounds,
  });
});

// POST /intent {studentId, text} → delegate turns intent into an action (or a question).
app.post("/intent", async (req, res) => {
  const { studentId, text } = req.body ?? {};
  const gr = game.growers[studentId];
  if (!gr) return res.status(404).json({ error: "unknown student" });
  const visibleState = buildTickState(game, studentId);
  const ownState = { id: gr.id, price: gr.price, cash: gr.cash, unitCost: gr.unitCost, inventory: gr.inventory };
  try {
    const out = await runDelegate({ studentId, intent: text, visibleState, ownState, lastAction: gr.lastAction });
    res.json({ action: out.action, clarifyingQuestion: out.question ?? null, reply: out.reply ?? null, source: out.source });
  } catch (err) {
    res.json({ action: gr.lastAction, clarifyingQuestion: null, source: "error-fallback" });
  }
});

// POST /confirm {studentId, action, intent} → queue the decision for the next tick.
app.post("/confirm", (req, res) => {
  const { studentId, action, intent } = req.body ?? {};
  const gr = game.growers[studentId];
  if (!gr) return res.status(404).json({ error: "unknown student" });
  if (game.phase !== "collecting") return res.status(409).json({ error: "round not open" });

  const visibleState = buildTickState(game, studentId);
  game.pendingDecisions[studentId] = { price: Number(action?.price), produce: Number(action?.produce), intent, source: "human" };
  game.confirmed.add(studentId);

  const entry = { round: game.round, studentId, intent: String(intent ?? ""), action, visibleState };
  game.decisionLog.push(entry);
  appendDecision(entry).catch(() => {}); // best-effort; never blocks the tick

  res.json({ ok: true, confirmed: [...game.confirmed], round: game.round });
});

// POST /offer {studentId, offerId, accept} → accept/refuse a mailbox offer (a graded decision too).
app.post("/offer", (req, res) => {
  const { studentId, offerId, accept } = req.body ?? {};
  const gr = game.growers[studentId];
  if (!gr) return res.status(404).json({ error: "unknown student" });
  const result = resolveOffer(game, studentId, offerId, Boolean(accept));
  if (!result.ok) return res.status(409).json(result);

  const decision = { ...result.decision, visibleState: buildTickState(game, studentId) };
  game.decisionLog.push(decision);
  appendDecision(decision).catch(() => {});
  res.json({ ok: true, offer: result.offer, offers: pendingOffers(game, studentId) });
});

// POST /admin/shock → the demo button. Injects FROST immediately at the current round.
app.post("/admin/shock", (req, res) => {
  const banner = applyEvent(game, eventById(scenario, "frost"));
  res.json({ ok: true, news: game.market.news, banner, round: game.round });
});

// POST /admin/event {id} → inject any scripted event early.
app.post("/admin/event", (req, res) => {
  const ev = eventById(scenario, req.body?.id);
  if (!ev) return res.status(404).json({ error: "unknown event id" });
  const banner = applyEvent(game, ev);
  res.json({ ok: true, banner, news: game.market.news, round: game.round });
});

// POST /admin/start → begin the round timer (and fire round-1 event if any).
app.post("/admin/start", (req, res) => {
  game.started = true;
  game.roundStartedAt = Date.now();
  startRound();
  res.json({ ok: true, round: game.round });
});

// POST /admin/npc → fill the open slot with a scripted NPC and start.
app.post("/admin/npc", (req, res) => {
  const slot = SLOT_IDS.find((id) => !game.growers[id].isHuman && !game.joinOrder.includes(id));
  if (slot) game.growers[slot].name = `NPC ${slot}`;
  game.started = true;
  game.roundStartedAt = Date.now();
  res.json({ ok: true, npc: slot ?? null });
});

// POST /admin/resolve → force the current round to resolve now.
app.post("/admin/resolve", (req, res) => {
  if (game.phase === "collecting") resolveAndAdvance();
  res.json({ ok: true, round: game.round, phase: game.phase });
});

// POST /admin/reset → clean slate between rehearsals.
app.post("/admin/reset", (req, res) => {
  game = newGame();
  res.json({ ok: true });
});

// POST /admin/seed → fast-forward a fake 6-player cohort so the examiner has percentiles.
app.post("/admin/seed", (req, res) => {
  game.seededCohort = seededCohort();
  res.json({ ok: true, players: game.seededCohort.length });
});

// GET /admin/state → full unfiltered state for the admin page.
app.get("/admin/state", (req, res) => {
  res.json({
    round: game.round, phase: game.phase, started: game.started, frostDone: game.frostDone,
    growers: game.growers, market: game.market, banner: game.banner, joinOrder: game.joinOrder,
    firedEvents: [...game.firedEvents], cascadeCount: game.cascade.length, seeded: Boolean(game.seededCohort),
    events: scenario.events.map((e) => ({ id: e.id, round: e.round, title: e.title, emoji: e.emoji })),
  });
});

// ── Cohort assembly (shared by /report and /professor) ────────────────────────
function buildCohort() {
  const realPlayers = game.joinOrder
    .filter((sid) => game.growers[sid]?.isHuman)
    .map((sid) => ({
      studentId: sid,
      name: game.growers[sid].name,
      goal: game.growers[sid].goal,
      goalProgress: game.growers[sid].goalProgress,
      profit: game.growers[sid].cash - scenario.startCash,
      decisionLog: game.decisionLog.filter((d) => d.studentId === sid),
    }))
    .filter((p) => p.decisionLog.length > 0);

  const seeded = game.seededCohort ?? seededCohort();
  const cohort = [...realPlayers, ...seeded.filter((s) => !realPlayers.some((r) => r.studentId === s.studentId))];
  const cascade = game.cascade.length ? game.cascade : sampleCascade;
  return { cohort, cascade, realPlayers };
}

// GET /report/:studentId → grade the cohort (joined humans + seed) and return this student's model.
app.get("/report/:studentId", async (req, res) => {
  const id = req.params.studentId;
  const gr = game.growers[id];
  if (!gr) return res.status(404).json({ error: "unknown student" });

  const { cohort, cascade } = buildCohort();
  try {
    const models = await gradeCohort(cohort, { cascade });
    const model = models[id];
    if (!model) return res.status(202).json({ pending: true, message: "no decisions yet for this student" });
    res.json(model);
  } catch (err) {
    res.status(500).json({ error: `grading failed: ${err.message}` });
  }
});

// GET /professor/data → whole-class grid: decision-quality rank, per-task ratings, profit, goal.
app.get("/professor/data", async (req, res) => {
  const { cohort, cascade } = buildCohort();
  try {
    const models = await gradeCohort(cohort, { cascade });
    const overrides = getOverrides();
    res.json({ models, overrides, tasks: TASK_IDS, dimensions: DIMENSION_IDS, scenario: { events: scenario.events } });
  } catch (err) {
    res.status(500).json({ error: `grading failed: ${err.message}` });
  }
});

// POST /professor/override {taskId, studentId, newScore, note} → professor disposes.
app.post("/professor/override", async (req, res) => {
  const { taskId, studentId, newScore, note } = req.body ?? {};
  if (!taskId || !studentId) return res.status(400).json({ error: "taskId and studentId required" });
  const rec = await saveOverride({ taskId, studentId, newScore, note });
  res.json({ ok: true, override: rec });
});

const TASK_IDS = ["free_play", "frost_response", "tax_response", "quality_choice", "cartel_reasoning"];
const DIMENSION_IDS = ["equilibrium_reasoning", "strategic_anticipation", "information_updating", "risk_management"];

// ── Static client (single origin → the client's relative fetches just work) ────
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[ripple] Lemonville world server on http://localhost:${PORT}`);
  console.log(`[ripple] players on the same wifi join at: ${shareUrl()}`);
});
