// Seeded 8-player cohort spanning all four tiers — a stand-in class so the
// examiner has percentiles and the professor dashboard has clustered
// misconceptions to show, even before a real class plays. 12 rounds on the
// Lemonville timeline (FROST R4, TAX R6, SHADY SUPPLIER R8, CARTEL R10).
//
// Profiles encode deliberate behavior so ratings DIFFER: Frozen Fred never
// reprices after frost (anchoring) and holds the cartel while peers defect.

export const FROST_ROUND = 4;
export const TAX_ROUND = 6;
export const SUPPLIER_ROUND = 8;
export const CARTEL_ROUND = 10;

const CARTEL_PRICE = { farmer: 5, wholesaler: 8, grocer: 10, restaurant: 16 };
const QTY = { farmer: 14, wholesaler: 20, grocer: 10, restaurant: 4 };

const PROFILES = [
  { studentId: "sF1", name: "Ada", role: "farmer", goal: "max_profit", base: 3.0, repriceFrost: 1.5, passTax: false, shadyAccept: false, cartelAccept: true, cartelDefect: true, heavyQty: false, goalProgress: 0.62, impactWelfare: 35 },
  { studentId: "sF2", name: "Bo", role: "farmer", goal: "market_share", base: 2.5, repriceFrost: 1.0, passTax: false, shadyAccept: true, cartelAccept: true, cartelDefect: true, heavyQty: true, goalProgress: 0.71, impactWelfare: -12 },
  { studentId: "sW1", name: "Cai", role: "wholesaler", goal: "perfect_fill", base: 5.0, repriceFrost: 1.5, passTax: false, shadyAccept: false, cartelAccept: false, cartelDefect: false, heavyQty: false, goalProgress: 0.9, impactWelfare: 48 },
  { studentId: "sG1", name: "Di", role: "grocer", goal: "zero_spoilage", base: 7.0, repriceFrost: 2.0, passTax: true, shadyAccept: false, cartelAccept: true, cartelDefect: false, heavyQty: false, goalProgress: 1.0, impactWelfare: 20 },
  { studentId: "sG2", name: "Eve", role: "grocer", goal: "max_profit", base: 11.0, repriceFrost: 2.0, passTax: false, shadyAccept: true, cartelAccept: true, cartelDefect: false, heavyQty: true, goalProgress: 0.35, impactWelfare: -55 },
  { studentId: "sG3", name: "Frozen Fred", role: "grocer", goal: "max_profit", base: 7.0, repriceFrost: 0.0, passTax: false, shadyAccept: true, cartelAccept: true, cartelDefect: false, heavyQty: false, goalProgress: 0.4, impactWelfare: -8 },
  { studentId: "sR1", name: "Gus", role: "restaurant", goal: "serve_meals", base: 11.0, repriceFrost: 1.0, passTax: true, shadyAccept: false, cartelAccept: false, cartelDefect: false, heavyQty: false, goalProgress: 0.8, impactWelfare: 26 },
  { studentId: "sR2", name: "Hana", role: "restaurant", goal: "clean_reputation", base: 13.0, repriceFrost: 1.5, passTax: true, shadyAccept: false, cartelAccept: true, cartelDefect: true, heavyQty: false, goalProgress: 1.0, impactWelfare: 15 },
];

function priceFor(p, round) {
  const wobble = p.name === "Frozen Fred" ? 0 : ((round * 7) % 3) * 0.5 - 0.5;
  let price = p.base + wobble;
  if (round >= FROST_ROUND) price += p.repriceFrost;
  if (round >= TAX_ROUND && p.passTax) price += 1;
  if (round >= CARTEL_ROUND && p.cartelAccept) {
    const cp = CARTEL_PRICE[p.role];
    price = p.cartelDefect && round > CARTEL_ROUND ? cp - 1.5 : cp;
  }
  return Math.max(1, Math.round(price * 2) / 2);
}

