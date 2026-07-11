// Scripted economic events — each one is a character entering the town AND a
// graded task (see examiner per-task ratings). The engine physics stay
// deterministic: the shady-supplier "50% bad" draw is a seeded hash of
// studentId+eventId, so the demo reproduces exactly (no Math.random).
//
// Timeline (config in shared/scenario.json):
//   R4  ❄️ FROST          supply shock — unit cost doubles
//   R6  📜 TAX            $1/crate sales tax — incidence (pass-through vs absorb)
//   R8  🕵️ SHADY SUPPLIER hidden quality (Akerlof) — buy/refuse, bad stock → reputation hit
//   R10 🤝 CARTEL         Nash — cooperate at $8 or defect; NPC defects R11
//
// Effects that resolveRound() reads off `game`: salesTax, repPenalty/repRounds,
// grower.reputationUntil, grower.badStockPending. Offers live in game.mailbox.

import { push } from "./cascade.js";

/** Deterministic unit float in [0,1) from a string seed — reproducible "randomness". */
function seededUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function eventForRound(scenario, round) {
  return (scenario.events ?? []).find((e) => e.round === round) ?? null;
}
export function eventById(scenario, id) {
  return (scenario.events ?? []).find((e) => e.id === id) ?? null;
}

function humanIds(game) {
  return Object.keys(game.growers).filter((id) => game.growers[id].isHuman);
}

function pushOffer(game, studentId, offer) {
  game.mailbox ??= {};
  (game.mailbox[studentId] ??= []).push({ ...offer, status: "pending" });
}

/**
 * Activate an event: mutate game state, raise the town banner + news, push a
 * cascade entry, and drop any offers into players' mailboxes. Idempotent per id.
 * Returns the banner, or null if the event already fired.
 */
export function applyEvent(game, event) {
  if (!event) return null;
  game.firedEvents ??= new Set();
  if (game.firedEvents.has(event.id)) return null;
  game.firedEvents.add(event.id);

  game.banner = { emoji: event.emoji, title: event.title, concept: event.concept, round: game.round, id: event.id };
  game.market.news = event.news;

  switch (event.type) {
    case "frost":
      for (const id of Object.keys(game.growers)) game.growers[id].unitCost = event.newUnitCost;
      game.frostDone = true;
      game.frostRound = game.round;
      push(game.cascade, game.round, `${event.emoji} FROST hit Lemonville`,
        "unit cost doubled for every stand", "all", "shock");
      break;

    case "tax":
      game.salesTax = event.amount; // per-crate sales tax remitted by the seller
      push(game.cascade, game.round, `${event.emoji} Tax decree: $${event.amount}/crate sold`,
        "every sale owes the town now — pass it on or absorb it", "all", "tax");
      break;

    case "supplier_offer":
      game.repPenalty = event.reputationPenalty;
      game.repRounds = event.reputationRounds;
      for (const id of humanIds(game)) {
        pushOffer(game, id, {
          offerId: event.id, type: event.type, round: game.round,
          crates: event.crates, price: event.price,
          bad: seededUnit(id + event.id) < event.badChance, // hidden from the player
          title: event.title, emoji: event.emoji,
          body: `Buy ${event.crates} crates at $${event.price} each? They might be bad.`,
        });
      }
      push(game.cascade, game.round, `${event.emoji} A shady supplier came to town`,
        "cheap crates, hidden quality — buy or refuse", "all", "quality");
      break;

    case "cartel_offer":
      game.cartel = { price: event.price, round: game.round, npcDefectsRound: event.npcDefectsRound, members: new Set() };
      for (const id of humanIds(game)) {
        pushOffer(game, id, {
          offerId: event.id, type: event.type, round: game.round,
          price: event.price, title: event.title, emoji: event.emoji,
          body: `Both stands price at $${event.price}? Cooperate for fat margins — or defect and undercut.`,
        });
      }
      push(game.cascade, game.round, `${event.emoji} Cartel proposed: both hold at $${event.price}`,
        "cooperate for high prices — or defect and undercut", "all", "cartel");
      break;
  }
  return game.banner;
}

/**
 * Player accepts/refuses a mailbox offer. Applies the immediate effect and
 * returns {ok, offer, decision} — index.js logs `decision` to the decision log
 * (buy/refuse and accept/defect are graded decisions too).
 */
export function resolveOffer(game, studentId, offerId, accept) {
  const box = game.mailbox?.[studentId] ?? [];
  const o = box.find((x) => x.offerId === offerId && x.status === "pending");
  if (!o) return { ok: false, error: "no such pending offer" };
  o.status = accept ? "accepted" : "refused";
  const gr = game.growers[studentId];

  let intent = "";
  if (o.type === "supplier_offer") {
    if (accept) {
      gr.cash -= o.crates * o.price;
      gr.inventory.push({ age: 0, crates: o.crates, bad: o.bad });
      gr.producedCumulative += o.crates;
      if (o.bad) gr.badStockPending = true;
      push(game.cascade, game.round, `${gr.id} bought 20 shady crates`,
        "put cheap, unverified lemons on the stand", studentId, "quality");
    }
    intent = accept ? "accepted shady supplier (cheap crates, hidden quality)" : "refused shady supplier (protected reputation)";
  } else if (o.type === "cartel_offer") {
    if (accept) game.cartel?.members.add(studentId);
    intent = accept ? "accepted cartel (cooperate at $" + o.price + ")" : "refused cartel (stay independent)";
  }

  const decision = {
    round: game.round, studentId, intent,
    action: { offer: o.offerId, accept },
    visibleState: null, // filled by caller
  };
  return { ok: true, offer: o, decision };
}

/** Pending offers for a player (UI mailbox). */
export function pendingOffers(game, studentId) {
  return (game.mailbox?.[studentId] ?? []).filter((o) => o.status === "pending");
}
