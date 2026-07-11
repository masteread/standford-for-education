// Headless engine test (spec build-order step 1): drive a scripted 12-round
// Lemonville game with two hardcoded policies, fire every event on its round,
// and assert the numbers are sane. Run: node test/test-engine.js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveRound, totalCrates } from "../server/market.js";
import { applyEvent, eventForRound, resolveOffer } from "../server/events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(path.join(__dirname, "../shared/scenario.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? (pass++, console.log(`  ✓ ${msg}`)) : (fail++, console.log(`  ✗ ${msg}`)));

function freshGrower(id, name) {
  return {
    id, name, price: 5, produced: 0, sold: 0,
    inventory: [{ age: 0, crates: scenario.startCrates }],
    cash: scenario.startCash, unitCost: scenario.unitCost, goal: "max_profit", goalProgress: 0,
    soldCumulative: 0, producedCumulative: scenario.startCrates, spoiledCumulative: 0,
    prevRevenue: null, reputationUntil: 0, badStockPending: false, isHuman: true,
    lastAction: { price: 5, produce: 20 },
  };
}

const game = {
  scenario, round: 1, phase: "collecting",
  growers: { A: freshGrower("A", "Ada"), B: freshGrower("B", "Bo") },
  market: { totalDemand: null, avgPrice: null, news: null },
  cascade: [], firedEvents: new Set(), mailbox: {}, banner: null, salesTax: 0, cartel: null, repPenalty: 0, repRounds: 0,
};

// Two hardcoded policies: A holds ~$5, B slightly undercuts. Both produce 40.
function policy(id, round) {
  if (round === 1) return { price: 5, produce: 40 };
  if (id === "A") return { price: 5, produce: 40 };
  return { price: 4.5, produce: 40 }; // B undercuts
}

console.log("Lemonville headless 12-round run\n");
for (let round = 1; round <= scenario.rounds; round++) {
  game.round = round;
  // Fire scripted event at round start.
  const ev = eventForRound(scenario, round);
  if (ev) {
    applyEvent(game, ev);
    console.log(`R${round} EVENT: ${ev.emoji} ${ev.title}`);
    // Auto-respond to offers so downstream rounds exercise the effects:
    // A accepts the shady supplier (bad-luck seed) and the cartel; B refuses both.
    if (ev.type === "supplier_offer") { resolveOffer(game, "A", ev.id, true); resolveOffer(game, "B", ev.id, false); }
    if (ev.type === "cartel_offer") { resolveOffer(game, "A", ev.id, true); resolveOffer(game, "B", ev.id, false); }
  }
  game.pendingDecisions = { A: policy("A", round), B: policy("B", round) };
  resolveRound(game);
  const A = game.growers.A, B = game.growers.B;
  console.log(
    `R${round}: avg $${game.market.avgPrice} D=${game.market.totalDemand} | ` +
    `A $${A.price} sold ${A.sold} cash ${A.cash} inv ${totalCrates(A.inventory)} | ` +
    `B $${B.price} sold ${B.sold} cash ${B.cash} inv ${totalCrates(B.inventory)}`
  );

  if (round === 1) {
    ok(game.market.totalDemand === 90, "R1 hand-check: both $5 → D = 140-10*5 = 90");
    ok(A.sold === 45 && B.sold === 45, "R1 hand-check: 45/45 split at equal prices");
  }
}

console.log("\nAssertions:");
ok(game.growers.A.unitCost === 4, "FROST doubled unit cost to $4");
ok(game.salesTax === 1, "TAX active at $1/crate");
ok(game.cartel && game.cartel.price === 8, "CARTEL formed at $8");
const kinds = new Set(game.cascade.map((c) => c.kind));
for (const k of ["shock", "tax", "quality", "cartel"]) ok(kinds.has(k), `cascade has a "${k}" entry`);
ok(game.cascade.length > 12, `cascade has ${game.cascade.length} entries (a full story)`);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
