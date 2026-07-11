// The Lemonville ecosystem engine — a PURE function over the whole supply chain.
// resolveEcosystem(state, decisions, scenario) → { state, trades, cascade, folkTrips, metrics }
// No mutation of inputs, no Math.random (seeded hashes only). Purity is load-bearing:
// the same module powers the server tick, the live move preview, AND the
// counterfactual butterfly attribution in impact.js (re-run a round minus one move
// and diff the town — that only works if this function is deterministic).
//
// Chain: farmers → wholesalers → {grocers, restaurants} → 24 simulated townsfolk.
// Aggregate demand slopes down EMERGENTLY from heterogeneous willingness-to-pay;
// there is no D = a − bP formula anywhere in this file.

export const ROLE_PREFIX = { farmer: "F", wholesaler: "W", grocer: "G", restaurant: "R" };
export const ROLES = ["farmer", "wholesaler", "grocer", "restaurant"];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;
const sum = (a) => a.reduce((s, x) => s + x, 0);

export const tierOf = (scenario, role) => scenario.tiers.find((t) => t.role === role);
export const totalUnits = (inv) => round2(sum(inv.map((b) => b.units)));

/** Deterministic unit float in [0,1) from a string seed. */
export function seededUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** All seats: F1..F3, W1..W2, G1..G3, R1..R3. */
export function seatList(scenario) {
  const seats = [];
  for (const t of scenario.tiers)
    for (let i = 1; i <= t.seats; i++) seats.push({ id: ROLE_PREFIX[t.role] + i, role: t.role });
  return seats;
}

const FOLK_EMOJI = ["🧑‍🌾", "👵", "🧒", "🧓", "👩‍🦰", "🧔", "👦", "👩", "🧑", "👴", "👧", "🧑‍🦱", "👨‍🦰", "👩‍🌾", "👨‍🦳", "👱‍♀️"];

/** 24 townsfolk with fixed, heterogeneous willingness-to-pay (the demand curve, embodied). */
export function makeFolk(scenario) {
  const { count, wtpGrocery, wtpMeal, seed } = scenario.folk;
  return Array.from({ length: count }, (_, i) => {
    const jg = seededUnit(`folk-${seed}-${i}-g`);
    const jm = seededUnit(`folk-${seed}-${i}-m`);
    return {
      id: `folk${i}`,
      emoji: FOLK_EMOJI[i % FOLK_EMOJI.length],
      // even spread + jitter; meal WTP permuted so rich shoppers ≠ rich diners
      wtpGrocery: round2(wtpGrocery.min + ((wtpGrocery.max - wtpGrocery.min) * (i + jg)) / count),
      wtpMeal: round2(wtpMeal.min + ((wtpMeal.max - wtpMeal.min) * (((i * 7) % count) + jm)) / count),
      lastGrocer: null,
      lastRestaurant: null,
    };
  });
}

export function freshPlayer(seat, scenario) {
  const tier = tierOf(scenario, seat.role);
  return {
    id: seat.id,
    role: seat.role,
    name: `${tier.label} ${seat.id}`,
    isHuman: false,
    cash: tier.startCash,
    price: tier.defaultPrice,
    qty: tier.defaultQty,
    inventory: [{ age: 0, units: tier.startCrates, bad: false }],
    unitCost: tier.unitCost ?? null,
    reputationUntil: 0,
    repHits: 0,
    lastSupplier: null,
    lastAction: { price: tier.defaultPrice, qty: tier.defaultQty },
    goal: "max_profit",
    goalProgress: 0,
    // per-round outputs (overwritten each resolve)
    sold: 0,
    bought: 0,
    shortfall: 0,
    folkServed: 0,
    mealsRound: 0,
    profitRound: 0,
    prevRevenue: null,
    // cumulative bookkeeping (goals + report)
    profitCumulative: 0,
    soldCumulative: 0,
    boughtCumulative: 0,
    spoiledCumulative: 0,
    handledCumulative: tier.startCrates,
    ordersReceived: 0,
    ordersFilled: 0,
    mealsServed: 0,
    folkServedCumulative: 0,
    stockoutRounds: 0,
  };
}

