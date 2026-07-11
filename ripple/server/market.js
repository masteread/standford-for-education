// A2 + A3 — Market math and cascade instrumentation for Lemon Wars.
// The UI only paints what this computes: formula fidelity > everything.
//
// Formulas (copied exactly from ripple-work-split.md §A2):
//   D      = max(0, 140 - 10 * avgPrice)
//   gap    = priceB - priceA            (>0 → A is cheaper)
//   shift  = clamp(0.2 * gap, -0.5, 0.5)
//   shareA = 0.5 + shift,  shareB = 1 - shareA
//   sold   = min(round(D * share), inventory)   — sell OLDEST crates first (FIFO)
//   costs: produce N crates at unitCost, paid immediately
//   aging: each round age += 1; crates with age > 3 are destroyed (spoilage)

import { push } from "./cascade.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function totalCrates(inventory) {
  return inventory.reduce((s, b) => s + b.crates, 0);
}

/** Total demand at a given average price. */
export function demand(avgPrice, scenario) {
  const { intercept, slope } = scenario.demand;
  return Math.max(0, intercept - slope * avgPrice);
}

/** Market share split — starts 50/50, shifts toward the cheaper grower. */
export function shares(priceA, priceB, scenario) {
  const gap = priceB - priceA; // >0 → A cheaper
  const { coeff, cap } = scenario.switching;
  const shift = clamp(coeff * gap, -cap, cap);
  return { shareA: 0.5 + shift, shareB: 0.5 - shift, shift };
}

/** Sell `qty` crates oldest-first (FIFO). Mutates inventory; returns crates sold. */
function sellFIFO(inventory, qty) {
  let remaining = qty;
  inventory.sort((a, b) => b.age - a.age); // oldest first
  for (const batch of inventory) {
    if (remaining <= 0) break;
    const take = Math.min(batch.crates, remaining);
    batch.crates -= take;
    remaining -= take;
  }
  // drop emptied batches
  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].crates <= 0) inventory.splice(i, 1);
  }
  return qty - remaining;
}

/** Age every crate one round; destroy crates older than the spoilage limit. Returns spoiled count. */
function ageAndSpoil(inventory, spoilAfter) {
  let spoiled = 0;
  for (const b of inventory) b.age += 1;
  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].age > spoilAfter) {
      spoiled += inventory[i].crates;
      inventory.splice(i, 1);
    }
  }
  return spoiled;
}

/** Per-goal progress, 0..1. Shown, never graded. (Engine-computed — see docs OPEN QUESTION.) */
function goalProgress(g, game) {
  switch (g.goal) {
    case "max_profit":
      return clamp((g.cash - game.scenario.startCash) / 200, 0, 1);
    case "max_market_share": {
      const totalSold = Object.values(game.growers).reduce((s, x) => s + x.soldCumulative, 0);
      return totalSold > 0 ? clamp(g.soldCumulative / totalSold, 0, 1) : 0.5;
    }
    case "survive_shock_cash_80":
      return g.cash >= 80 ? 1 : clamp(g.cash / 80, 0, 1);
    case "zero_spoilage":
      return clamp(1 - g.spoiledCumulative / Math.max(1, g.producedCumulative), 0, 1);
    default:
      return 0;
  }
}

/**
 * Resolve the current round using game.pendingDecisions (one {price, produce} per grower).
 * Mutates growers, appends cascade entries, and updates game.market. Returns nothing.
 */
