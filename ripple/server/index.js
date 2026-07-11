// Express server + deterministic tick loop for the Lemonville ECOSYSTEM.
// The class is the economy: humans take seats in the chain (3 farms, 2 depots,
// 3 grocers, 3 cafés), scripted NPCs fill the rest, 24 simulated townsfolk spend
// at the bottom. All market physics live in shared/ecosystem.js (pure); this file
// owns time, seats, offers, and the HTTP contract. Clients poll /state every 2s.
//
// Butterfly attribution: every resolve also runs shared/impact.js counterfactuals
// (re-run the round minus each mover, diff the town) → "Your Ripples" + the
// ecosystem-impact score. Real diffs, never narration.

import express from "express";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { initialState, resolveEcosystem, totalUnits, tierOf } from "../shared/ecosystem.js";
import { computeImpact, summarizeImpact } from "../shared/impact.js";
import { applyEvent, eventForRound, eventById, resolveOffer, pendingOffers } from "./events.js";
import { npcDecision } from "./npc.js";
import { castStudent, GOAL_LABELS } from "./agents/orchestrator.js";
import { runDelegate } from "./agents/delegate.js";
import { gradeCohort, TASK_IDS, DIMENSIONS } from "./agents/examiner.js";
import { saveState, appendDecision, saveOverride, getOverrides } from "./storage.js";
import { seededCohort } from "../test/fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(path.join(__dirname, "../shared/scenario.json"), "utf8"));
const PORT = process.env.PORT || 3001;
const round2 = (v) => Math.round(v * 100) / 100;

function shareUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/?$/, "/");
  for (const list of Object.values(os.networkInterfaces()))
    for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal) return `http://${ni.address}:${PORT}/`;
  return `http://localhost:${PORT}/`;
}

// ── Game state ────────────────────────────────────────────────────────────────
function newGame() {
  return {
    scenario,
    state: initialState(scenario), // the pure-engine world (players, folk, history)
    phase: "collecting", // collecting | done
    started: false,
    joinOrder: [],
    pendingDecisions: {},
    confirmed: new Set(),
    decisionLog: [],
    cascadeLog: [],
    tradeLog: [],
    ripples: [], // one computeImpact() map per resolved round
    lastResolution: null, // {round, trades, folkTrips, cascade, metrics, resolvedAt} → the client animates exactly this
    mailbox: {},
    banner: null,
    news: null,
    firedEvents: new Set(),
    cartels: {},
    roundStartedAt: Date.now(),
    seededCohort: null,
  };
}
let game = newGame();

function startRound() {
  const ev = eventForRound(scenario, game.state.round);
  if (ev) applyEvent(game, ev);
}

// ── Per-viewer state filtering ────────────────────────────────────────────────
// Public: prices, stock levels, reputation flags — it's a town, shelves are visible.
// Private: cash, goals, exact inventory ages, WTP of townsfolk (the demand curve
// stays hidden — discovering it IS the game).
function buildTickState(viewerId) {
  const round = game.state.round;
  const players = Object.values(game.state.players).map((p) => {
    const pub = {
      id: p.id, role: p.role, name: p.name, isHuman: p.isHuman,
      price: p.price, sold: p.sold, stock: Math.round(totalUnits(p.inventory)),
      badRep: p.reputationUntil >= round,
    };
    if (p.id !== viewerId && viewerId !== "admin") return pub;
    return {
      ...pub,
      cash: p.cash, qty: p.qty, unitCost: p.unitCost,
      inventory: p.inventory.map((b) => ({ ...b })),
      goal: p.goal, goalProgress: p.goalProgress,
      profitRound: p.profitRound, profitCumulative: p.profitCumulative,
      shortfall: p.shortfall, spoiledCumulative: p.spoiledCumulative,
      mealsServed: p.mealsServed, folkServed: p.folkServed, lastSupplier: p.lastSupplier,
      lastAction: { ...p.lastAction },
    };
  });
  return {
    round,
    phase: game.phase,
    started: game.started,
    players,
    folk: game.state.folk.map((f) => ({ id: f.id, emoji: f.emoji })), // WTP stays hidden
    cascade: game.cascadeLog.slice(-250),
    market: { news: game.news, metrics: game.state.history.at(-1) ?? null, history: game.state.history },
  };
}

