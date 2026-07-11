# Ripple — Two-Person Work Split & Build Doc

Companion to `ripple-final-spec.md`. This is the execution document: who builds what, in what order, with acceptance criteria, interfaces, and the actual agent prompts. Person A = **World** (sim engine + market UI). Person B = **Agents & Assessment** (LLM agents, grading, Butterbase, join flow).

Rule of the day: if a task is not in your column, don't touch it. Cross-column requests go through the data contracts, not through editing each other's files.

---

## 0. SHARED FOUNDATION — both together, 11:20–11:30 + first 20 min of lunch

| # | Task | Owner | Done when |
|---|---|---|---|
| 0.1 | Butterbase project setup per their setup video; both have credentials | Both | Both can read/write a test key |
| 0.2 | Repo scaffold (structure below), push, both cloned | A | `npm run dev` serves hello-world on both laptops |
| 0.3 | Data contracts (§1) copied into `/shared/contracts.md`, read aloud, agreed | Both | Verbal "agreed" — no silent assumptions |
| 0.4 | Claude API key in `.env`, one test completion runs | B | Test script prints a response |

**Repo structure:**
```
ripple/
  server/
    index.js          # Express + tick loop (A)
    market.js         # all formulas (A)
    cascade.js        # log builder (A)
    agents/
      delegate.js     # (B)
      examiner.js     # (B)
      orchestrator.js # (B)
    butterbase.js     # storage wrapper (B)
  client/
    src/
      Join.jsx        # QR/lobby + role card (B)
      Game.jsx        # 3-panel round view (A)
      Cascade.jsx     # trace viz (A)
      Report.jsx      # radar/table (B)
  shared/
    contracts.md      # the 3 JSON shapes + endpoint list
    scenario.json     # Lemon Wars config (A writes, B reads)
```

---

## 1. DATA CONTRACTS — the interface between A and B (frozen after 0.3)

