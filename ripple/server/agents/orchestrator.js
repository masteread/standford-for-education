// B3/B6 — Orchestrator: assigns role + goal on join.
// v0: round-robin role, goal from the pool (asymmetric by construction with 2 players).
// v1 (EverOS): if a prior skill model exists for this student, cast against
// their historically weakest dimension — explainable in one line. Falls back
// to v0 cleanly when memory is absent or unreachable.

import { getSkillMemory } from "../evermind.js";

export const GOAL_POOL = [
  "max_profit",
  "max_market_share",
  "survive_shock_cash_80",
  "zero_spoilage",
];

export const GOAL_LABELS = {
  max_profit: "Maximize total profit over 12 rounds.",
  max_market_share: "Capture at least 60% market share — profit is secondary.",
  survive_shock_cash_80: "Survive the mid-game shock with cash above $80.",
  zero_spoilage: "End the game with zero spoiled crates.",
};

// Weakest dimension -> the casting that trains it.
const CASTING_BY_WEAKNESS = {
  strategic_anticipation: {
    goal: "max_market_share",
    reason: "low strategic_anticipation → tight duopoly vs a market-share rival",
  },
  equilibrium_reasoning: {
    goal: "max_profit",
    reason: "low equilibrium_reasoning → pure profit goal forces pricing toward market-clearing",
  },
  information_updating: {
    goal: "survive_shock_cash_80",
    reason: "low information_updating → shock-survival goal rewards reacting to news",
  },
  risk_management: {
    goal: "zero_spoilage",
    reason: "low risk_management → spoilage goal forces inventory discipline",
  },
};

function weakestDimension(model) {
  const scores = model?.scores;
  if (!scores) return null;
  let worst = null;
  for (const [dim, detail] of Object.entries(scores)) {
    const score = Number(detail?.score);
    if (!Number.isFinite(score)) continue;
    if (!worst || score < worst.score) worst = { dim, score };
  }
  return worst;
}

/**
 * Decide studentId, goal, and role card for a joining player.
 * `index` is the join order (0-based) — drives round-robin role + v0 goals.
 */
export async function castStudent({ name, index }) {
  const studentId = String.fromCharCode(65 + (index % 26)); // A, B, C...

  let goal = GOAL_POOL[index % GOAL_POOL.length];
  let castingReason = "v0: round-robin role + rotating goal (no prior skill memory)";

  const prior = await getSkillMemory(studentId).catch(() => null);
  const worst = weakestDimension(prior);
  if (worst && CASTING_BY_WEAKNESS[worst.dim]) {
    goal = CASTING_BY_WEAKNESS[worst.dim].goal;
    castingReason = `memory: ${CASTING_BY_WEAKNESS[worst.dim].reason} (scored ${worst.score}/10 last session)`;
  }

  return {
    studentId,
    name,
    goal,
    castingReason,
    roleCard: roleCard({ studentId, name, goal }),
  };
}

/** The 3-line role card shown on join (goal in large type on the client). */
export function roleCard({ studentId, name, goal }) {
  return {
    title: `Grower ${studentId} — ${name}`,
    lines: [
      "You grow lemons. Cost: $2/crate. Start: $100 cash, 20 crates.",
      "Lemons spoil after 3 rounds. Your rival is the other grower.",
      "Each round: set a price and how many crates to produce.",
    ],
    goal,
    goalText: GOAL_LABELS[goal] ?? goal,
  };
}