const slimScenario = {
  rounds: scenario.rounds,
  roundSeconds: scenario.roundSeconds,
  folkCount: scenario.folk.count,
  tiers: scenario.tiers.map((t) => ({
    role: t.role, label: t.label, emoji: t.emoji, building: t.building, seats: t.seats,
    priceBounds: t.priceBounds, qtyBounds: t.qtyBounds, qtyVerb: t.qtyVerb,
    mealsPerCrate: t.mealsPerCrate ?? null, unitCost: t.unitCost ?? null,
  })),
  goalLabels: GOAL_LABELS,
};

// ── Round resolution ──────────────────────────────────────────────────────────
function collectDecisions() {
  const decisions = {};
  for (const p of Object.values(game.state.players)) {
    const pending = game.pendingDecisions[p.id];
    if (pending) decisions[p.id] = { price: pending.price, qty: pending.qty };
    else if (p.isHuman) decisions[p.id] = { ...p.lastAction }; // no input → hold
    else decisions[p.id] = npcDecision(game, p.id);
  }
  return decisions;
}

function resolveAndAdvance() {
  const decisions = collectDecisions();
  const res = resolveEcosystem(game.state, decisions, scenario);
  const impact = computeImpact(game.state, decisions, scenario, res);

  game.state = res.state;
  game.cascadeLog.push(...res.cascade);
  game.tradeLog.push(...res.trades);
  game.ripples.push(impact);
  game.lastResolution = {
    round: res.metrics.round,
    trades: res.trades,
    folkTrips: res.folkTrips,
    cascade: res.cascade,
    metrics: res.metrics,
    resolvedAt: Date.now(),
  };
  saveState(res.metrics.round, { metrics: res.metrics, trades: res.trades }).catch(() => {});

  game.state.round += 1;
  game.confirmed = new Set();
  game.pendingDecisions = {};
  game.roundStartedAt = Date.now();
  if (game.state.round > scenario.rounds) game.phase = "done";
  else startRound();
}

setInterval(() => {
  if (game.phase !== "collecting" || !game.started) return;
  const humans = game.joinOrder;
  const allConfirmed = humans.length > 0 && humans.every((id) => game.confirmed.has(id));
  const elapsed = Date.now() - game.roundStartedAt;
  if (allConfirmed || elapsed >= scenario.roundSeconds * 1000) resolveAndAdvance();
}, 500);

// ── HTTP ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/config", (req, res) => res.json({ joinUrl: shareUrl(), scenario: slimScenario }));

// POST /join {name} → seat + role + goal via the orchestrator.
app.post("/join", async (req, res) => {
  const name = String(req.body?.name ?? "").trim() || "Anonymous";
  let cast;
  try {
    cast = await castStudent({ name, index: game.joinOrder.length, takenSeats: game.joinOrder, game });
  } catch (err) {
    console.warn(`[join] orchestrator error: ${err.message}`);
    cast = null;
  }
  if (!cast) return res.status(409).json({ error: "town full (11 seats)" });

  const p = game.state.players[cast.studentId];
  p.name = name;
  p.isHuman = true;
  p.goal = cast.goal;
  game.joinOrder.push(cast.studentId);
  // NOTE: joining does NOT start the clock — the professor presses START on
  // /admin when the class is seated. Students see a clear waiting state.
  if (!game.started) game.roundStartedAt = Date.now();
  res.json({ studentId: cast.studentId, role: cast.role, roleCard: cast.roleCard, castingReason: cast.castingReason, goal: cast.goal, scenario: slimScenario });
});

// GET /state/:id → filtered world + everything the client animates.
app.get("/state/:studentId", (req, res) => {
  const id = req.params.studentId;
  if (!game.state.players[id] && id !== "admin") return res.status(404).json({ error: "unknown player" });
  const lastRipple = game.ripples.at(-1)?.[id] ?? null;
  const myRole = game.state.players[id]?.role;
  const myCartel = myRole && game.cartels[myRole]
    ? { price: game.cartels[myRole].price, round: game.cartels[myRole].round, member: game.cartels[myRole].members.has(id) }
    : null;
  res.json({
    ...buildTickState(id),
    you: id,
    scenario: slimScenario,
    banner: game.banner,
    salesTax: game.state.salesTax,
    cartel: myCartel,
    offers: pendingOffers(game, id),
    lastResolution: game.lastResolution,
    ripple: lastRipple,
    roundStartedAt: game.roundStartedAt,
    roundSeconds: scenario.roundSeconds,
    totalRounds: scenario.rounds,
  });
});

