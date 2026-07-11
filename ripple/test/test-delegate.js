// B2 done-when: "undercut B slightly but protect margin" vs B@$6, cost $2
// yields ~5.5, and garbage input still returns a valid action. Runs the regex
// stub always, and the live Claude path when ANTHROPIC_API_KEY is set.
import "./loadenv.js";
import { runDelegate, regexDelegate } from "../server/agents/delegate.js";

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

const ownState = { id: "A", cash: 100, unitCost: 2, inventory: [{ age: 1, crates: 20 }] };
const visibleState = {
  round: 3,
  growers: [
    { id: "A", price: 6 },
    { id: "B", price: 6 },
  ],
  market: { totalDemand: 80, avgPrice: 6, news: null },
};
const lastAction = { price: 6, produce: 40 };
const validAction = (r) =>
  r.action && r.action.price >= 1 && r.action.price <= 15 && r.action.produce >= 0 && r.action.produce <= 100;

// --- regex stub (mock/fallback path) ---
const undercut = regexDelegate({ studentId: "A", intent: "undercut B slightly but protect margin", visibleState, ownState, lastAction });
check("stub: undercut lands near 5.5", validAction(undercut) && Math.abs(undercut.action.price - 5.5) <= 0.5, JSON.stringify(undercut.action));

const garbage = regexDelegate({ studentId: "A", intent: "asdf!!! 🍋🍋🍋", visibleState, ownState, lastAction });
check("stub: garbage input returns valid action", validAction(garbage), JSON.stringify(garbage.action));

// --- live path ---
if (process.env.ANTHROPIC_API_KEY && process.env.RIPPLE_MOCK !== "1") {
  const live = await runDelegate({ studentId: "A", intent: "undercut B slightly but protect margin", visibleState, ownState, lastAction });
  check(
    "live: undercut prices below rival, above cost",
    live.source === "claude" && validAction(live) && live.action.price < 6 && live.action.price >= 3,
    `source=${live.source} ${JSON.stringify(live.action)}`
  );

  const liveGarbage = await runDelegate({ studentId: "A", intent: "asdf!!! 🍋🍋🍋", visibleState, ownState, lastAction });
  check(
    "live: garbage input still yields valid JSON (action or question)",
    Boolean(liveGarbage.question) || validAction(liveGarbage),
    JSON.stringify(liveGarbage)
  );

  // Spec allows either outcome here: act at $7, or ask the one clarifying
  // question about production (the spec's own example for this exact intent).
  const liveRaise = await runDelegate({ studentId: "A", intent: "raise to 7, demand can take it", visibleState, ownState, lastAction });
  check(
    "live: 'raise to 7' → price 7 action OR production question",
    (validAction(liveRaise) && liveRaise.action.price === 7) || /produc/i.test(liveRaise.question ?? ""),
    JSON.stringify(liveRaise)
  );
} else {
  console.log("SKIP: live delegate (no ANTHROPIC_API_KEY)");
}

process.exit(failures ? 1 : 0);
