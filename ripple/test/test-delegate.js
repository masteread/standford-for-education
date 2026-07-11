// Delegate done-when (v4, role-aware): "undercut G2 slightly but protect margin"
// for a grocer vs G2@$8 yields ~7.5, qty phrases parse per role, and garbage
// input still returns a valid action. Regex stub always; live Nebius path when
// NEBIUS_API_KEY is set.
import "./loadenv.js";
import { runDelegate, regexDelegate } from "../server/agents/delegate.js";

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

const grocerTier = { priceBounds: { min: 3, max: 15 }, qtyBounds: { min: 0, max: 20 } };
const farmerTier = { priceBounds: { min: 1, max: 10 }, qtyBounds: { min: 0, max: 30 } };
const visibleState = {
  round: 3,
  players: [
    { id: "G1", role: "grocer", price: 8, stock: 6 },
    { id: "G2", role: "grocer", price: 8, stock: 9 },
    { id: "G3", role: "grocer", price: 9, stock: 2 },
    { id: "W1", role: "wholesaler", price: 5, stock: 14 },
    { id: "F1", role: "farmer", price: 3, stock: 10 },
  ],
};
const ownState = { id: "G1", role: "grocer", cash: 100, unitCost: null, stock: 6 };
const lastAction = { price: 8, qty: 10 };
const valid = (r, tier) =>
  r.action && r.action.price >= tier.priceBounds.min && r.action.price <= tier.priceBounds.max &&
  r.action.qty >= tier.qtyBounds.min && r.action.qty <= tier.qtyBounds.max;

// --- regex stub (mock/fallback path) ---
const undercut = regexDelegate({ intent: "undercut G2 slightly but protect margin", role: "grocer", tier: grocerTier, visibleState, ownState, lastAction });
check("stub: grocer undercut lands near 7.5", valid(undercut, grocerTier) && Math.abs(undercut.action.price - 7.5) <= 0.5, JSON.stringify(undercut.action));

const order = regexDelegate({ intent: "order 15 and price at 9", role: "grocer", tier: grocerTier, visibleState, ownState, lastAction });
check("stub: 'order 15, price 9' parses both", order.action.qty === 15 && order.action.price === 9, JSON.stringify(order.action));

const grow = regexDelegate({ intent: "grow 25 crates and charge 4", role: "farmer", tier: farmerTier, visibleState, ownState: { id: "F1", role: "farmer", unitCost: 2 }, lastAction: { price: 3, qty: 14 } });
check("stub: farmer 'grow 25 charge 4'", grow.action.qty === 25 && grow.action.price === 4, JSON.stringify(grow.action));

const garbage = regexDelegate({ intent: "asdf!!! 🍋🍋🍋", role: "grocer", tier: grocerTier, visibleState, ownState, lastAction });
check("stub: garbage input returns valid action", valid(garbage, grocerTier), JSON.stringify(garbage.action));

const clamped = regexDelegate({ intent: "price at 40 and order 99", role: "grocer", tier: grocerTier, visibleState, ownState, lastAction });
check("stub: clamps to tier bounds", clamped.action.price === 15 && clamped.action.qty === 20, JSON.stringify(clamped.action));

// --- live path ---
if (process.env.NEBIUS_API_KEY && process.env.RIPPLE_MOCK !== "1") {
  const live = await runDelegate({ studentId: "G1", intent: "undercut G2 slightly but protect margin", role: "grocer", tier: grocerTier, visibleState, ownState, lastAction });
  check(
    "live: undercut prices below the peer, above wholesale",
    live.source === "nebius" && valid(live, grocerTier) && live.action.price < 8 && live.action.price >= 5,
    `source=${live.source} ${JSON.stringify(live.action)}`
  );
  const liveGarbage = await runDelegate({ studentId: "G1", intent: "asdf!!! 🍋🍋🍋", role: "grocer", tier: grocerTier, visibleState, ownState, lastAction });
  check("live: garbage still yields valid JSON (action or question)", Boolean(liveGarbage.question) || valid(liveGarbage, grocerTier), JSON.stringify(liveGarbage));
} else {
  console.log("SKIP: live delegate (no NEBIUS_API_KEY)");
}

process.exit(failures ? 1 : 0);