export function resolveRound(game) {
  const s = game.scenario;
  const ids = Object.keys(game.growers); // ["A","B"]
  const round = game.round;

  // 1) Production — paid immediately, new crates enter at age 0.
  for (const id of ids) {
    const g = game.growers[id];
    const dec = game.pendingDecisions[id] ?? { price: g.price, produce: 0 };
    const prevPrice = g.price;
    g.price = clamp(Number(dec.price), s.priceBounds.min, s.priceBounds.max);
    g.produced = clamp(Math.round(Number(dec.produce) || 0), s.produceBounds.min, s.produceBounds.max);
    g.cash -= g.produced * g.unitCost;
    if (g.produced > 0) g.inventory.push({ age: 0, crates: g.produced });
    g.producedCumulative += g.produced;

    // cascade: price change + panic pricing flag
    if (prevPrice != null && g.price !== prevPrice) {
      const dir = g.price > prevPrice ? "raised" : "lowered";
      push(game.cascade, round, `${id} ${dir} price ${prevPrice}→${g.price}`,
        `unit cost is $${g.unitCost}/crate`, id, "price");
      if (prevPrice - g.price > 2) {
        push(game.cascade, round, `${id} panic-discounted ${prevPrice}→${g.price}`,
          "a cut this steep usually starts a price war", id, "panic");
      }
    }
    g._prevPrice = prevPrice;
  }

  // 2) Demand + split.
  const [ia, ib] = ids;
  const avgPrice = (game.growers[ia].price + game.growers[ib].price) / 2;
  const D = demand(avgPrice, s);
  const { shareA, shareB, shift } = shares(game.growers[ia].price, game.growers[ib].price, s);
  // Reputation: townsfolk who got a bad lemon boycott that stand (−penalty) for a few rounds.
  const repMult = (id) => {
    const g = game.growers[id];
    return g.reputationUntil && round <= g.reputationUntil ? 1 - (game.repPenalty ?? 0) : 1;
  };
  const demandBy = {
    [ia]: Math.round(D * shareA * repMult(ia)),
    [ib]: Math.round(D * shareB * repMult(ib)),
  };

  // cascade: buyer switching (attribute movement away from a 50/50 baseline).
  const switchers = Math.round(D * Math.abs(shift));
  if (switchers > 0) {
    const from = shift > 0 ? ib : ia; // shift>0 → A cheaper → buyers move to A, away from B
    const to = shift > 0 ? ia : ib;
    push(game.cascade, round, `${to} was cheaper`, `${switchers} buyers switched ${from}→${to}`, from, "switch");
  }
  // cascade: demand contraction (people who stopped buying because avg price rose).
  if (game.market.totalDemand != null && D < game.market.totalDemand) {
    const stopped = Math.round(game.market.totalDemand - D);
    if (stopped > 0) {
      push(game.cascade, round, `average price rose to $${avgPrice.toFixed(2)}`,
        `${stopped} buyers stopped buying (demand contracted ${Math.round(game.market.totalDemand)}→${Math.round(D)})`,
        "all", "switch");
    }
  }

  // 3) Sell (FIFO), collect revenue, flag elasticity + sellout.
  for (const id of ids) {
    const g = game.growers[id];
    const available = totalCrates(g.inventory);
    const want = demandBy[id];
    const sold = sellFIFO(g.inventory, Math.min(want, available));
    const gross = sold * g.price;
    const tax = (game.salesTax ?? 0) * sold; // per-crate sales tax, remitted by the seller
    const revenue = gross - tax;
    g.sold = sold;
    g.soldCumulative += sold;
    g.cash += revenue;

    if (tax > 0 && sold > 0) {
      push(game.cascade, round, `${id} sold ${sold} crates under the $${game.salesTax}/crate tax`,
        `$${tax} went to the town — net revenue $${gross}→$${revenue} (tax incidence)`, id, "tax");
    }
    if (want > available && available >= 0) {
      push(game.cascade, round, `${id} demand ${want} > stock ${available}`, `${id} sold out`, id, "sellout");
    }
    // Bad-lemon reputation: selling while holding shady stock burns trust for a few rounds.
    if (g.badStockPending && sold > 0) {
      g.reputationUntil = round + (game.repRounds ?? 2);
      g.badStockPending = false;
      push(game.cascade, round, `${id} sold bad lemons to the town`,
        `angry townsfolk 🤢 — ${Math.round((game.repPenalty ?? 0) * 100)}% fewer buyers for ${game.repRounds ?? 2} rounds`, id, "quality");
    }
    // elasticity flag: price up but revenue down vs last round → the core lesson.
    if (g._prevPrice != null && g.price > g._prevPrice && g.prevRevenue != null && revenue < g.prevRevenue) {
      const pricePct = Math.round((100 * (g.price - g._prevPrice)) / g._prevPrice);
      push(game.cascade, round, `${id} revenue $${g.prevRevenue}→$${revenue}`,
        `price +${pricePct}%, revenue DOWN = elastic demand`, id, "elasticity");
    }
    g.prevRevenue = revenue;
  }

  // 4) Age + spoilage on whatever went unsold.
  for (const id of ids) {
    const g = game.growers[id];
    const before = totalCrates(g.inventory);
    const spoiled = ageAndSpoil(g.inventory, s.spoilAfterRounds);
    g.spoiledCumulative += spoiled;
    const carried = totalCrates(g.inventory);
    if (spoiled > 0) {
      push(game.cascade, round, `${id} held ${before} crates past their life`,
        `${spoiled} crates spoiled (destroyed)`, id, "spoilage");
    } else if (carried > 0) {
      push(game.cascade, round, `${id} left ${carried} crates unsold`,
        `they aged one round (closer to spoiling)`, id, "aging");
    }
  }

  // 5) Update market snapshot + goal progress.
  game.market.totalDemand = Math.round(D);
  game.market.avgPrice = Math.round(avgPrice * 100) / 100;
  for (const id of ids) game.growers[id].goalProgress = Math.round(goalProgress(game.growers[id], game) * 100) / 100;
}
