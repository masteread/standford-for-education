# Lemonville — Revised Build Spec (v3)

> Supersedes the plain-UI Ripple client for the demo. The engine, agents, storage
> wrappers, and EverOS memory layer already on `main` carry over — this spec
> re-skins the world and adds scripted events + the professor grading layer.
> Prioritize a WORKING end-to-end loop over polish; the aesthetic layer must
> never block the engine.

Build "Lemonville" — a gamified, pixel-art, multiplayer economics simulation for a
hackathon demo TODAY. Players run lemon stands in a cute 8-bit market town, command
an AI delegate through a chatbox, watch emoji townsfolk react to their pricing,
survive scripted economic events, and receive an AI-graded skill report at the end.

## Tech stack (do not deviate)

- Node.js + Express server, plain JavaScript. Server owns all game logic.
- React client (Vite), Tailwind for layout. Client polls `GET /state/:playerId` every 2s. NO WebSockets.
- LLM calls via OpenAI SDK pointed at Nebius Token Factory (OpenAI-compatible):
  `new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY })`.
  Small fast model (env `NEBIUS_MODEL_SMALL`, e.g. a Llama-3.1-8B-class instruct model) for the
  delegate; large model (env `NEBIUS_MODEL_LARGE`, e.g. 70B-class) for the examiner. All model
  names from env vars with sensible defaults.
