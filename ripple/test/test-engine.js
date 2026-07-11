// Headless ecosystem test (spec v4 build-order step 1): purity, determinism,
// emergent demand, the butterfly counterfactual, spoilage, and a full 12-round
// run with simple policies. Run: node test/test-engine.js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initialState, resolveEcosystem, seatList, totalUnits } from "../shared/ecosystem.js";
import { computeImpact, summarizeImpact } from "../shared/impact.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(path.join(__dirname, "../shared/scenario.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? (pass++, console.log(`  ✓ ${msg}`)) : (fail++, console.log(`  ✗ ${msg}`)));

const holdAll = (state) =>
  Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p.lastAction }]));

// ── Setup ─────────────────────────────────────────────────────────────────────
console.log("Lemonville ecosystem — headless checks\n");
const s0 = initialState(scenario);
ok(Object.keys(s0.players).length === 11, "11 seats (3F + 2W + 3G + 3R)");
ok(s0.folk.length === scenario.folk.count, `${scenario.folk.count} townsfolk`);
ok(seatList(scenario).map((x) => x.id).join(",") === "F1,F2,F3,W1,W2,G1,G2,G3,R1,R2,R3", "seat ids stable");

// ── Purity + determinism ──────────────────────────────────────────────────────
const frozen = JSON.stringify(s0);
const r1a = resolveEcosystem(s0, holdAll(s0), scenario);
const r1b = resolveEcosystem(s0, holdAll(s0), scenario);
ok(JSON.stringify(s0) === frozen, "resolveEcosystem never mutates its input");
ok(JSON.stringify(r1a) === JSON.stringify(r1b), "deterministic: same inputs → identical outputs");

// ── Round 1 basic flow ────────────────────────────────────────────────────────
const t = r1a.trades;
ok(t.some((x) => x.from.startsWith("F") && x.to.startsWith("W")), "farms sold to depots");
ok(t.some((x) => x.from.startsWith("W") && (x.to.startsWith("G") || x.to.startsWith("R"))), "depots sold to shops");
const bought = r1a.folkTrips.filter((x) => x.to);
ok(bought.some((x) => x.kind === "grocery"), "townsfolk bought groceries");
ok(bought.some((x) => x.kind === "meal"), "townsfolk ate out");
const anyNaN = Object.values(r1a.state.players).some((p) => !Number.isFinite(p.cash) || totalUnits(p.inventory) < 0);
ok(!anyNaN, "no NaN cash / negative inventory");

// Money conservation: business profit == folk money in − grow costs − prep − tax.
const folkMoneyIn = bought.reduce((sum, x) => sum + x.price * (x.qty ?? 1), 0);
const growCost = Object.values(s0.players)
  .filter((p) => p.role === "farmer")
  .reduce((sum, p) => {
    const grown = r1a.state.players[p.id].handledCumulative - p.handledCumulative;
    return sum + grown * p.unitCost;
  }, 0);
const meals = bought.filter((x) => x.kind === "meal").length;
const expected = folkMoneyIn - growCost - meals * 1 - 0; // prep $1/meal, no tax yet
ok(Math.abs(r1a.metrics.totalProfit - expected) < 0.5, `money conserved (profit ${r1a.metrics.totalProfit} ≈ ${Math.round(expected)})`);

// ── Emergent demand curve: raise all retail prices → fewer buyers ─────────────
const cheapD = holdAll(s0);
const dearD = holdAll(s0);
for (const g of ["G1", "G2", "G3"]) { cheapD[g] = { price: 5, qty: 10 }; dearD[g] = { price: 13, qty: 10 }; }
const cheap = resolveEcosystem(s0, cheapD, scenario);
const dear = resolveEcosystem(s0, dearD, scenario);
const buyersAt = (r) => r.folkTrips.filter((x) => x.kind === "grocery" && x.to).length;
ok(buyersAt(cheap) > buyersAt(dear), `demand slopes down emergently ($5 → ${buyersAt(cheap)} buyers, $13 → ${buyersAt(dear)})`);
ok(dear.metrics.pricedOut > cheap.metrics.pricedOut, "high prices price folk out");

// ── Butterfly: one farmer's price hike ripples through the chain ──────────────
const base = resolveEcosystem(s0, holdAll(s0), scenario);
const hikeD = holdAll(s0);
hikeD.F1 = { price: 9, qty: 14 }; // F1 doubles its ask
const hike = resolveEcosystem(s0, hikeD, scenario);
ok(hike.state.players.F1.sold < base.state.players.F1.sold, "depots switched away from the expensive farm");
const impact = computeImpact(s0, hikeD, scenario, hike);
ok(impact.F1.moved && impact.W1.moved === false, "impact marks who actually moved");
ok(impact.F1.reach >= 1, `F1's hike reached ${impact.F1.reach} other players (counterfactual diff)`);
ok(Object.values(impact.F1.deltas).some((d) => d !== 0), "nonzero downstream profit deltas");

// ── Spoilage: a hoarding wholesaler destroys value downstream of the farm ─────
let sSpoil = initialState(scenario);
for (let r = 1; r <= 5; r++) {
  const d = holdAll(sSpoil);
  d.W1 = { price: 12, qty: 30 }; // buy heavy, price self out of resale
  const res = resolveEcosystem(sSpoil, d, scenario);
  sSpoil = res.state;
  sSpoil.round += 1;
}
ok(sSpoil.players.W1.spoiledCumulative > 0, `hoarded crates spoiled (W1 lost ${sSpoil.players.W1.spoiledCumulative})`);

// ── Full game run (scenario.rounds) with gentle adaptive policies ─────────────
let s = initialState(scenario);
const impacts = [];
console.log(`\n${scenario.rounds}-round run:`);
for (let round = 1; round <= scenario.rounds; round++) {
  const decisions = {};
  for (const p of Object.values(s.players)) {
    // naive adaptive policy: sold out → nudge price up; sat on stock → nudge down
    const stock = totalUnits(p.inventory);
    let price = p.price + (p.sold > 0 && stock < 2 ? 0.5 : stock > 15 ? -0.5 : 0);
    decisions[p.id] = { price, qty: p.lastAction.qty };
  }
  const frostRound = scenario.events.find((e) => e.type === "frost")?.round ?? 4;
  if (round === frostRound) for (const f of ["F1", "F2", "F3"]) s.players[f].unitCost = 4; // frost, applied like events.js will
  if (round === frostRound) s.frostRound = frostRound;
  if (round === 6) s.salesTax = 1;
  const res = resolveEcosystem(s, decisions, scenario);
  impacts.push(computeImpact(s, decisions, scenario, res));
  s = res.state;
  s.round += 1;
  const m = res.metrics;
  console.log(
    `  R${String(round).padStart(2)}: welfare $${String(m.welfare).padStart(7)} | CS $${String(m.consumerSurplus).padStart(6)} | ` +
    `pricedOut ${String(m.pricedOut).padStart(2)} | avg F$${m.avgPrice.farmer} W$${m.avgPrice.wholesaler} G$${m.avgPrice.grocer} R$${m.avgPrice.restaurant} | trades ${res.trades.length}`
  );
}
ok(s.history.length === scenario.rounds, `${scenario.rounds} rounds of town history recorded`);
ok(s.history.every((h) => Number.isFinite(h.welfare)), "welfare finite every round");
const summary = summarizeImpact(impacts, Object.keys(s.players));
ok(Object.keys(summary).length === 11, "impact summary covers all players");
console.log(`  sample impact summary F1: ${JSON.stringify(summary.F1)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
