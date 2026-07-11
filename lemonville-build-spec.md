# Lemonville — Ecosystem Build Spec (v4)

> Supersedes v3 (the two-stand duopoly). v3 shipped a symmetric lemon-stand game;
> v4 rebuilds Lemonville as a FULL SUPPLY-CHAIN ECOSYSTEM where every student
> occupies a different link of the chain and every move ripples through the whole
> class. The engine, agents, storage wrappers, and EverOS memory layer carry over
> in spirit; the market core is rewritten.

## The one-sentence pitch

The class IS the economy: farmers sell to wholesalers, wholesalers to grocers and
restaurants, and 24 simulated townsfolk spend their budgets at the bottom — so when
one student raises a price, everyone else feels it, sees it animate through a pixel
town, and gets scored on how well they played the wave.

## Design decisions (locked with the professor)

1. **Multiple students per tier** — 3 farmers, 2 wholesalers, 3 grocers, 3
   restaurants (11 seats). Vertical ripples AND horizontal competition. NPCs with
   scripted policies fill every empty seat, so the ecosystem is always complete.
2. **Synchronized rounds** (~35s). Everyone commits a move; the round resolves
   tier-by-tier; the town animates the cascade. Clean causality for grading.
3. **Butterfly effect = animated cascade on the town map.** Goods physically move
   (trucks farm→depot, vans depot→shops, townsfolk walk to shops), price signs
   flip as effects arrive, priced-out folk trudge home with 💸.
4. **Three separate scores per student**: goal achievement (motivation), AI-graded
   decision quality (the grade, comparable across roles), and ecosystem impact
   (counterfactual: the engine re-runs each round without your move and diffs the
   town). Leaderboard ranks by decision quality.

## Tech stack (unchanged from v3 — do not deviate)

- Node.js + Express, plain JS. Server owns all game logic. Client polls
  `GET /state/:playerId` every 2s. NO WebSockets.
- React (Vite) client, pixel aesthetic: "Press Start 2P" + VT323, chunky 4px
  borders, hard shadows, 8-bit palette, emoji characters, CSS-only animation.
- LLM via Nebius Token Factory (OpenAI-compatible): small model = delegate,
  large model = examiner. `RIPPLE_MOCK=1` runs fully offline (regex delegate,
  heuristic examiner).
- `npm install && npm run dev` runs everything (server 3001, client 5173).

## The economy (all numbers in `shared/scenario.json`)

**Engine is a PURE function** in `shared/ecosystem.js`:
`resolveEcosystem(state, decisions, scenario) → {state', trades, cascade, metrics}`.
No mutation, no Math.random (seeded hashes only). Purity is load-bearing: the same
module powers the server's tick, the live move preview, AND counterfactual impact.

Every player submits `{price, qty}`; meaning depends on role:

| Role (seats) | price = | qty = | economics on display |
|---|---|---|---|
| 🧑‍🌾 Farmer ×3 | farm-gate price | crates to grow (cost $2 ea) | marginal cost, supply shocks |
| 🚛 Wholesaler ×2 | wholesale ask | crates to order from farms | middleman margin, inventory risk |
| 🛒 Grocer ×3 | retail price | crates to order from depots | retail competition, reputation |
| 👨‍🍳 Restaurant ×3 | meal price | crates to order (1 crate = 4 meals, +$1 prep/meal) | value-add, derived demand |

**Round resolution order** (each step feeds the next — this IS the cascade):
1. Farmers grow (paid at unit cost, crates age-0 into inventory).
2. Wholesale market clears: wholesalers buy from farms — cheapest first with
   loyalty friction (stay with last supplier unless beaten by >$0.50); pro-rata
   when a farm sells out; unfilled orders spill to the next-cheapest farm.
3. Retail procurement: grocers + restaurants buy from depots, same mechanics.
   Crates KEEP THEIR AGE across trades — a hoarding wholesaler ships old lemons
   and the spoilage lands downstream.
4. Townsfolk shop: 24 folk with fixed, heterogeneous willingness-to-pay (grocery
   $4–14, meals $6–18). Each buys where it's cheapest (with $1 loyalty friction)
   IF the price clears their WTP and shelves aren't empty. Aggregate demand slopes
   down **emergently** — there is no D = a − bP formula anywhere in v4.
5. Spoilage: every crate ages; age > 3 is destroyed, at whichever tier holds it.
6. Metrics: consumer surplus (Σ wtp − price over actual purchases), total profit,
   priced-out count, per-tier avg prices → `state.history` for charts.