- Storage through a wrapper module `server/storage.js` with an in-memory Map implementation AND
  stubs marked `// TODO: Butterbase` for saveState/appendDecision/saveSkillModel/getLeaderboard.
  The game must run fully on the in-memory fallback.
  (Note: `main` already has a working Butterbase wrapper + provisioned app — port it, don't stub it twice.)
- Everything must run with `npm install && npm run dev` (concurrently: server on 3001, client on
  5173, client proxies /api).

## Aesthetic (this matters — the demo is judged on charm)

- Pixel/retro: "Press Start 2P" Google Font for headings, monospace for body. Chunky 4px borders,
  hard drop shadows (no blur), 8-bit palette: cream background #FDF6E3, lemon yellow #FFD93D,
  leaf green #6BCB77, sky #4D96FF, alert red #FF6B6B, ink #2D2D2D. Rounded-none. Buttons depress
  2px on click.
- NO images or sprite sheets. All characters are emoji rendered large (🧑‍🌾👵🧒👨‍🍳🐕 for townsfolk,
  🍋 stalls, 💰 coins, ❄️ frost, 📜 tax decree, 🕵️ shady supplier, 🤝 cartel offer). Animate with
  CSS transitions/keyframes only.
- Sound optional; if trivial, tiny beeps via WebAudio on round resolve. Behind a mute toggle,
  default MUTED.

## The town view (main screen — this is the demo centerpiece)

A market square: player stalls in a row (stall = 🍋 on a pixel-art table div, stand name, price
sign that flips when price changes). Below them, 20 townsfolk emoji standing in a plaza. Each
round resolution, townsfolk WALK (CSS transform, ~1s) to the stall they buy from; a few walk
off-screen when priced out (show 💸 or 😞 above them). Crowd distribution per stall must exactly
mirror the engine's demand split — the crowd IS the demand curve visualized.

- Overhead speech bubbles on townsfolk after resolve, sampled from cascade entries: "Cheaper over
  here!", "Too pricey! 😤", "My lemons went bad... 🤢" (hidden-quality rounds).
- Event banners take over the top of the screen with big emoji + pixel text: "❄️ FROST! Costs
  doubled!", "📜 TAX DECREE: $1/crate", "🕵️ A stranger approaches...".
- Spoilage: crates in your stall inventory display age as 🍋 → 🟠 → 🟤; destroyed with a small
  poof (opacity+scale keyframe).

## Layout

Three columns (stack on mobile, mobile must work — judges join by phone):

1. LEFT — Your stand: cash, inventory with aging crates, unit cost, YOUR GOAL in a pixel banner,
   goal progress bar.
2. CENTER — Town view (above) + round timer as a pixel hourglass/progress bar.
3. RIGHT — Chat panel with three tabs:
   - 🗣 Delegate: chat UI where the player types strategy in plain English ("undercut Maya
     slightly but protect margin"). Delegate replies in-character (cheerful pixel assistant tone),
     may ask ONE clarifying question, then confirms the queued action as a chat message.
     Quick-action chips above the input: [Raise $1] [Undercut 50¢] [Hold] [Produce +10].
   - 📯 Town Crier: cascade log as cute announcements, newest on top, entries mentioning YOU
     highlighted yellow. Clicking an entry shows that round's snapshot in a modal.
   - ✉️ Messages: NPC/event mail — the cartel offer arrives here round 10 with [🤝 Accept]
     [❌ Refuse] buttons (acceptance is also logged as a decision with intent "accepted cartel").

## Game design — 12 rounds, ~20s each (config in shared/scenario.json, all numbers tunable)

Engine formulas (deterministic, NO LLM in market physics):

- Total demand: D = max(0, 140 − 10 × avgPrice)
- Share: start 50/50; switching fraction = clamp(0.2 × priceGap, −0.5, 0.5) toward cheaper stand
- Revenue = min(demandShare, inventory) × price; FIFO crate sales; crates age each round,
  destroyed at age > 3
- Production paid immediately at unitCost ($2 base)

Scripted event timeline (each event = one economics concept entering as a character — and one
GRADED TASK, see Grading below):

- R1–3: free play (equilibrium discovery, elasticity, marginal-cost pricing, spoilage)
- R4: ❄️ FROST — unitCost 2→4 for everyone (supply shock; examiner watches for anchoring)
- R6: 📜 TAX — $1/crate sales tax announced by town-crier decree (policy/incidence)
- R8: 🕵️ SHADY SUPPLIER — offers each player 20 crates at $1 that have a 50% chance of being bad;
  bad crates sold to townsfolk generate angry bubbles next round and a −20% demand reputation
  penalty for 2 rounds (market for lemons / hidden quality / reputation)
- R10: 🤝 CARTEL OFFER — NPC rival (or the other player, if 2 humans) proposes "both price at $8".
  Engine makes defection profitable next round. (Nash equilibrium / collusion & defection)
- R12: game ends → examiner runs → reports

If fewer than 2 humans, fill with 1 NPC stand run by a simple scripted policy (NOT an LLM):
matches price moves with 1-round lag, defects from cartel round 11.

Goals: assigned on join, shown on role card, ASYMMETRIC when 2+ humans — pool: [max profit]
[reach 60% market share] [survive frost with cash > $80] [zero spoiled crates]. Goals motivate;
they are NOT the grade.

## Grading model — tasks, ratings, and the professor leaderboard

**Principle: same world, same graded tasks for everyone; only GOALS differ.** Students are never
assigned different tasks — identical market + identical shocks is what makes cross-student
comparison legitimate. Asymmetry lives in the goal (motivation), never in the rubric (grade).

Three layers of rating, all evidence-linked to rounds:

1. **Per-task (per-event) concept ratings.** Every scripted event is a graded task. The examiner
   emits, per player, a 0–10 rating + one-line evidence for each:
   - `frost_response` (supply shock: repricing vs anchoring, R4–7)
   - `tax_response` (incidence: pass-through vs absorb, R6–8)
   - `quality_choice` (Akerlof: shady-supplier decision + reputation handling, R8–10)
   - `cartel_reasoning` (Nash: accept/refuse/defect logic, R10–12)
   - `free_play` (equilibrium discovery + spoilage discipline, R1–3)
2. **Per-skill dimensions (the radar, cohort percentiles).** The existing four:
   equilibrium_reasoning, strategic_anticipation, information_updating, risk_management.
   Task ratings are the evidence feeding these; dimensions are the aggregate.
3. **Detected biases** (anchoring, sunk-cost holding, herding) with round numbers.

**Professor view (`/professor`, no auth for demo).** A pixel-styled class dashboard:

- **Leaderboard, decision-quality ranking FIRST, profit second** — visually side by side so the
  point lands that they differ. Columns: student, decision-quality percentile, per-task ratings
  (5 mini-cells, color-coded), profit, goal + achievement %.
- Sortable by any task column ("who failed the tax event?").
- **Clustered misconceptions** row per task: "4 of 6 never repriced after frost — cost anchoring
  (view list)".
- Every AI rating is evidence-linked (click → that round's Town Crier snapshot) and
  **professor-overridable**: an override control per cell writes {taskId, studentId, newScore,
  note} through storage.js; overridden cells show a ✏️. AI proposes with evidence; professor
  disposes.
- Skill models (incl. per-task ratings + overrides) persist to storage AND to EverOS memory keyed
  by studentId — next session's orchestrator casts against the weakest task/dimension.

Student report keeps goal achievement SEPARATE from grade, with the one-line
achievement-vs-quality gap callout.

## Decision logging (grading fuel — never skip)

Every confirmed action stores: {round, playerId, intent (raw text or chip label or event choice),
action, visibleState (exact state shown to player that round)}. Cartel accept/refuse and
shady-supplier buy/refuse are decisions too.

## Delegate agent (small model)

System prompt: convert the player's instruction into
`{"action":{"price":n,"produce":n},"question":null}` or `{"action":null,"question":"..."}`; at
most one short clarifying question and only for genuine price/production ambiguity; resolve
relative instructions ("undercut slightly") against the rival's last price; price 1–15, produce
0–100; respond ONLY with JSON. Strip code fences, retry once on parse failure, then fall back to
last round's action and note it in chat ("I wasn't sure, so I kept our prices steady!"). 8s
timeout → same fallback. The chat reply to the player is a one-line in-character confirmation,
generated from the parsed action by TEMPLATE, not by the LLM (keeps ticks fast).

## Examiner agent (large model, runs once at game end, one batched call per player)

Grade DECISION QUALITY given only information visible at each moment — never outcomes, never
eloquence. Cross-check stated intent vs action taken. Score 0–10 with 2–3 evidence rounds each:
equilibrium_reasoning, strategic_anticipation (incl. inferring rival's goal, cartel reasoning),
information_updating (frost/tax/quality reaction vs anchoring), risk_management (spoilage,
reputation, margin exposure). ALSO score the five per-task concept ratings (see Grading model)
in the same call — one JSON output carries both. Detect biases (anchoring, sunk-cost holding)
with round numbers, and one goal_progress_comment kept separate from scores. Output strict JSON.
Compute cohort percentiles per dimension AND per task in plain JS afterward.

## Report screen (pixel dashboard)

Per player, end of game: pixel-styled radar (SVG polygon, hand-rolled — do NOT add a chart
library) of the 4 skills with percentile bands vs cohort; below, per-skill evidence rounds
linking into Town Crier snapshots; per-task rating strip (5 cells); goal achievement shown
separately with one line on the achievement-vs-quality gap; detected-biases list with cute
framing ("🧊 Frozen in place: you never repriced after the frost — rounds 4–7"). Plus a simple
all-players leaderboard toggle: decision-quality ranking FIRST, profit ranking second (make the
point visually that they differ).

## Admin page (/admin, no auth)

Buttons: start game, force-resolve round, inject any event early, add NPC, seed a fake 6-player
completed cohort (for percentile demos), reset. Big pixel buttons — this page is on stage.

## Build order (commit after each; STOP and verify before proceeding)

1. Engine + tick loop headless: scripted 12-round test with 2 hardcoded policies prints sane
   numbers and a full cascade log (hand-check: R1 both at $5 → D=90 → 45/45).
2. Minimal UI: join, three-column layout, text-only state, chip actions work end to end with 2
   browser tabs.
3. Delegate chat wired to Nebius.
4. Town view: crowd rendering + walking on resolve + speech bubbles + event banners.
5. Events R4/R6/R8/R10 + NPC policy.
6. Examiner (skills + per-task ratings) + report + seeded cohort percentiles.
7. Professor dashboard (/professor): leaderboard (quality-first), per-task columns, clustered
   misconceptions, override controls persisted through storage.js.
8. Polish pass: pixel styling, animations, mobile layout.

Acceptance test for "done": two phones join, play 12 rounds with all four events firing,
townsfolk visibly migrate on every price change, both players receive different radar reports
with evidence links + per-task ratings, the professor page ranks the class by decision quality
with at least one clustered misconception and a working override, and the admin can trigger
frost with one button. Keep every module under ~200 lines; comment the formulas with their
economics names (elasticity, Bertrand, Akerlof) so the code itself is pitch-ready.

## Reuse map (what `main` already gives you)

| Lemonville piece | Existing on `main` | Action |
|---|---|---|
| Engine formulas + tick loop | `ripple/server/market.js`, `index.js` | Extend with tax/quality/cartel + event timeline |
| Delegate JSON contract + fallback chain | `ripple/server/agents/delegate.js` | Swap Anthropic client for Nebius OpenAI-compatible client; keep parse/clamp/fallback |
| Examiner rubric + percentiles | `ripple/server/agents/examiner.js` | Add per-task ratings to the schema; swap client |
| Storage wrapper + Butterbase app (`app_bofh7mbux05x`) | `ripple/server/butterbase.js` | Rename/alias as `storage.js`; add `saveOverride` |
| EverOS memory + adaptive casting | `ripple/server/evermind.js`, `orchestrator.js` | Keep as-is; feed per-task weaknesses into casting |
| Seeded 6-player cohort | `ripple/test/fixtures.js` | Reuse for /admin seed + professor demo |
