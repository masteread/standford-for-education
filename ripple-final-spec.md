# Ripple — Final Project Spec (v2)

**AI for Education Hackathon @ Stanford · July 11, 2026 · Team of 2 · build 1:00–5:00 PM · demo 5:00**

## One-liner

An agent-native market simulation where university students learn economic theory by living it: they command delegate agents in plain English, pursue goals the orchestrator assigns them, watch every decision cascade through a shared market, and get graded on decision quality — not outcomes, not essays.

## Doability verdict

Core loop is 4 hours for two experienced builders IF cut lines are respected. Negotiation and second scenarios are stretch-only. Feature freeze at 4:15 is law.

## Why this wins

- **Track:** Adaptive Evaluation Engines (near-verbatim: "simulate real-world scenarios, probe understanding, personalized evaluations beyond static tests"). Secondary: Autonomous Learning Agents (adaptive casting + goals).
- **Not a tutor:** Inverts the "AI watches student, adapts content" topology every other team and the sponsor use. Students act in a world; assessment reads off actions.
- **Un-cheatable:** Evidence = live decisions in a shared market. Cannot be outsourced to ChatGPT.
- **Fair comparison:** Same market, same shocks for everyone → percentile comparison is finally legitimate. Answers "how do I compare to the class."
- **Demo weapon:** Judges play from phones; we inject a frost shock; the cascade ripples through THEIR decisions; 90s later each judge gets a personal skill radar.

---

## THE SCENARIO (build exactly this one): "Lemon Wars"

Two lemon growers (students/judges) + formula-driven consumers. 12 rounds, 15–20s each.

**Role card (shown on join):**
> You grow lemons. Cost: $2/crate. Start: $100 cash, 20 crates. Lemons spoil after 3 rounds. Your rival: Grower B.
> **YOUR GOAL: [assigned by orchestrator — see Goals]**

**Market math (Person A codes these exactly):**
- Total demand per round: `D = 140 − 10 × avg_price` (clamped ≥ 0)
- Split: consumers prefer cheaper grower; switching fraction per round = `0.2 × price_gap` (capped at 0.5). Equal prices → 50/50.
- Revenue = min(demand_share, inventory) × price. Unsold crates carry over; crates older than 3 rounds are destroyed (spoilage).
- Production decided per round at $2/crate ($4 after shock), paid immediately.
- **Round 8 — FROST SHOCK:** unit cost doubles $2 → $4, announced as a news banner. This is the assessment centerpiece.

**Elasticity twist (cheap, high-value):** rounds 1–12 sell lemons (elastic). If time allows in Phase 3, a parallel "medicine" good with `D = 60 − 2 × price` (inelastic) — same price hike, opposite revenue effect. Otherwise it's a slide.

## GOALS SYSTEM (new in v2)

- Every role card carries an explicit goal. Goals MOTIVATE; the rubric GRADES. Never grade goal achievement directly — outcomes conflate understanding with luck.
- **Asymmetric goals:** orchestrator can assign different goals in the same market. A: "maximize profit over 12 rounds." B: "capture 60% market share; profit secondary." B's aggression becomes rational; A must INFER B's objective from behavior — an advanced skill no quiz tests.
- Report shows both numbers: `Goal achieved: 62% · Decision quality: 78th percentile`. The gap is diagnostic (high achievement + low quality = lucky; reverse = good thinking, hard role).
- Goal pool for v1: max profit / max market share / survive shock with cash > $80 / end with zero spoiled crates.

## PLAYER EXPERIENCE (each round)

Three panels:
1. **You:** cash, inventory (with crate ages), unit cost, your goal.
2. **Market:** rival's last price, total demand last round, average price, news banner.
3. **Command box:** free-text intent ("raise to $7, demand can take it") OR quick chips (Raise / Undercut / Hold / Produce more). Chips = judge-friendly onboarding; typed intent = the AI-native path the examiner grades against.

Delegate agent: converts intent → `{price, produce}` action JSON. May ask ONE clarifying question per round ("raise to $7 — hold production at 40, or cut since you'll sell less?" — the question itself teaches price/quantity coupling). Big moves (price change > $1) require a one-line "why?" — stored as intent for the examiner.

**Interaction model:** students never talk directly; they interact THROUGH the market via their delegates. Your price move is your message; the rival's response is theirs. (Delegate-to-delegate negotiation = STRETCH ONLY: enables cartel/defection lessons; do not build before 4:15 unless everything else is done.)

## CASCADE LOG (demo centerpiece — never cut)

Every computed effect appends `{round, cause, effect, affected}`. Example trace to reproduce in rehearsal:
```
R7: A raised price $5 → $7
R7: 18 of A's 40 buyers switched to B; 6 stopped buying
R7: A revenue $200 → $154  (price +40%, revenue DOWN — elastic demand)
R8: B sold out; B raised production 40 → 55
R8: A's 18 unsold crates aged (spoil in 2 rounds)
R9: B raised to $6 under A's price umbrella
R9: A panic-discounted to $4 to clear spoiling stock → price war
```
Render as a chained, clickable trace. This one screen shows elasticity, competitive response, holding costs, and price-war dynamics from a single decision.

## ASSESSMENT