**Trades** are first-class: `{from, to, qty, price, tier, bad?}` — the client
animates exactly these (the trucks ARE the ledger). **Cascade** entries carry
`source` (which player caused it) so ripples can be drawn from the mover.

**Counterfactual impact** (`shared/impact.js`): after resolving a round, for each
player p, re-run the same round with p's decision replaced by "hold last action";
`impact[p] = {profit delta per other player, welfare delta, priced-out delta,
reach}`. Summed over the game → the ecosystem-impact score. This is real
attribution, not narration: every number is a diff of two engine runs.

**Reputation**: selling bad (shady) crates makes buyers treat your price as 30%
higher for 2 rounds — at any tier (a wholesaler can poison its grocers).

## Scripted events (same 5 graded tasks as v3, now tier-aware)

- R1–3 free play — equilibrium discovery across the chain.
- R4 ❄️ FROST — farm cost doubles. Nobody else's costs move directly: the lesson
  is pass-through, tier by tier.
- R6 📜 RETAIL TAX — $1/sale remitted by grocers + restaurants. Upstream tiers
  feel it only through shrinking orders (incidence travels UP the chain).
- R8 🕵️ SHADY SUPPLIER — cheap crates offered to EVERY player, 50% bad (seeded
  per player). Hidden quality + reputation, Akerlof at any tier.
- R10 🤝 CARTEL — each tier's peers propose "hold at $X together" (X per tier).
  NPC peers cooperate R10, defect R11. Nash for everyone, in their own market.

## Goals (motivation, never the grade) — per-role pools

farmer: max_profit / market_share / survive_frost (cash ≥ $60 after frost) /
zero_spoilage · wholesaler: max_profit / volume_mover (≥100 crates moved) /
perfect_fill (≥90% of downstream orders filled) / zero_spoilage · grocer:
max_profit / market_share / clean_reputation / zero_spoilage · restaurant:
max_profit / serve_meals (≥60) / clean_reputation / zero_spoilage.

## Grading (same principle as v3: same world, same tasks; only goals differ)

Examiner (large model, one batched call per student, role-aware prompt) emits the
4 skill dimensions + 5 per-task ratings + biases, all evidence-linked to rounds.
The ecosystem-impact score is computed BY THE ENGINE (counterfactuals), never by
the LLM. Cohort percentiles per dimension, per task, and for impact, in plain JS.

## Client

- **Town view (centerpiece)**: a living pixel city in three bands — farms on the
  ridge, warehouse district mid, main street (grocers + cafés) below, houses at
  the bottom. On resolve, the round REPLAYS as a staged cascade (~4s): trucks run
  farm→depot, vans depot→shops, folk walk home→shops, reactions pop (💸 priced
  out, 🤢 bad lemons, speech bubbles from real cascade entries). Price signs flip
  as the wave passes. Crowd distribution mirrors the trade ledger exactly.
- **Your Ripples card**: after each round, "your move changed X's profit by −$7,
  priced out 3 townsfolk, total town welfare −$12" — straight from impact.js.
- **Role dashboard** (left): cash, aging inventory, role-specific unit economics,
  goal + progress. **Chat** (right): Delegate / Town Crier / Messages, chips per
  role.
- **Report**: 3-score header (goal % · quality percentile · impact), radar with
  cohort bands, per-task strip, biases, evidence replays.
- **Professor** (`/professor`): quality-first leaderboard (columns: student, role,
  quality percentile, 5 task cells, impact, profit, goal%), sortable; clustered
  misconceptions per task; per-cell overrides (persisted, ✏️); town-health charts
  (per-tier avg price + welfare + priced-out over rounds); round-by-round cascade
  replay for lecture use.
- **Admin** (`/admin`): start, force-resolve, inject any event, fill seats with
  NPCs, seed cohort, reset.

## Acceptance test

Two phones join as different roles, 12 rounds with all four events firing; a
farmer price hike visibly cascades (trucks reroute, a grocer's shelf empties, folk
trudge off); both players' reports show three DIFFERENT scores with evidence; the
professor page ranks by decision quality, shows at least one clustered
misconception, one working override, and the town-health chart shows the frost
spike propagating tier-by-tier with a lag. `RIPPLE_MOCK=1` end-to-end works with
zero network. Modules stay ~200 lines with formulas commented by economics name.
