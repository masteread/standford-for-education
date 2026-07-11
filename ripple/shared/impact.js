// Butterfly attribution — REAL counterfactuals, not narration.
// For each player who moved this round, re-run the identical round with their move
// replaced by "hold last action" and diff the two towns. Every number in a
// "Your Ripples" card or the ecosystem-impact score is a diff of two engine runs.
// This is only possible because resolveEcosystem is pure + deterministic.

import { resolveEcosystem } from "./ecosystem.js";

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Compute per-player ripple attribution for one round.
 * `prevState` is the state BEFORE the round; `decisions` what everyone submitted;
 * `base` the already-computed actual resolution (passed in so we don't run twice).
 * Returns { playerId: {moved, deltas: {otherId: Δprofit}, welfareDelta,
 *           consumerSurplusDelta, pricedOutDelta, reach} }.
 */
export function computeImpact(prevState, decisions, scenario, base) {
  const impact = {};
  for (const [id, p] of Object.entries(prevState.players)) {
    const hold = { price: p.lastAction.price, qty: p.lastAction.qty };
    const d = decisions[id];
    const moved = d != null && (round2(Number(d.price)) !== round2(hold.price) || Math.round(Number(d.qty)) !== Math.round(hold.qty));
    if (!moved) {
      impact[id] = { moved: false, deltas: {}, welfareDelta: 0, consumerSurplusDelta: 0, pricedOutDelta: 0, reach: 0 };
      continue;
    }
    const alt = resolveEcosystem(prevState, { ...decisions, [id]: hold }, scenario);
    const deltas = {};
    let reach = 0;
    for (const q of Object.keys(prevState.players)) {
      const delta = round2(base.state.players[q].profitRound - alt.state.players[q].profitRound);
      deltas[q] = delta;
      if (q !== id && Math.abs(delta) >= 0.5) reach++;
    }
    impact[id] = {
      moved: true,
      deltas,
      welfareDelta: round2(base.metrics.welfare - alt.metrics.welfare),
      consumerSurplusDelta: round2(base.metrics.consumerSurplus - alt.metrics.consumerSurplus),
      pricedOutDelta: base.metrics.pricedOut - alt.metrics.pricedOut,
      reach,
    };
  }
  return impact;
}

/**
 * Fold a game's per-round impacts into one ecosystem-impact score per player.
 * Score = cumulative town-welfare delta caused by their moves, plus how far the
 * ripples reached. Kept separate from decision quality on purpose: a ruthless
 * profit-maximizer can have stellar quality and negative impact — that contrast
 * is a teaching moment, not a bug.
 */
export function summarizeImpact(roundImpacts, playerIds) {
  const out = {};
  for (const id of playerIds) {
    let welfare = 0, surplus = 0, pricedOut = 0, maxReach = 0, moves = 0;
    const perPlayer = {};
    for (const round of roundImpacts) {
      const r = round?.[id];
      if (!r?.moved) continue;
      moves++;
      welfare += r.welfareDelta;
      surplus += r.consumerSurplusDelta;
      pricedOut += r.pricedOutDelta;
      maxReach = Math.max(maxReach, r.reach);
      for (const [q, d] of Object.entries(r.deltas)) if (q !== id) perPlayer[q] = round2((perPlayer[q] ?? 0) + d);
    }
    out[id] = {
      welfareDelta: round2(welfare),
      consumerSurplusDelta: round2(surplus),
      pricedOutDelta: pricedOut,
      maxReach,
      moves,
      perPlayer,
    };
  }
  return out;
}