function visibleStateFor(p, round, price) {
  const news =
    round === FROST_ROUND ? "FROST: growing cost doubled at every farm"
    : round === TAX_ROUND ? "TAX DECREE: $1 per crate or meal sold to townsfolk"
    : round === SUPPLIER_ROUND ? "A shady supplier is offering dirt-cheap crates"
    : round === CARTEL_ROUND ? "Cartel whispers in every tier" : null;
  // two same-role peers + a supplier, enough signal for the graders
  const peerBase = { farmer: 3, wholesaler: 5, grocer: 7.5, restaurant: 12 }[p.role];
  const shift = round >= FROST_ROUND ? 1 : 0;
  return {
    round,
    players: [
      { id: p.studentId, role: p.role, price, stock: 8 },
      { id: `${p.role}-peer1`, role: p.role, price: peerBase + shift, stock: 6 },
      { id: `${p.role}-peer2`, role: p.role, price: peerBase + shift + 0.5, stock: 9 },
      { id: "supplier", role: p.role === "wholesaler" ? "farmer" : "wholesaler", price: (p.role === "wholesaler" ? 3 : 5) + shift, stock: 12 },
    ],
    market: { news },
  };
}

export function seededCohort() {
  return PROFILES.map((p) => {
    const decisionLog = [];
    for (let round = 1; round <= 12; round++) {
      const price = priceFor(p, round);
      let intent = `hold around $${price}`;
      if (round === FROST_ROUND) intent = p.repriceFrost > 0 ? "costs are rippling down the chain, reprice to protect margin" : "keep price the same, costs will settle";
      else if (round === TAX_ROUND) intent = p.passTax ? "pass the tax through to the town" : "eat the tax, keep customers";
      else if (round >= CARTEL_ROUND && p.cartelAccept) intent = p.cartelDefect && round > CARTEL_ROUND ? "undercut the cartel to grab share" : `hold the cartel price at $${CARTEL_PRICE[p.role]}`;
      decisionLog.push({
        round, studentId: p.studentId, role: p.role, intent,
        action: { price, qty: p.heavyQty ? Math.round(QTY[p.role] * 1.8) : QTY[p.role] },
        visibleState: visibleStateFor(p, round, price),
      });
    }
    decisionLog.push({
      round: SUPPLIER_ROUND, studentId: p.studentId, role: p.role,
      intent: p.shadyAccept ? "accepted shady supplier (cheap crates, hidden quality)" : "refused shady supplier (protected reputation)",
      action: { offer: "shady_supplier", accept: p.shadyAccept },
      visibleState: visibleStateFor(p, SUPPLIER_ROUND, priceFor(p, SUPPLIER_ROUND)),
    });
    decisionLog.push({
      round: CARTEL_ROUND, studentId: p.studentId, role: p.role,
      intent: p.cartelAccept ? `accepted the ${p.role} cartel` : "refused cartel (stay independent)",
      action: { offer: "cartel", accept: p.cartelAccept },
      visibleState: visibleStateFor(p, CARTEL_ROUND, priceFor(p, CARTEL_ROUND)),
    });
    return {
      studentId: p.studentId, name: p.name, role: p.role, goal: p.goal, goalProgress: p.goalProgress,
      profit: Math.round((p.base - 2) * 40 + p.impactWelfare),
      impact: { welfareDelta: p.impactWelfare, consumerSurplusDelta: Math.round(p.impactWelfare * 0.6), pricedOutDelta: p.impactWelfare < 0 ? 4 : -1, maxReach: Math.abs(p.impactWelfare) > 30 ? 7 : 3, moves: 9, perPlayer: {} },
      decisionLog,
    };
  });
}

export const sampleCascade = [
  { round: 4, cause: "❄️ FROST hit the lemon groves", effect: "growing cost doubled at every farm", affected: "all", source: null, kind: "shock" },
  { round: 5, cause: "F1 raised crate price $3 → $4.5", effect: "every farmer-buyer re-evaluates where to shop", affected: "all", source: "F1", kind: "price" },
  { round: 6, cause: "📜 Retail tax decree: $1/sale", effect: "grocers and cafés remit — absorb or pass through?", affected: "all", source: null, kind: "tax" },
  { round: 8, cause: "sG2 bought 10 shady crates", effect: "cheap, unverified stock is on their shelves now", affected: "sG2", source: "sG2", kind: "quality" },
  { round: 11, cause: "W1 switched supplier F1 → F2", effect: "F2 was cheaper — F1 lost the order", affected: "F1", source: "F2", kind: "switch" },
];
