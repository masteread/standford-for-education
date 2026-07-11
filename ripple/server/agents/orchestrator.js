// Orchestrator: casts a joining student into the ecosystem — which SEAT (role in
// the chain) and which GOAL (motivation, never the grade).
// Seats interleave across tiers so the first four humans span four different
// roles (the butterfly demo needs the chain covered). Goals rotate through the
// role's pool; with EverOS memory, the goal is chosen against the student's
// historically weakest dimension instead.

import { getSkillMemory } from "../evermind.js";

// First humans spread across the chain, then fill the remaining seats.
export const SEAT_ORDER = ["F1", "G1", "W1", "R1", "F2", "G2", "R2", "F3", "G3", "W2", "R3"];

export const GOAL_LABELS = {
  max_profit: "Make the most PROFIT by the final round.",
  market_share: "Capture the BIGGEST share of your tier's market.",
  survive_frost: "Survive the frost with cash above $60.",
  zero_spoilage: "End with (almost) ZERO spoiled crates.",
  volume_mover: "Move 100+ crates through your depot.",
  perfect_fill: "Fill 90%+ of the orders that reach you.",
  clean_reputation: "Never get caught selling a bad lemon.",
  serve_meals: "Serve 60+ meals at your café.",
};

const ROLE_BLURB = {
  farmer: ["You grow lemons at $2/crate and set the farm-gate price.", "Depots buy from whichever farm is cheapest (with some loyalty).", "Each round: set your price and how many crates to grow."],
  wholesaler: ["You buy crates from farms and resell them to grocers & cafés.", "Your margin is the spread; your risk is stock that ages in the depot.", "Each round: set your ask price and how much to order from farms."],
  grocer: ["You stock lemons from the depots and retail them to townsfolk.", "24 townsfolk compare your price to their budget — and to your rivals.", "Each round: set your shelf price and how much to order."],
  restaurant: ["You buy crates (1 crate = 4 meals, +$1 prep) and sell meals.", "Diners come if your menu price clears what they're willing to pay.", "Each round: set your meal price and how many crates to order."],
};

// Weakest dimension → the goal (within the assigned role's pool) that trains it.
const GOAL_BY_WEAKNESS = {
  equilibrium_reasoning: "max_profit",
  strategic_anticipation: "market_share",
  information_updating: "survive_frost",
  risk_management: "zero_spoilage",
};

/**
 * Cast a joining student. `takenSeats` = ids already held by humans;
 * `index` = join order (drives goal rotation). Returns null seat if town full.
 */
export async function castStudent({ name, index, takenSeats, game }) {
  const seatId = SEAT_ORDER.find((id) => !takenSeats.includes(id));
  if (!seatId) return null;
  const role = game.state.players[seatId].role;
  const pool = game.scenario.goals[role];

  let goal = pool[index % pool.length];
  let castingReason = "v0: seats interleave across the chain; goal rotates through the role pool";

  const prior = await getSkillMemory(name).catch(() => null);
  const worst = weakestDimension(prior);
  if (worst) {
    const trained = GOAL_BY_WEAKNESS[worst.dim];
    if (trained && pool.includes(trained)) {
      goal = trained;
      castingReason = `memory: weakest dimension is ${worst.dim} (${worst.score}/10 last session) → goal that trains it`;
    }
  }

  const tier = game.scenario.tiers.find((t) => t.role === role);
  return {
    studentId: seatId,
    role,
    goal,
    castingReason,
    roleCard: {
      title: `${tier.emoji} ${tier.label} ${seatId} — ${name}`,
      role,
      lines: ROLE_BLURB[role],
      goal,
      goalText: GOAL_LABELS[goal] ?? goal,
    },
  };
}

function weakestDimension(model) {
  const scores = model?.scores;
  if (!scores) return null;
  let worst = null;
  for (const [dim, detail] of Object.entries(scores)) {
    const score = Number(detail?.score);
    if (Number.isFinite(score) && (!worst || score < worst.score)) worst = { dim, score };
  }
  return worst;
}
