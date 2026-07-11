// Scripted economic events — each is a character entering town AND a graded task.
// v4: events are TIER-AWARE. Frost hits only farms (the lesson is pass-through);
// the tax lands on retailers (incidence travels UP the chain through orders);
// the shady supplier tempts every player (Akerlof at any tier); the cartel forms
// WITHIN each player's own tier (Nash in their own market). Physics stay
// deterministic: shady "50% bad" is a seeded hash of playerId+eventId.

import { seededUnit } from "../shared/ecosystem.js";

export const eventForRound = (scenario, round) => (scenario.events ?? []).find((e) => e.round === round) ?? null;
export const eventById = (scenario, id) => (scenario.events ?? []).find((e) => e.id === id) ?? null;

const humans = (game) => Object.values(game.state.players).filter((p) => p.isHuman);

function pushOffer(game, playerId, offer) {
  (game.mailbox[playerId] ??= []).push({ ...offer, status: "pending" });
}

/**
 * Activate an event: mutate game state, raise the banner, drop offers into
 * mailboxes, log to the cascade. Idempotent per event id.
 */
export function applyEvent(game, event) {
  if (!event || game.firedEvents.has(event.id)) return null;
  game.firedEvents.add(event.id);
  const round = game.state.round;
  game.banner = { emoji: event.emoji, title: event.title, concept: event.concept, round, id: event.id };
  game.news = event.news;
  const push = (cause, effect, kind) => game.cascadeLog.push({ round, cause, effect, affected: "all", source: null, kind });

  switch (event.type) {
    case "frost":
      for (const p of Object.values(game.state.players))
        if (p.role === "farmer") p.unitCost = p.unitCost * event.costFactor;
      game.state.frostRound = round;
      push(`${event.emoji} FROST hit the lemon groves`, "growing cost doubled at every farm — watch who passes it downstream", "shock");
      break;

    case "tax":
      game.state.salesTax = event.amount;
      push(`${event.emoji} Retail tax decree: $${event.amount}/sale`, "grocers and cafés remit — will they absorb it or pass it to the town?", "tax");
      break;

    case "supplier_offer":
      for (const p of humans(game)) {
        pushOffer(game, p.id, {
          offerId: event.id, type: event.type, round,
          crates: event.crates, price: event.price,
          bad: seededUnit(p.id + event.id) < event.badChance, // hidden from the player
          title: event.title, emoji: event.emoji,
          body: `Psst — ${event.crates} crates at $${event.price} each, no questions asked. They might be bad. Sell bad lemons and your buyers will remember.`,
        });
      }
      push(`${event.emoji} A shady supplier slinked into town`, "dirt-cheap crates, hidden quality — every business got the same whisper", "quality");
      break;

    case "cartel_offer": {
      for (const [role, price] of Object.entries(event.tierPrice)) {
        game.cartels[role] = { price, round, npcDefectsRound: event.npcDefectsRound, members: new Set() };
        // NPCs in the tier join silently (and will defect on schedule — see npc.js)
        for (const p of Object.values(game.state.players))
          if (p.role === role && !p.isHuman) game.cartels[role].members.add(p.id);
      }
      for (const p of humans(game)) {
        const price = event.tierPrice[p.role];
        pushOffer(game, p.id, {
          offerId: event.id, type: event.type, round, price,
          title: event.title, emoji: event.emoji,
          body: `The other ${p.role}s propose: everyone holds at $${price}. Fat margins if all cooperate — but anyone can defect and undercut.`,
        });
      }
      push(`${event.emoji} Cartel whispers in every tier`, "hold prices high together… unless someone defects (Nash)", "cartel");
      break;
    }
  }
  return game.banner;
}

/**
 * A player answers a mailbox offer. Applies the immediate effect and returns
 * {ok, offer, decision} — index.js appends `decision` to the graded log.
 */
export function resolveOffer(game, playerId, offerId, accept) {
  const box = game.mailbox[playerId] ?? [];
  const o = box.find((x) => x.offerId === offerId && x.status === "pending");
  if (!o) return { ok: false, error: "no such pending offer" };
  const p = game.state.players[playerId];
  o.status = accept ? "accepted" : "refused";
  const round = game.state.round;

  let intent = "";
  if (o.type === "supplier_offer") {
    if (accept) {
      p.cash = Math.round((p.cash - o.crates * o.price) * 100) / 100;
      p.inventory.push({ age: 0, units: o.crates, bad: o.bad });
      p.handledCumulative += o.crates;
      game.cascadeLog.push({
        round, kind: "quality", source: playerId, affected: playerId,
        cause: `${playerId} bought ${o.crates} shady crates`,
        effect: "cheap, unverified stock is on their shelves now",
      });
    }
    intent = accept ? "accepted shady supplier (cheap crates, hidden quality)" : "refused shady supplier (protected reputation)";
  } else if (o.type === "cartel_offer") {
    if (accept) game.cartels[p.role]?.members.add(playerId);
    intent = accept ? `accepted the ${p.role} cartel (hold at $${o.price})` : `refused the ${p.role} cartel (stay independent)`;
  }

  const decision = { round, studentId: playerId, intent, action: { offer: o.offerId, accept }, visibleState: null };
  return { ok: true, offer: o, decision };
}

export const pendingOffers = (game, playerId) => (game.mailbox[playerId] ?? []).filter((o) => o.status === "pending");