// POST /intent {studentId, text} → delegate parses strategy into {price, qty}.
app.post("/intent", async (req, res) => {
  const { studentId, text } = req.body ?? {};
  const p = game.state.players[studentId];
  if (!p) return res.status(404).json({ error: "unknown player" });
  const visibleState = buildTickState(studentId);
  try {
    const out = await runDelegate({
      studentId, intent: text, visibleState,
      role: p.role, tier: tierOf(scenario, p.role),
      ownState: { id: p.id, role: p.role, price: p.price, cash: p.cash, unitCost: p.unitCost, stock: Math.round(totalUnits(p.inventory)) },
      lastAction: p.lastAction,
    });
    res.json({ action: out.action, clarifyingQuestion: out.question ?? null, reply: out.reply ?? null, source: out.source });
  } catch {
    res.json({ action: p.lastAction, clarifyingQuestion: null, source: "error-fallback" });
  }
});

// POST /preview {studentId, action} → project the pending move on the whole town.
// Others hold last action; diff vs "you hold too" — the live butterfly preview.
app.post("/preview", (req, res) => {
  const { studentId, action } = req.body ?? {};
  const p = game.state.players[studentId];
  if (!p) return res.status(404).json({ error: "unknown player" });
  const hold = {};
  for (const q of Object.values(game.state.players)) hold[q.id] = { ...q.lastAction };
  const base = resolveEcosystem(game.state, hold, scenario);
  const proj = resolveEcosystem(game.state, { ...hold, [studentId]: { price: Number(action?.price), qty: Number(action?.qty) } }, scenario);
  const you = proj.state.players[studentId];
  const deltas = {};
  for (const q of Object.keys(game.state.players)) {
    const d = round2(proj.state.players[q].profitRound - base.state.players[q].profitRound);
    if (q !== studentId && Math.abs(d) >= 0.5) deltas[q] = d;
  }
  res.json({
    you: { sold: you.sold, bought: you.bought, profitRound: you.profitRound, folkServed: you.folkServed, mealsRound: you.mealsRound, shortfall: you.shortfall },
    baselineProfit: base.state.players[studentId].profitRound,
    deltas,
    town: {
      welfareDelta: round2(proj.metrics.welfare - base.metrics.welfare),
      pricedOutDelta: proj.metrics.pricedOut - base.metrics.pricedOut,
      folkTrips: proj.folkTrips,
    },
  });
});

// POST /confirm {studentId, action:{price, qty}, intent} → queue for the tick.
app.post("/confirm", (req, res) => {
  const { studentId, action, intent } = req.body ?? {};
  const p = game.state.players[studentId];
  if (!p) return res.status(404).json({ error: "unknown player" });
  if (game.phase !== "collecting") return res.status(409).json({ error: "round not open" });

  game.pendingDecisions[studentId] = { price: Number(action?.price), qty: Number(action?.qty), intent, source: "human" };
  game.confirmed.add(studentId);

  const entry = { round: game.state.round, studentId, role: p.role, intent: String(intent ?? ""), action, visibleState: buildTickState(studentId) };
  game.decisionLog.push(entry);
  appendDecision(entry).catch(() => {});
  res.json({ ok: true, confirmed: [...game.confirmed], round: game.state.round });
});

// POST /offer {studentId, offerId, accept} → shady/cartel choices (graded too).
app.post("/offer", (req, res) => {
  const { studentId, offerId, accept } = req.body ?? {};
  if (!game.state.players[studentId]) return res.status(404).json({ error: "unknown player" });
  const result = resolveOffer(game, studentId, offerId, Boolean(accept));
  if (!result.ok) return res.status(409).json(result);
  const decision = { ...result.decision, role: game.state.players[studentId].role, visibleState: buildTickState(studentId) };
  game.decisionLog.push(decision);
  appendDecision(decision).catch(() => {});
  res.json({ ok: true, offer: result.offer, offers: pendingOffers(game, studentId) });
});

