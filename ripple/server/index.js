// A1 — Express server + deterministic tick loop. Owns the world; B's agents plug
// in through the frozen HTTP contract (shared/contracts.md).
//
// Tick model: clients poll GET /state every 2s (no WebSockets — per spec).
// A round resolves when every active human has confirmed OR the 20s timer fires.
// Missing growers (empty slots / single-phone play) are driven by a simple bot.

import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { resolveRound, applyFrost, totalCrates } from "./market.js";
import { relevantTo } from "./cascade.js";
import { castStudent } from "./agents/orchestrator.js";
import { runDelegate } from "./agents/delegate.js";
import { gradeCohort } from "./agents/examiner.js";
import { saveState, appendDecision } from "./butterbase.js";
import { seededCohort, sampleCascade } from "../test/fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(path.join(__dirname, "../shared/scenario.json"), "utf8"));

const SLOT_IDS = ["A", "B"]; // Lemon Wars is a duopoly

// ── Game state ────────────────────────────────────────────────────────────────
function freshGrower(id, name, goal) {
  return {
    id,
    name: name ?? `Grower ${id}`,
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
      A: freshGrower("A", "Grower A"),
      B: freshGrower("B", "Grower B"),
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
  };
}

let game = newGame();

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

// ── Competitive bot for empty slots / single-phone play ───────────────────────
// Deterministic but responsive: reacts to the rival's price so the market feels
// alive (undercuts when beaten, drifts up under a price umbrella, defends margin
// after frost). No RNG — variation comes from the game state itself.
function botDecision(game, id) {
  const gr = game.growers[id];
  const rivalId = Object.keys(game.growers).find((x) => x !== id);
  const rival = game.growers[rivalId];
  const cost = gr.unitCost;
  let price = gr.price;

  if (rival) {
    if (rival.price < gr.price - 0.25) {
      price = Math.max(cost + 1, rival.price - 0.25); // being undercut → follow down, keep margin
    } else if (rival.price > gr.price + 1) {
      price = gr.price + 0.5; // rival raised an umbrella → capture a little more margin
    }
  }
  if (cost > 2) price = Math.max(price, cost + 2); // frost → defend margin
  price = Math.min(15, Math.max(1, Math.round(price * 4) / 4)); // clamp, quarter-dollar

  const produce = Math.min(60, Math.max(15, gr.sold > 0 ? gr.sold + 5 : 25));
  return { price, produce, intent: "(bot) competitive response", source: "bot" };
}

