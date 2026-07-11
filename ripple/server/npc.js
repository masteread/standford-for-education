// Scripted NPC policies — one per role, NOT an LLM (deterministic, cheap, and
// legible on stage). NPCs fill every seat a human doesn't, so the ecosystem is
// always complete: 3 farms, 2 depots, 3 grocers, 3 cafés, 24 townsfolk.
//
// Shared shape: cost-plus pricing, nudged by last round's inventory signal
// (sold out → creep up; sitting on stock → mark down), cartel-aware (cooperate
// on the cartel round, defect from npcDefectsRound — the Nash lesson needs a
// defector even in an all-NPC tier).

import { totalUnits, tierOf } from "../shared/ecosystem.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const q4 = (v) => Math.round(v * 4) / 4; // quarter-dollar prices

function cartelPrice(game, p) {
  const cartel = game.cartels?.[p.role];
  if (!cartel || !cartel.members.has(p.id)) return null;
  if (game.state.round >= cartel.npcDefectsRound) return { price: cartel.price - 1, note: "defected from the cartel — undercut for share" };
  return { price: cartel.price, note: `cooperating at the cartel price $${cartel.price}` };
}

/** Average posted price of the tier an NPC buys from (its input cost signal). */
function inputPrice(state, role) {
  const src = role === "wholesaler" ? "farmer" : "wholesaler";
  const ps = Object.values(state.players).filter((x) => x.role === src);
  return ps.reduce((s, x) => s + x.price, 0) / ps.length;
}

export function npcDecision(game, id) {
  const state = game.state;
  const p = state.players[id];
  const tier = tierOf(game.scenario, p.role);
  const stock = totalUnits(p.inventory);
  const soldOut = p.sold > 0 && stock < 2;
  const glut = stock > tier.qtyBounds.max * 0.6;

  let price, qty, note;
  switch (p.role) {
    case "farmer": {
      price = Math.max(p.unitCost + 1, p.price + (soldOut ? 0.5 : glut ? -0.5 : 0));
      qty = clamp(Math.round(p.sold > 0 ? p.sold + 2 : tier.defaultQty) - Math.floor(stock / 2), 6, tier.qtyBounds.max);
      note = "(NPC farm) cost-plus, nudged by stock";
      break;
    }
    case "wholesaler": {
      const cost = inputPrice(state, p.role);
      price = Math.max(cost + 1.5, p.price + (soldOut ? 0.5 : glut ? -0.5 : 0));
      qty = clamp(Math.round((p.sold || tier.defaultQty) + 4 - stock), 0, tier.qtyBounds.max);
      note = "(NPC depot) margin over farm ask, restock to sales";
      break;
    }
    case "grocer": {
      const cost = inputPrice(state, p.role);
      price = Math.max(cost + 2, p.price + (soldOut ? 0.5 : glut ? -0.5 : 0));
      qty = clamp(Math.round((p.sold || tier.defaultQty) + 2 - stock), 0, tier.qtyBounds.max);
      note = "(NPC grocer) margin over wholesale, restock to sales";
      break;
    }
    case "restaurant": {
      const crateCost = inputPrice(state, "grocer"); // buys from depots (same signal)
      const perMeal = crateCost / tier.mealsPerCrate + tier.prepCostPerMeal;
      price = Math.max(q4(perMeal + 4), p.price + (soldOut ? 0.5 : glut ? -1 : 0));
      qty = clamp(Math.round((p.mealsRound || 8) / tier.mealsPerCrate + 1 - stock), 0, tier.qtyBounds.max);
      note = "(NPC café) meal margin over ingredient cost";
      break;
    }
  }

  const cartel = cartelPrice(game, p);
  if (cartel) { price = cartel.price; note = `(NPC) ${cartel.note}`; }
  price = clamp(q4(price + (state.salesTax > 0 && p.role !== "farmer" && p.role !== "wholesaler" ? 0.5 : 0)), tier.priceBounds.min, tier.priceBounds.max);
  return { price, qty, intent: note, source: "npc" };
}

/** NPCs auto-answer offers: refuse shady stock, join cartels (then defect — see above). */
export function npcOfferPolicy(offer) {
  return offer.type === "cartel_offer";
}