export function initialState(scenario) {
  const players = {};
  for (const seat of seatList(scenario)) players[seat.id] = freshPlayer(seat, scenario);
  return { round: 1, salesTax: 0, frostRound: null, players, folk: makeFolk(scenario), history: [] };
}

/** Sell `qty` units oldest-first. Mutates inv. Returns moved batches (age + bad preserved). */
function takeFIFO(inv, qty) {
  inv.sort((a, b) => b.age - a.age);
  const moved = [];
  let left = qty;
  for (const b of inv) {
    if (left <= 0.001) break;
    const take = Math.min(b.units, left);
    b.units = round2(b.units - take);
    left = round2(left - take);
    moved.push({ age: b.age, units: take, bad: b.bad ?? false });
  }
  for (let i = inv.length - 1; i >= 0; i--) if (inv[i].units <= 0.001) inv.splice(i, 1);
  return moved;
}

const badIn = (batches) => round2(sum(batches.filter((b) => b.bad).map((b) => b.units)));

/**
 * Clear one business-to-business market: buyers pick the cheapest seller subject to
 * loyalty friction (Bertrand competition with switching costs); pro-rata rationing
 * when a seller sells out; unfilled demand spills to the next-cheapest seller.
 */
function clearMarket({ buyers, sellers, round, repFactor, loyaltyGap, trades, cascade }) {
  const eff = (sl) => sl.price * (sl.reputationUntil >= round ? repFactor : 1);
  for (const sl of sellers) sl._demandSeen = 0;
  for (const b of buyers) {
    b._remaining = b.qty;
    b._filledBy = {};
  }
  let guard = 0;
  while (guard++ < 8) {
    const targets = new Map();
    for (const b of buyers) {
      if (b._remaining <= 0 || b.cash <= 0) continue;
      const open = sellers.filter((sl) => totalUnits(sl.inventory) > 0.001);
      if (!open.length) continue;
      let best = open.reduce((a, c) => (eff(c) < eff(a) ? c : a));
      const last = open.find((sl) => sl.id === b.lastSupplier);
      if (last && eff(last) <= eff(best) + loyaltyGap) best = last; // loyalty: only switch for a real discount
      if (!targets.has(best.id)) targets.set(best.id, []);
      targets.get(best.id).push(b);
    }
    if (!targets.size) break;
    let progress = false;
    for (const [sellerId, list] of targets) {
      const seller = sellers.find((sl) => sl.id === sellerId);
      const avail = totalUnits(seller.inventory);
      const totalWant = sum(list.map((b) => b._remaining));
      if (guard === 1) seller._demandSeen += totalWant;
      for (const b of list) {
        const fair = totalWant <= avail ? b._remaining : Math.floor((b._remaining * avail) / totalWant);
        const affordable = Math.floor(b.cash / seller.price);
        const qty = Math.max(0, Math.min(b._remaining, fair, affordable));
        if (qty <= 0) {
          if (affordable <= 0) b._remaining = 0; // out of cash — stop trying
          continue;
        }
        const moved = takeFIFO(seller.inventory, qty);
        b.inventory.push(...moved);
        const money = round2(qty * seller.price);
        b.cash = round2(b.cash - money);
        seller.cash = round2(seller.cash + money);
        seller.sold += qty;
        seller.soldCumulative += qty;
        seller.ordersFilled += qty;
        b.bought += qty;
        b.boughtCumulative += qty;
        b.handledCumulative += qty;
        b._remaining -= qty;
        b._filledBy[seller.id] = (b._filledBy[seller.id] ?? 0) + qty;
        const bad = badIn(moved);
        if (bad > 0) seller._badSold = (seller._badSold ?? 0) + bad;
        trades.push({ round, from: seller.id, to: b.id, qty, price: seller.price, bad: bad > 0 });
        progress = true;
      }
    }
    if (!progress) break;
  }
  for (const sl of sellers) sl.ordersReceived += sl._demandSeen ?? 0;
  for (const b of buyers) {
    b.shortfall = Math.max(0, b._remaining ?? 0);
    if (b.shortfall > 0 && b.qty > 0) {
      cascade.push({
        round, kind: "shortage", source: null, affected: b.id,
        cause: `${b.id} ordered ${b.qty} crates but only ${b.qty - b.shortfall} arrived`,
        effect: "upstream sold out — thin shelves downstream next",
      });
    }
    // main supplier this round (for loyalty + switching stories)
    const main = Object.entries(b._filledBy).sort((x, y) => y[1] - x[1])[0];
    if (main) {
      if (b.lastSupplier && b.lastSupplier !== main[0]) {
        cascade.push({
          round, kind: "switch", source: main[0], affected: b.lastSupplier,
          cause: `${b.id} switched supplier ${b.lastSupplier} → ${main[0]}`,
          effect: `${main[0]} was cheaper — ${b.lastSupplier} lost the order`,
        });
      }
      b.lastSupplier = main[0];
    }
  }
}