**TickState** (A produces every round; B's agents and UI consume):
```json
{
  "round": 7,
  "phase": "collecting | resolving | done",
  "growers": [
    {"id": "A", "name": "Grower A", "price": 7, "produced": 40, "sold": 22,
     "inventory": [{"age": 1, "crates": 18}], "cash": 312, "unitCost": 2,
     "goal": "max_profit", "goalProgress": 0.62}
  ],
  "market": {"totalDemand": 84, "avgPrice": 6, "news": null},
  "cascade": [ CascadeEntry, ... ]
}
```

**DecisionLogEntry** (B's delegate produces; A's engine executes; B's examiner grades):
```json
{
  "round": 7, "studentId": "A",
  "intent": "raise to 7, demand can take it",
  "action": {"price": 7, "produce": 40},
  "visibleState": { subset of TickState the student could see at decision time }
}
```

**CascadeEntry** (A produces inside market.js):
```json
{"round": 7, "cause": "A raised price 5→7", "effect": "18 buyers switched A→B", "affected": "B"}
```

**HTTP endpoints (A owns server, B calls):**
- `POST /join {name}` → `{studentId, roleCard}` (A stubs; B fills roleCard via orchestrator)
- `GET /state/:studentId` → TickState filtered to what that student may see
- `POST /intent {studentId, text}` → delegate runs → `{action, clarifyingQuestion?}` (B implements handler, A wires route)
- `POST /confirm {studentId, action, intent}` → queues DecisionLogEntry for next tick
- `POST /admin/shock` → triggers frost (A) — this is the demo button
- `GET /report/:studentId` → examiner output (B)

**Butterbase collections (B owns wrapper):** `world_state` (snapshot per round), `decision_logs`, `skill_models`, `leaderboard` (shared).

---

## 2. PERSON A — WORLD (sim engine + market UI)

### A1. Tick loop (1:00–1:25)
Express server with a game object: `{round, phase, pendingDecisions[], state}`. Loop: when all active players confirmed OR 20s timer fires → `resolveRound()` → increment round → broadcast (clients poll `GET /state` every 2s — do NOT build WebSockets first).
**Done when:** two curl clients can join, submit hardcoded actions, and round advances.

### A2. Market math — `market.js` (1:25–2:15) — copy these formulas exactly
```js
const D = Math.max(0, 140 - 10 * avgPrice);          // total demand
// share: start 50/50, shift toward cheaper grower
const gap = priceB - priceA;                          // >0 means A cheaper
const shift = Math.min(0.5, Math.max(-0.5, 0.2 * gap));
const shareA = 0.5 + shift, shareB = 1 - shareA;
const demandA = Math.round(D * shareA);
const soldA = Math.min(demandA, totalInventoryA);
// costs: produce N crates at unitCost, paid immediately
// inventory aging: each round, age += 1; crates with age > 3 destroyed (spoilage)
// FIFO: sell oldest crates first
```
Frost: `POST /admin/shock` sets `unitCost = 4` for all, sets `market.news = "FROST: input costs doubled"`.
**Done when:** a scripted 12-round run with hardcoded prices produces sane numbers (hand-check round 1: both price $5 → avgPrice 5 → D=90 → 45/45 split).

### A3. Cascade log — `cascade.js` (woven into A2, +15 min)
Inside every branch of `resolveRound()` that changes someone's state, push a CascadeEntry. Minimum set of causes to instrument: price change, buyer switching, sellout, unsold inventory aging, spoilage destruction, revenue drop despite price rise (elasticity flag), shock, panic pricing (price cut > $2 in one round).
**Done when:** the R7–R9 example trace from the spec reproduces when you replay those actions.

### A4. Game UI — `Game.jsx` (2:15–3:10)
Three panels from TickState: You (cash, inventory with crate ages, unit cost, goal) / Market (rival last price, demand, avg price, news banner — make the FROST banner loud) / Command box (free-text input + 4 chips: Raise $1, Undercut rival by $0.50, Hold, Produce +10; chips just prefill the text box). Mobile-first: single column, big tap targets.
**Done when:** playable on your phone against a hardcoded rival.

### A5. Cascade viz — `Cascade.jsx` (3:10–3:45)
A vertical chained list of entries, grouped by round, arrows between cause→effect, entries mentioning YOU highlighted. Clicking an entry shows the TickState snapshot of that round (simple modal). Do not build a graph visualization — the styled list IS the feature.
**Done when:** after 5 rounds of play the trace reads like a story.

### A6. Demo hardening (3:45–4:15)
Shock button on an admin page; seed script that fast-forwards a fake 6-player cohort (B needs this for percentiles); reset endpoint.

---

## 3. PERSON B — AGENTS & ASSESSMENT

### B1. Butterbase wrapper — `butterbase.js` (1:00–1:20)
Four functions: `saveState(round, tickState)`, `appendDecision(entry)`, `saveSkillModel(studentId, model)`, `getLeaderboard()`. Follow their setup video exactly; if any call is flaky, wrap in try/catch with in-memory fallback so the demo NEVER blocks on storage.
**Done when:** test write/read round-trips.

### B2. Delegate agent — `agents/delegate.js` (1:20–2:15)
One Claude call per intent. **Prompt (draft — tune from here):**
```
You are a student's trading delegate in a lemon-market simulation.
Convert their instruction into an action. You may ask AT MOST one short
clarifying question, and only if the instruction is genuinely ambiguous
about price or production. Otherwise act.

Market state visible to the student: {visibleState}
Their current holdings: {ownState}
Their instruction: "{intent}"

Respond ONLY with JSON:
{"action": {"price": <number>, "produce": <number>}, "question": null}
or
{"action": null, "question": "<one short question>"}

Rules: price must be 1–15; produce 0–100; if the instruction is relative
("undercut slightly"), resolve it against the rival's last price; never
invent information not in the state.
```
Parse defensively (strip ```json fences). If parse fails → return `{action: lastRoundAction, question: null}` and log it — never block the tick.
**Done when:** "undercut B slightly but protect margin" against B@$6, cost $2 yields something like price 5.5, and a garbage input still returns valid JSON.

### B3. Join flow + role cards — `Join.jsx` (2:15–2:45)
Name entry → `POST /join` → role card display (holdings, rules in 3 lines, GOAL in large type). Generate QR to the join URL (any npm qr lib). Orchestrator v0 = round-robin role + random goal from pool [max_profit, max_market_share, survive_shock_cash_80, zero_spoilage]; asymmetric by construction with 2 players.
**Done when:** two phones can join and see different goals.

### B4. Examiner agent — `agents/examiner.js` (2:45–3:45) — the crown jewel, protect this time box
One Claude call per student at game end (batch all rounds in one prompt — cheaper, more coherent). **Prompt (draft):**
```
You are an economics examiner. Grade the QUALITY OF EACH DECISION given
only the information visible at that moment. Do NOT grade outcomes or
final profit. Do NOT reward eloquent intent that contradicts the action
taken.

Scenario: duopoly lemon market, demand D = 140 - 10*avgPrice, unit cost
$2 (doubles to $4 at the round marked FROST), crates spoil after 3 rounds.
Student's assigned goal: {goal}

Decision log (each entry: round, visible state, stated intent, action):
{decisionLog}

Cascade events involving this student:
{relevantCascade}

Score 0-10 on each dimension, with 2-3 specific rounds as evidence:
1. equilibrium_reasoning: pricing toward market-clearing given observed demand
2. strategic_anticipation: modeling rival responses / inferring rival's goal
3. information_updating: adapting when news arrived (frost) vs anchoring
4. risk_management: inventory, spoilage, and margin exposure

Also list: detected_biases (e.g., anchoring, sunk-cost holding) with the
round numbers that evidence them, and goal_progress_comment (1 sentence,
separate from scores — goals are motivation, not grade).

Respond ONLY with JSON:
{"scores": {"equilibrium_reasoning": {"score": n, "evidence_rounds": [..], "comment": ".."}, ...},
 "detected_biases": [{"bias": "..", "rounds": [..]}],
 "goal_progress_comment": ".."}
```
After scoring all students, compute percentiles per dimension across the cohort (plain JS on the score arrays), save skill models to Butterbase.
**Done when:** running it on A's seeded 6-player cohort produces plausible, DIFFERENT scores per player, and the anchoring player (seed one who never reprices after frost) gets flagged.

### B5. Report — `Report.jsx` (3:45–4:15)
Radar chart (Recharts) with the 4 dimensions + percentile bands; below it, per-dimension evidence rounds as links into A's cascade replay; goal achievement shown separately with the achievement-vs-quality gap called out in one sentence. Fallback if Recharts fights you: a clean table. Do not spend more than 10 min styling.
**Done when:** a judge-shaped human can read their weakness in 5 seconds.

### B6. Orchestrator v1 (only if B4/B5 done early)
Reads skill models → next-round casting: lowest dimension determines role/goal ("low strategic_anticipation → tight duopoly + market-share rival"). If time is short this is a slide — the skill models existing in Butterbase is enough to claim it credibly.

---

## 4. INTEGRATION CHECKPOINTS (hard, spoken out loud)

| Time | Check | If failing |
|---|---|---|
| 2:15 | Phone → intent → delegate → action → market moves | B stubs delegate with regex parser; A checks route wiring |
| 3:30 | Full loop: 2 players, 12 rounds, frost, examiner report renders | Cut per spec cut-lines, starting with orchestrator |
| 4:15 | FEATURE FREEZE | No exceptions. Bugs only. |
| 4:30 | Full demo rehearsal #1 on two phones + seeded cohort | Fix only what broke |
| 4:50 | Rehearsal #2 + record fallback video | — |

## 5. DEMO ROLES

- **A drives the world:** admin page, injects frost on cue, narrates the cascade trace.
- **B drives the story:** opening hook, hands QR to judges, walks one judge's radar at the end, delivers the concept-map slide and close.
- Fallback video lives on BOTH phones.

## 6. RISK REGISTER

| Risk | Owner | Mitigation |
|---|---|---|
| Venue wifi dies | Both | Fallback video; A's laptop can hotspot and run everything locally |
| Claude API latency stalls ticks | B | 20s tick timer proceeds without stragglers; delegate timeout 8s → repeat last action |
| Butterbase flaky | B | In-memory fallback behind the wrapper; sync later |
| Judges won't participate | B | Seeded cohort + one teammate plays on stage |
| Examiner JSON malformed | B | Fence-stripping + one retry + hand-written fallback scores for the rehearsed run |
| Scope creep (negotiation, 2nd good, WebSockets) | Both | Not before 4:15. Say the phrase: "slide, not code." |