// ── Admin ─────────────────────────────────────────────────────────────────────
app.post("/admin/start", (req, res) => {
  game.started = true;
  game.roundStartedAt = Date.now();
  startRound();
  res.json({ ok: true, round: game.state.round });
});
app.post("/admin/resolve", (req, res) => {
  if (game.phase === "collecting" && game.started) resolveAndAdvance();
  res.json({ ok: true, round: game.state.round, phase: game.phase });
});
app.post("/admin/event", (req, res) => {
  const ev = eventById(scenario, req.body?.id);
  if (!ev) return res.status(404).json({ error: "unknown event id" });
  const banner = applyEvent(game, ev);
  res.json({ ok: true, banner, round: game.state.round });
});
app.post("/admin/shock", (req, res) => {
  const banner = applyEvent(game, eventById(scenario, "frost"));
  res.json({ ok: true, banner, round: game.state.round });
});
app.post("/admin/reset", (req, res) => {
  game = newGame();
  res.json({ ok: true });
});
app.post("/admin/seed", (req, res) => {
  game.seededCohort = seededCohort();
  res.json({ ok: true, players: game.seededCohort.length });
});
app.get("/admin/state", (req, res) => {
  res.json({
    round: game.state.round, phase: game.phase, started: game.started,
    totalRounds: scenario.rounds,
    seats: Object.values(game.state.players).map((p) => ({
      id: p.id, role: p.role, name: p.name, isHuman: p.isHuman, cash: p.cash,
      price: p.price, stock: Math.round(totalUnits(p.inventory)), goal: p.goal,
      profit: p.profitCumulative, goalProgress: p.goalProgress,
    })),
    metrics: game.state.history.at(-1) ?? null,
    joinOrder: game.joinOrder,
    firedEvents: [...game.firedEvents],
    seeded: Boolean(game.seededCohort),
    events: scenario.events.map((e) => ({ id: e.id, round: e.round, title: e.title, emoji: e.emoji })),
  });
});

// ── Grading: cohort assembly shared by /report and /professor ────────────────
function buildCohort() {
  const ids = Object.keys(game.state.players);
  const impactSummary = summarizeImpact(game.ripples, ids);
  const realPlayers = game.joinOrder
    .filter((sid) => game.state.players[sid]?.isHuman)
    .map((sid) => {
      const p = game.state.players[sid];
      return {
        studentId: sid, name: p.name, role: p.role, goal: p.goal,
        goalProgress: p.goalProgress, profit: p.profitCumulative,
        impact: impactSummary[sid],
        decisionLog: game.decisionLog.filter((d) => d.studentId === sid),
      };
    })
    .filter((s) => s.decisionLog.length > 0);
  const seeded = game.seededCohort ?? seededCohort();
  const cohort = [...realPlayers, ...seeded.filter((s) => !realPlayers.some((r) => r.studentId === s.studentId))];
  return { cohort, cascade: game.cascadeLog };
}

app.get("/report/:studentId", async (req, res) => {
  const id = req.params.studentId;
  if (!game.state.players[id]) return res.status(404).json({ error: "unknown player" });
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

app.get("/professor/data", async (req, res) => {
  const { cohort, cascade } = buildCohort();
  try {
    const models = await gradeCohort(cohort, { cascade });
    res.json({
      models,
      overrides: getOverrides(),
      tasks: TASK_IDS,
      dimensions: DIMENSIONS,
      history: game.state.history,
      cascade: game.cascadeLog,
      seats: Object.values(game.state.players).map((p) => ({ id: p.id, role: p.role, name: p.name, isHuman: p.isHuman })),
      scenario: { events: scenario.events, tiers: slimScenario.tiers, goalLabels: GOAL_LABELS },
    });
  } catch (err) {
    res.status(500).json({ error: `grading failed: ${err.message}` });
  }
});

app.post("/professor/override", async (req, res) => {
  const { taskId, studentId, newScore, note } = req.body ?? {};
  if (!taskId || !studentId) return res.status(400).json({ error: "taskId and studentId required" });
  const rec = await saveOverride({ taskId, studentId, newScore, note });
  res.json({ ok: true, override: rec });
});

// ── Static client ─────────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[ripple] Lemonville ecosystem server on http://localhost:${PORT}`);
  console.log(`[ripple] players on the same wifi join at: ${shareUrl()}`);
});