/** Townsfolk choose a shop: cheapest effective price with loyalty friction, if WTP clears. */
function shopChoice(folkLast, shops, round, repFactor, loyaltyGap, minStock) {
  const open = shops.filter((s) => totalUnits(s.inventory) >= minStock);
  if (!open.length) return { shop: null, reason: "empty" };
  const eff = (s) => s.price * (s.reputationUntil >= round ? repFactor : 1);
  let best = open.reduce((a, c) => (eff(c) < eff(a) ? c : a));
  const last = open.find((s) => s.id === folkLast);
  if (last && eff(last) <= eff(best) + loyaltyGap) best = last;
  return { shop: best, reason: null };
}

/** Per-goal progress, 0..1. Motivation display — never the grade. */
function goalProgress(p, state, scenario) {
  const target = scenario.profitTarget[p.role] ?? 120;
  switch (p.goal) {
    case "max_profit":
      return clamp(p.profitCumulative / target, 0, 1);
    case "market_share": {
      const peers = Object.values(state.players).filter((q) => q.role === p.role);
      const mine = p.role === "grocer" ? p.folkServedCumulative : p.soldCumulative;
      const all = sum(peers.map((q) => (p.role === "grocer" ? q.folkServedCumulative : q.soldCumulative)));
      const share = all > 0 ? mine / all : 1 / peers.length;
      return clamp(share / 0.45, 0, 1);
    }
    case "survive_frost":
      if (state.frostRound == null) return clamp(p.cash / 60, 0, 1) * 0.5; // frost hasn't hit yet
      return p.cash >= 60 ? 1 : clamp(p.cash / 60, 0, 1);
    case "zero_spoilage":
      return clamp(1 - p.spoiledCumulative / Math.max(1, p.handledCumulative), 0, 1);
    case "volume_mover":
      return clamp(p.boughtCumulative / 100, 0, 1);
    case "perfect_fill": {
      const rate = p.ordersReceived > 0 ? p.ordersFilled / p.ordersReceived : 1;
      return clamp(rate / 0.9, 0, 1);
    }
    case "clean_reputation":
      return p.repHits === 0 ? 1 : clamp(1 - 0.5 * p.repHits, 0, 1);
    case "serve_meals":
      return clamp(p.mealsServed / 60, 0, 1);
    default:
      return 0;
  }
}

/**
 * Resolve one round. `decisions` = { playerId: {price, qty} } (missing → hold last).
 * Returns fresh objects; never mutates `state`.
 */