// ── Round resolution + advance ────────────────────────────────────────────────
function resolveAndAdvance() {
  game.phase = "resolving";

  // Fill any missing decision (bots, or humans who didn't confirm → repeat last).
  for (const id of Object.keys(game.growers)) {
    if (!game.pendingDecisions[id]) {
      const gr = game.growers[id];
      game.pendingDecisions[id] = gr.isHuman
        ? { ...gr.lastAction, intent: "(no input) repeat last action", source: "repeat" }
        : botDecision(game, id);
    }
  }

  // Auto-frost on entering the shock round if it wasn't triggered manually.
  if (game.round === scenario.shock.round && !game.frostDone) applyFrost(game);

  resolveRound(game);

  // Persist snapshot (best-effort; never blocks).
  saveState(game.round, buildTickState(game, "admin")).catch(() => {});

  // Remember last actions for repeat/bot logic.
  for (const id of Object.keys(game.growers)) {
    const dec = game.pendingDecisions[id];
    game.growers[id].lastAction = { price: dec.price, produce: dec.produce };
  }

  game.round += 1;
  game.confirmed = new Set();
  game.pendingDecisions = {};
  game.roundStartedAt = Date.now();
  game.phase = game.round > scenario.rounds ? "done" : "collecting";
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

// POST /join {name} → assign the next open slot via B's orchestrator.
app.post("/join", async (req, res) => {
  const name = String(req.body?.name ?? "").trim() || "Anonymous";
  const slot = SLOT_IDS.find((id) => !game.growers[id].isHuman);
  if (!slot) return res.status(409).json({ error: "market full (2 growers max)" });

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

  res.json({ studentId: slot, roleCard: cast.roleCard, castingReason: cast.castingReason, goal: gr.goal });
});

// GET /state/:studentId → TickState filtered to what that student may see.
app.get("/state/:studentId", (req, res) => {
  const id = req.params.studentId;
  if (!game.growers[id] && id !== "admin") return res.status(404).json({ error: "unknown student" });
  res.json({
    ...buildTickState(game, id),
    you: id,
    roundStartedAt: game.roundStartedAt,
    roundSeconds: scenario.roundSeconds,
  });
});

// POST /intent {studentId, text} → B's delegate turns intent into an action (or a question).
app.post("/intent", async (req, res) => {
  const { studentId, text } = req.body ?? {};
  const gr = game.growers[studentId];
  if (!gr) return res.status(404).json({ error: "unknown student" });
  const visibleState = buildTickState(game, studentId);
  const ownState = { id: gr.id, price: gr.price, cash: gr.cash, unitCost: gr.unitCost, inventory: gr.inventory };
  try {
    const out = await runDelegate({ studentId, intent: text, visibleState, ownState, lastAction: gr.lastAction });
    res.json({ action: out.action, clarifyingQuestion: out.question ?? null, source: out.source });
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

// POST /admin/shock → the demo button. Triggers frost immediately at the current round.
app.post("/admin/shock", (req, res) => {
  applyFrost(game);
  res.json({ ok: true, news: game.market.news, round: game.round });
});

// POST /admin/reset → clean slate between rehearsals.
app.post("/admin/reset", (req, res) => {
  game = newGame();
  res.json({ ok: true });
});

// POST /admin/seed → fast-forward a fake 6-player cohort so B's examiner has percentiles.
// Stored on the game so GET /report can grade the joined players against it.
app.post("/admin/seed", (req, res) => {
  game.seededCohort = seededCohort();
  res.json({ ok: true, players: game.seededCohort.length });
});

// GET /admin/state → full unfiltered state for the admin page.
app.get("/admin/state", (req, res) => {
  res.json({
    round: game.round, phase: game.phase, frostDone: game.frostDone,
    growers: game.growers, market: game.market, joinOrder: game.joinOrder,
    cascadeCount: game.cascade.length, seeded: Boolean(game.seededCohort),
  });
});

// GET /report/:studentId → grade the cohort (joined humans + seed) and return this student's model.
app.get("/report/:studentId", async (req, res) => {
  const id = req.params.studentId;
  const gr = game.growers[id];
  if (!gr) return res.status(404).json({ error: "unknown student" });

  // Build cohort: real players who have decisions + the seeded stand-ins for percentiles.
  const realPlayers = game.joinOrder
    .filter((sid) => game.growers[sid]?.isHuman)
    .map((sid) => ({
      studentId: sid,
      name: game.growers[sid].name,
      goal: game.growers[sid].goal,
      goalProgress: game.growers[sid].goalProgress,
      decisionLog: game.decisionLog.filter((d) => d.studentId === sid),
    }))
    .filter((p) => p.decisionLog.length > 0);

  const seeded = game.seededCohort ?? seededCohort();
  const cohort = [...realPlayers, ...seeded.filter((s) => !realPlayers.some((r) => r.studentId === s.studentId))];
  const cascade = game.cascade.length ? game.cascade : sampleCascade;

  try {
    const models = await gradeCohort(cohort, { cascade });
    const model = models[id];
    if (!model) return res.status(202).json({ pending: true, message: "no decisions yet for this student" });
    res.json(model);
  } catch (err) {
    res.status(500).json({ error: `grading failed: ${err.message}` });
  }
});

// ── Static client (single origin → the client's relative fetches just work) ────
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[ripple] world server on http://localhost:${PORT}`));
