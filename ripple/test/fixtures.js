// Seeded 6-player cohort for B-side tests (stand-in for A's seed script).
// 12 rounds each, frost at round 8. Player "F" (Frozen Fred) never reprices
// after frost — the examiner must flag anchoring on them.

export const FROST_ROUND = 8;

const PROFILES = [
  { studentId: "A", name: "Ada", goal: "max_profit", base: 5, frostBump: 2, produce: 40, goalProgress: 0.62 },
  { studentId: "B", name: "Bo", goal: "max_market_share", base: 4, frostBump: 1, produce: 50, goalProgress: 0.71 },
  { studentId: "C", name: "Cai", goal: "survive_shock_cash_80", base: 6, frostBump: 1.5, produce: 30, goalProgress: 0.9 },
  { studentId: "D", name: "Di", goal: "zero_spoilage", base: 5.5, frostBump: 2.5, produce: 25, goalProgress: 1.0 },
  { studentId: "E", name: "Eve", goal: "max_profit", base: 9, frostBump: 3, produce: 70, goalProgress: 0.35 },
  { studentId: "F", name: "Frozen Fred", goal: "max_profit", base: 5, frostBump: 0, produce: 45, goalProgress: 0.4 },
];

function visibleStateFor(studentId, round, price, rivalPrice) {
  return {
    round,
    growers: [
      { id: studentId, price, cash: 100 + round * 10 },
      { id: studentId === "A" ? "B" : "A", price: rivalPrice },
    ],
    market: {
      totalDemand: Math.max(0, 140 - 10 * ((price + rivalPrice) / 2)),
      avgPrice: (price + rivalPrice) / 2,
      news: round === FROST_ROUND ? "FROST: input costs doubled" : null,
    },
  };
}

export function seededCohort() {
  return PROFILES.map((p) => {
    const decisionLog = [];
    for (let round = 1; round <= 12; round++) {
      const frost = round >= FROST_ROUND;
      const wobble = p.studentId === "F" ? 0 : ((round * 7) % 3) * 0.5 - 0.5; // deterministic, Fred flat
      const price = Math.min(15, Math.max(1, p.base + (frost ? p.frostBump : 0) + wobble));
      const rivalPrice = 5 + (frost ? 1.5 : 0);
      decisionLog.push({
        round,
        studentId: p.studentId,
        intent:
          round === FROST_ROUND && p.frostBump > 0
            ? "costs doubled, raise price to protect margin"
            : `hold around $${price}`,
        action: { price, produce: p.produce },
        visibleState: visibleStateFor(p.studentId, round, price, rivalPrice),
      });
    }
    return { studentId: p.studentId, name: p.name, goal: p.goal, goalProgress: p.goalProgress, decisionLog };
  });
}

export const sampleCascade = [
  { round: 7, cause: "A raised price 5→7", effect: "18 buyers switched A→B", affected: "B" },
  { round: 8, cause: "FROST", effect: "unit cost doubled for all growers", affected: "all" },
  { round: 9, cause: "E overproduced 70 crates", effect: "22 unsold crates aging", affected: "E" },
];