export function resolveEcosystem(state, decisions, scenario) {
  const s = structuredClone(state);
  const round = s.round;
  const trades = [];
  const cascade = [];
  const folkTrips = [];
  const repFactor = scenario.reputation.priceFactor;
  const players = Object.values(s.players);
  const byRole = (r) => players.filter((p) => p.role === r);
  const push = (kind, source, affected, cause, effect) => cascade.push({ round, kind, source, affected, cause, effect });

  // ── 1) Apply decisions (clamped per tier) ──────────────────────────────────
  for (const p of players) {
    const tier = tierOf(scenario, p.role);
    const d = decisions[p.id] ?? { ...p.lastAction };
    const price0 = p.price;
    p.price = clamp(round2(Number(d.price) || tier.defaultPrice), tier.priceBounds.min, tier.priceBounds.max);
    p.qty = clamp(Math.round(Number(d.qty) || 0), tier.qtyBounds.min, tier.qtyBounds.max);
    p.sold = 0; p.bought = 0; p.shortfall = 0; p.folkServed = 0; p.mealsRound = 0;
    p._cash0 = p.cash; p._price0 = price0; p._badSold = 0;
    if (p.price !== price0) {
      const dir = p.price > price0 ? "raised" : "cut";
      push("price", p.id, "all", `${p.id} ${dir} ${p.role === "restaurant" ? "meal" : "crate"} price $${price0} → $${p.price}`,
        `every ${p.role}-buyer re-evaluates where to shop`);
    }
    p.lastAction = { price: p.price, qty: p.qty };
  }

  // ── 2) Farmers grow (production paid at marginal cost) ─────────────────────
  for (const p of byRole("farmer")) {
    const affordable = Math.floor(p.cash / p.unitCost);
    const grow = Math.min(p.qty, affordable);
    if (grow < p.qty) push("shortage", null, p.id, `${p.id} couldn't afford to grow ${p.qty} crates`, `only $${p.cash} on hand — grew ${grow}`);
    p.cash = round2(p.cash - grow * p.unitCost);
    if (grow > 0) p.inventory.push({ age: 0, units: grow, bad: false });
    p.handledCumulative += grow;
  }

  // ── 3) Wholesale market clears (farms → depots) ────────────────────────────
  clearMarket({ buyers: byRole("wholesaler"), sellers: byRole("farmer"), round, repFactor, loyaltyGap: scenario.business.loyaltyGap, trades, cascade });

  // ── 4) Retail procurement (depots → grocers + restaurants) ─────────────────
  clearMarket({ buyers: [...byRole("grocer"), ...byRole("restaurant")], sellers: byRole("wholesaler"), round, repFactor, loyaltyGap: scenario.business.loyaltyGap, trades, cascade });

  // ── 5) Townsfolk shop (emergent demand: WTP vs posted price) ───────────────
  const grocers = byRole("grocer");
  const restaurants = byRole("restaurant");
  const rTier = tierOf(scenario, "restaurant");
  const mealsPerCrate = rTier.mealsPerCrate;
  let consumerSurplus = 0, pricedOut = 0, emptyShelves = 0;
  const midWtp = (scenario.folk.wtpGrocery.min + scenario.folk.wtpGrocery.max) / 2;

  for (const f of s.folk) {
    // groceries: crates for the house
    const want = f.wtpGrocery >= midWtp ? scenario.folk.maxGroceryCrates : 1;
    const g = shopChoice(f.lastGrocer, grocers, round, repFactor, scenario.folk.loyaltyGap, 1);
    if (!g.shop) {
      emptyShelves++;
      folkTrips.push({ folk: f.id, kind: "grocery", to: null, reason: "empty" });
    } else if (g.shop.price > f.wtpGrocery) {
      pricedOut++;
      folkTrips.push({ folk: f.id, kind: "grocery", to: null, reason: "pricedOut", cheapest: g.shop.price });
    } else {
      const qty = Math.min(want, Math.floor(totalUnits(g.shop.inventory)));
      const moved = takeFIFO(g.shop.inventory, qty);
      const money = round2(qty * g.shop.price);
      g.shop.cash = round2(g.shop.cash + money - s.salesTax * qty); // retailer remits the tax
      g.shop.sold += qty;
      g.shop.soldCumulative += qty;
      g.shop.folkServed++;
      g.shop.folkServedCumulative++;
      consumerSurplus += (f.wtpGrocery - g.shop.price) * qty;
      const bad = badIn(moved);
      if (bad > 0) g.shop._badSold += bad;
      f.lastGrocer = g.shop.id;
      folkTrips.push({ folk: f.id, kind: "grocery", to: g.shop.id, qty, price: g.shop.price, bad: bad > 0 });
    }
    // one meal out, if a café clears their WTP
    const m = shopChoice(f.lastRestaurant, restaurants, round, repFactor, scenario.folk.loyaltyGap, 1 / mealsPerCrate);
    if (!m.shop) {
      emptyShelves++;
      folkTrips.push({ folk: f.id, kind: "meal", to: null, reason: "empty" });
    } else if (m.shop.price > f.wtpMeal) {
      pricedOut++;
      folkTrips.push({ folk: f.id, kind: "meal", to: null, reason: "pricedOut", cheapest: m.shop.price });
    } else {
      const moved = takeFIFO(m.shop.inventory, 1 / mealsPerCrate);
      m.shop.cash = round2(m.shop.cash + m.shop.price - rTier.prepCostPerMeal - s.salesTax);
      m.shop.mealsRound++;
      m.shop.mealsServed++;
      m.shop.folkServed++;
      m.shop.folkServedCumulative++;
      consumerSurplus += f.wtpMeal - m.shop.price;
      const bad = badIn(moved);
      if (bad > 0) m.shop._badSold += bad;
      f.lastRestaurant = m.shop.id;
      folkTrips.push({ folk: f.id, kind: "meal", to: m.shop.id, qty: 1, price: m.shop.price, bad: bad > 0 });
    }
  }

  // retailer sellouts + stockout bookkeeping
  for (const p of [...grocers, ...restaurants]) {
    const minStock = p.role === "restaurant" ? 1 / mealsPerCrate : 1;
    if (totalUnits(p.inventory) < minStock) {
      p.stockoutRounds++;
      push("sellout", null, p.id, `${p.id} sold out completely`, "townsfolk found empty shelves — demand walked next door");
    }
  }

  // ── 6) Reputation: whoever sold bad crates this round burns trust ──────────
  for (const p of players) {
    if ((p._badSold ?? 0) > 0) {
      p.reputationUntil = round + scenario.reputation.rounds;
      p.repHits++;
      push("quality", p.id, "all", `${p.id} sold bad lemons 🤢`,
        `buyers treat ${p.id}'s prices as ${Math.round((repFactor - 1) * 100)}% higher for ${scenario.reputation.rounds} rounds (Akerlof)`);
    }
  }

  // ── 7) Spoilage: crates age wherever they sit (age survives trades) ────────
  for (const p of players) {
    for (const b of p.inventory) b.age += 1;
    let spoiled = 0;
    for (let i = p.inventory.length - 1; i >= 0; i--) {
      if (p.inventory[i].age > scenario.spoilAfterRounds) {
        spoiled += p.inventory[i].units;
        p.inventory.splice(i, 1);
      }
    }
    if (spoiled > 0.01) {
      p.spoiledCumulative = round2(p.spoiledCumulative + spoiled);
      push("spoilage", null, p.id, `${p.id} held ${round2(spoiled)} crates too long`, "they spoiled and were destroyed (inventory risk)");
    }
  }

  // ── 8) Profit, elasticity flags, goals, town metrics ───────────────────────
  let totalProfit = 0;
  for (const p of players) {
    p.profitRound = round2(p.cash - p._cash0);
    p.profitCumulative = round2(p.profitCumulative + p.profitRound);
    totalProfit += p.profitRound;
    if (p._price0 != null && p.price > p._price0 && p.prevRevenue != null && p.profitRound < p.prevRevenue) {
      push("elasticity", p.id, p.id, `${p.id} raised price but earned less ($${p.prevRevenue} → $${p.profitRound})`,
        "buyers walked — demand here is elastic");
    }
    p.prevRevenue = p.profitRound;
    delete p._cash0; delete p._price0; delete p._badSold; delete p._remaining; delete p._filledBy; delete p._demandSeen;
  }
  for (const p of players) p.goalProgress = round2(goalProgress(p, s, scenario));

  const avgPrice = {};
  for (const r of ROLES) {
    const tier = byRole(r);
    avgPrice[r] = round2(sum(tier.map((p) => p.price)) / tier.length);
  }
  const metrics = {
    round,
    consumerSurplus: round2(consumerSurplus),
    totalProfit: round2(totalProfit),
    welfare: round2(consumerSurplus + totalProfit),
    pricedOut,
    emptyShelves,
    avgPrice,
  };
  s.history.push(metrics);
  if (pricedOut >= 6) push("pricedout", null, "all", `${pricedOut} townsfolk were priced out this round`, "high retail prices shrank the whole market");

  return { state: s, trades, cascade, folkTrips, metrics };
}
