// Seeded 6-player cohort — a stand-in class so the examiner has percentiles and
// the professor dashboard has clustered misconceptions to show. 12 rounds on the
// Lemonville timeline (FROST R4, TAX R6, SHADY SUPPLIER R8, CARTEL R10).
//
// Each profile encodes deliberate behavior so per-task ratings DIFFER:
//   Frozen Fred never reprices after frost (anchoring) and holds the cartel
//   naively while others defect — the cautionary tale the demo calls out.

export const FROST_ROUND = 4;
export const TAX_ROUND = 6;
export const SUPPLIER_ROUND = 8;
export const CARTEL_ROUND = 10;

const PROFILES = [
  // repriceFrost: $ added after frost · passTax: raises ~$1 after tax · shadyAccept · cartelAccept · cartelDefect
  { studentId: "A", name: "Ada", goal: "max_profit",             base: 5.0, repriceFrost: 2.0, passTax: true,  shadyAccept: false, cartelAccept: true,  cartelDefect: true,  produce: 40, goalProgress: 0.62 },
  { studentId: "B", name: "Bo", goal: "max_market_share",        base: 4.0, repriceFrost: 1.0, passTax: false, shadyAccept: true,  cartelAccept: true,  cartelDefect: true,  produce: 55, goalProgress: 0.71 },
  { studentId: "C", name: "Cai", goal: "survive_shock_cash_80",  base: 6.0, repriceFrost: 1.5, passTax: true,  shadyAccept: false, cartelAccept: false, cartelDefect: false, produce: 30, goalProgress: 0.90 },
  { studentId: "D", name: "Di", goal: "zero_spoilage",           base: 5.5, repriceFrost: 2.5, passTax: true,  shadyAccept: false, cartelAccept: true,  cartelDefect: false, produce: 24, goalProgress: 1.00 },
  { studentId: "E", name: "Eve", goal: "max_profit",             base: 9.0, repriceFrost: 3.0, passTax: false, shadyAccept: true,  cartelAccept: true,  cartelDefect: false, produce: 70, goalProgress: 0.35 },
  { studentId: "F", name: "Frozen Fred", goal: "max_profit",     base: 5.0, repriceFrost: 0.0, passTax: false, shadyAccept: true,  cartelAccept: true,  cartelDefect: false, produce: 45, goalProgress: 0.40 },
];

function priceFor(p, round) {
  const wobble = p.studentId === "F" ? 0 : ((round * 7) % 3) * 0.5 - 0.5; // deterministic; Fred flat
  let price = p.base + wobble;
  if (round >= FROST_ROUND) price += p.repriceFrost;            // supply shock: raise to cover cost
  if (round >= TAX_ROUND && p.passTax) price += 1;              // tax incidence: pass it through
  if (round >= CARTEL_ROUND && p.cartelAccept) {
    price = p.cartelDefect && round > CARTEL_ROUND ? p.base : 8; // cooperate at $8, then defect (undercut)
  }
  return Math.min(15, Math.max(1, Math.round(price * 2) / 2));
}

function visibleStateFor(studentId, round, price, rivalPrice) {
  const news =
    round === FROST_ROUND ? "FROST: input costs doubled"
    : round === TAX_ROUND ? "TAX DECREE: $1 sales tax per crate sold"
    : round === SUPPLIER_ROUND ? "A shady supplier offers cheap crates"
    : round === CARTEL_ROUND ? "Cartel: both price at $8?"
    : null;
  return {
    round,
    growers: [
      { id: studentId, price, cash: 100 + round * 10 },
      { id: studentId === "A" ? "B" : "A", price: rivalPrice },
    ],
    market: { totalDemand: Math.max(0, 140 - 10 * ((price + rivalPrice) / 2)), avgPrice: (price + rivalPrice) / 2, news },
  };
}

export function seededCohort() {
  return PROFILES.map((p) => {
    const decisionLog = [];
    for (let round = 1; round <= 12; round++) {
      const price = priceFor(p, round);
      const rivalPrice = 5 + (round >= FROST_ROUND ? 1.5 : 0);
      let intent = `hold around $${price}`;
      if (round === FROST_ROUND) intent = p.repriceFrost > 0 ? "costs doubled, raise price to protect margin" : "keep price the same, costs will settle";
      else if (round === TAX_ROUND) intent = p.passTax ? "tax hits sales, raise price to pass it on" : "eat the tax, keep price to hold customers";
      else if (round >= CARTEL_ROUND && p.cartelAccept) intent = p.cartelDefect && round > CARTEL_ROUND ? "undercut the cartel to grab share" : "hold the cartel price at $8";
      decisionLog.push({
        round, studentId: p.studentId, intent,
        action: { price, produce: p.produce },
        visibleState: visibleStateFor(p.studentId, round, price, rivalPrice),
      });
    }
    // Event decisions (buy/refuse, accept/refuse) are graded decisions too.
    decisionLog.push({
      round: SUPPLIER_ROUND, studentId: p.studentId,
      intent: p.shadyAccept ? "accepted shady supplier (cheap crates, hidden quality)" : "refused shady supplier (protected reputation)",
      action: { offer: "shady_supplier", accept: p.shadyAccept },
      visibleState: visibleStateFor(p.studentId, SUPPLIER_ROUND, priceFor(p, SUPPLIER_ROUND), 6.5),
    });
    decisionLog.push({
      round: CARTEL_ROUND, studentId: p.studentId,
      intent: p.cartelAccept ? "accepted cartel (cooperate at $8)" : "refused cartel (stay independent)",
      action: { offer: "cartel", accept: p.cartelAccept },
      visibleState: visibleStateFor(p.studentId, CARTEL_ROUND, priceFor(p, CARTEL_ROUND), 6.5),
    });
    return {
      studentId: p.studentId, name: p.name, goal: p.goal, goalProgress: p.goalProgress,
      profit: Math.round((p.base - 2) * p.produce * 2), // rough stand-in profit for the professor table
      decisionLog,
    };
  });
}

export const sampleCascade = [
  { round: 4, cause: "❄️ FROST hit Lemonville", effect: "unit cost doubled for every stand", affected: "all", kind: "shock" },
  { round: 6, cause: "📜 Tax decree: $1/crate sold", effect: "every sale owes the town now", affected: "all", kind: "tax" },
  { round: 8, cause: "F bought 20 shady crates", effect: "put cheap, unverified lemons on the stand", affected: "F", kind: "quality" },
  { round: 11, cause: "NPC defected from the cartel", effect: "undercut Fred who held at $8", affected: "F", kind: "cartel" },
];