**Examiner agent** reads decision log entries (action + market state VISIBLE at that moment + stated intent). Rubric, 0–10 each:
1. Equilibrium reasoning — pricing toward market-clearing given observed demand
2. Strategic anticipation — modeling rival response before acting (incl. inferring rival's goal)
3. Information updating — behavior change when news arrives (frost) vs anchoring
4. Risk management — inventory/spoilage/margin exposure

Anti-prompting safeguard: examiner cross-checks stated intent vs actual action vs what the market did. You cannot eloquence past a market that called your bluff.

**Student report:** skill radar + percentile band per skill vs cohort + evidence links ("strategic anticipation 30th percentile — rounds 5, 8, 11, click to replay cascade") + goal achievement shown separately.

**Professor layer (build the dashboard stub; full version is pitch):**
- Class dashboard: score distributions per competency + clustered misconceptions ("14 of 60 never repriced after frost — cost anchoring; list").
- Every AI score is evidence-linked and professor-overridable. Rubric weights configurable per course. AI proposes with evidence; professor disposes.

## LESSON = CONFIG + GOAL + RUBRIC WEIGHTS (the scalability claim)

22 concepts reachable on one engine, 7 LIVE in Lemon Wars (equilibrium, elasticity, marginal cost, spoilage/holding, Bertrand, anchoring, shock response). Rest are config-reachable, claim honestly:
- Market fundamentals → demand-curve + cost params
- Game theory (Cournot, Nash, cartels, tit-for-tat, goal inference) → rival count + negotiation channel + asymmetric goals
- Information econ (Akerlof's market for LEMONS — the Nobel paper is literally our fruit; hidden quality, signaling, auctions) → hide fields from some players
- Behavioral (anchoring, sunk cost, herding, loss aversion) → NO config; examiner detects in any log
- Policy (taxes, subsidies, price floors/ceilings, externalities) → professor injects events live

Pitch line: "You just watched one config. Here are twenty-one more."
NOT viable (say so if asked): macro, monetary policy, long-horizon growth. Scoping honesty reads as strength.

## ARCHITECTURE & STACK

```
Student phone UI (React)
 → Delegate agent (Claude API)
 → Market engine (tick loop, deterministic JS formulas)  ←→ Butterbase
 → Cascade log
 → Examiner agent (Claude API)
 → Skill radar (Recharts or table)
 ↻ Orchestrator agent → roles + goals next round
```
- Node/Express server owns tick loop. 2s polling (WebSockets only if trivial).
- LLMs play characters only; world physics = formulas (fast, free, fair, reproducible).
- Butterbase: `world_state`, `decision_logs`, `skill_models`, `leaderboard` (shared collections).

## DATA CONTRACTS (agree on paper before splitting)

Tick state:
```json
{"round":7,"growers":[{"id":"A","price":7,"produced":40,"sold":22,"inventory":[{"age":1,"crates":18}],"cash":312,"unitCost":2,"goal":"max_profit"}],"market":{"totalDemand":84,"avgPrice":6,"news":null}}
```
Decision log entry:
```json
{"round":7,"studentId":"A","intent":"raise to 7, demand can take it","action":{"price":7,"produce":40},"visibleState":{...}}
```
Cascade entry:
```json
{"round":7,"cause":"A raised price 5→7","effect":"18 buyers switched A→B","affected":"B"}
```

## OWNERSHIP & TIMELINE

**Person A — World:** engine, formulas above, spoilage, frost event, cascade log + viz, market UI panels.
**Person B — Agents & assessment:** delegate (+1 clarifying Q), examiner + rubric, radar report, orchestrator (roles + goals), Butterbase, phone join + chips.

| Time | Milestone |
|---|---|
| 11:20–1:00 | Butterbase setup, repo scaffold, data contracts agreed on paper |
| 1:00–2:15 | A: engine + cascade. B: delegate + phone UI shell. **CHECK: intent typed → market moves** |
| 2:15–3:30 | A: frost + cascade viz. B: examiner + radar. **CHECK: full loop, 2 sim students** |
| 3:30–4:15 | Orchestrator (roles+goals), percentiles, chips, multi-phone test; elasticity twist ONLY if ahead |
| 4:15–5:00 | FREEZE. Rehearse ×2 with seeded cohort, script frost injection, record fallback video |

## CUT LINES (in order)

1. Orchestrator → slide ("casting adapts next round; here's the stored skill model")
2. Radar chart → score table
3. Clarifying question → drop
4. Goals shrink to two (profit vs market share)
5. Chips → free text only

**NEVER CUT: cascade trace + examiner report. They ARE the demo.**

## DEMO SCRIPT (3 min)

1. (20s) "Universities grade 300-person lectures with multiple choice because nothing else scales — and take-home work is now compromised anyway. We built assessment you can't outsource."
2. (30s) Judges scan QR → each gets a role card with a goal (asymmetric!). They set opening prices via chips or intent.
3. (60s) Two rounds live → FROST injected → cascade trace shows consequences rippling through their own decisions.
4. (60s) Examiner runs → each judge gets a skill radar vs the room. Call one out: "Strategic anticipation, 30th percentile — rounds 2 and 3, here's the replay."
5. (10s) Concept-map slide: "You watched one config. Twenty-one more concepts are a JSON file away." Close: "Their decisions, not their essays, are the transcript."

Fallback: pre-recorded run + seeded cohort if wifi or judge participation fails.

## JUDGE FAQ

- **"Just Capsim?"** Those grade final profit; outcomes conflate understanding with luck. We grade each decision against the information visible at that moment plus stated intent. Decision-level assessment is the new part.
- **"Where's the AI?"** AI plays the characters (delegate, examiner, orchestrator); the world is deterministic math — fast and fair. Agent-native where it matters.
- **"Grading prompting skill?"** No — world outcomes are the evidence, and intent is cross-checked against action. Articulating strategy is a legitimate university-level objective anyway.
- **"Why lemons?"** Spoilage teaches holding costs — and Akerlof's Nobel paper on information asymmetry is literally titled "The Market for Lemons." Our roadmap is hiding in our demo.
- **"Does goal achievement matter?"** Shown, not graded. The gap between goal achievement and decision quality is itself diagnostic.
