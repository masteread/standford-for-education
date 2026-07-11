// Town geometry — where every building and townsfolk lives, in % of the scene.
// One source of truth: buildings, truck routes, and walking folk all read from
// here so the animation always lines up with the ledger.

export const BUILDING_POS = {
  F1: { x: 18, y: 15 }, F2: { x: 50, y: 15 }, F3: { x: 82, y: 15 },
  W1: { x: 33, y: 37 }, W2: { x: 67, y: 37 },
  G1: { x: 9, y: 58 }, R1: { x: 25, y: 58 }, G2: { x: 41, y: 58 },
  R2: { x: 57, y: 58 }, G3: { x: 73, y: 58 }, R3: { x: 89, y: 58 },
};

export const ROADS = [
  { y: 27.5 }, // farm road (farms ↔ depots)
  { y: 49 },   // main street (depots ↔ shops)
];

export const ROLE_GLYPH = { farmer: "🌾", wholesaler: "🏭", grocer: "🏪", restaurant: "🍽️" };
export const ROLE_TINT = { farmer: "#6BCB77", wholesaler: "#4D96FF", grocer: "#FFD93D", restaurant: "#FF9F45" };

/** Home spot for townsfolk i (two rows at the bottom of the scene). */
export function homePos(i) {
  const col = i % 12;
  const row = Math.floor(i / 12);
  return { x: 5 + col * 8.2, y: 82 + row * 9 };
}

/** A spot in the little crowd in front of a shop (jittered by folk index). */
export function shopSpot(shopId, i) {
  const b = BUILDING_POS[shopId] ?? { x: 50, y: 58 };
  return { x: b.x - 5 + ((i * 37) % 11), y: b.y + 9 + ((i * 13) % 3) * 2.4 };
}

export const folkIndex = (folkId) => Number(String(folkId).replace("folk", "")) || 0;
