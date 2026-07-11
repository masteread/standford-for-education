# PRD — Person A: The World (Ripple)

> **Product:** Ripple — an agent-native market simulation where students learn economics by *living it*.
> **Owner of this PRD:** Person A (simulation engine + market UI).
> **Companion docs:** `ripple-final-spec.md` (the what), `ripple-work-split.md` (the who/when).
> **Build day:** Jul 11, 2026 · 1:00–5:00 PM · freeze 4:15 · demo 5:00.
> **Scenario to build:** *Lemon Wars* (lemon duopoly, 12 rounds, frost shock at R8).
> **Stack (locked):** JavaScript (ESM) + React, bundled with esbuild, single-origin served by Express — matching Person B's base. Run: `cd ripple && npm install && npm run dev`.

---

## 1. The real objective (read this before anything else)

We are not building a pretty game. We are building **a surface where every decision teaches**.

The pedagogical thesis: **a student learns demand elasticity better by raising their price, watching revenue fall, and having the system show them why — in 3 seconds, without a paragraph of text.** The world is the teacher. The UI's only job is to get out of the way and make cause→effect visible.

That gives your UI **one master rule**:

> **Every screen must make an economic relationship impossible to miss.**

If a panel doesn't teach something, it doesn't belong. Minimalism here is not aesthetics — it's **cognitive-load reduction** so that 100% of the player's attention goes to *the decision and its consequence*.

### The 3 pedagogical moments your UI must nail
1. **The decision** (Game.jsx): the player sees their state, the rival's, and acts. They should *feel* the price↔quantity trade-off before touching anything.
2. **The consequence** (Cascade.jsx): the player watches their decision ripple through the market. This is where the "aha" happens.
3. **The shock** (frost at R8): the world changes under their feet. The UI must shout the change so that anchoring to the old price *feels* wrong.

---

## 2. Person A scope (what you build, and only you)

| ID | Deliverable | File | Is UI | Never cut |
|----|-----------|------|:-----:|:-----:|
| A1 | Tick loop + server | `server/index.js` | – | ✔ |
| A2 | Market math | `server/market.js` | – | ✔ |
| A3 | Cascade log (engine) | `server/cascade.js` | – | ✔ **(it IS the demo)** |
| A4 | Round UI (3 panels) | `client/src/Game.jsx` | ✔ | ✔ |
| A5 | Cascade visualization | `client/src/Cascade.jsx` | ✔ | ✔ **(it IS the demo)** |
| A6 | Demo hardening | admin/seed/reset | partial | ✔ |

**Column rule:** you do not touch Person B's files (`delegate.js`, `examiner.js`, `orchestrator.js`, `butterbase.js`, `Join.jsx`, `Report.jsx`, `evermind.js`). Every cross-column need goes through the data contracts, not by editing their files.

**Out of scope (say "slide, not code" if it shows up before 4:15):** WebSockets, delegate-to-delegate negotiation, a second good (medicine/inelastic), a network graph for the cascade.

---

## 3. UX principles (non-negotiable)

These apply to **everything** Person A renders. When a design decision is unclear, come back here.

1. **One decision per screen.** Each round the player does exactly one thing: set price and production. Nothing else competes for attention.
2. **Mobile-first, single column.** Judges play from their phones by scanning a QR. Big tap targets (≥44px). Zero horizontal scroll. If it doesn't fit on a phone in portrait, it doesn't fit.
3. **The number is the hero, text is support.** Cash, price, inventory: large type. Labels: small and gray. The eye goes to the data, not the label.
4. **Color = meaning, never decoration.** Green = in your favor / revenue. Red = cost / loss / spoilage. Amber = shock / attention. Neutral (gray) = everything else. A colorblind player must understand by position and shape, not color alone.
5. **Motion only to teach.** An animation exists only if it marks a *state change that matters* (price going up, a buyer switching, cash dropping). Never animate to "look alive".
6. **Zero instruction screens.** Rules live in the role card (once) and in affordances. If you need a tutorial, the UI failed.
7. **Honest latency.** The delegate (Claude, Person B's) takes ~1–8s. Show a clear "thinking" state; never leave the UI frozen with no feedback. The tick advances at 20s with or without stragglers.
8. **Readable from 3 meters.** This is a live projected demo. High contrast, no gray-on-gray. A judge in the back row must be able to read the FROST banner.

### Minimal visual system (define once, reuse everywhere)
- **Type:** one sans family (system-ui / Inter). Two weights: regular and bold. Three sizes: data (32px), body (16px), label (12px).
- **Palette:** near-white background (or near-black for the projector — decide in rehearsal), ink text, + 3 semantic accents (green/red/amber). That's it. No gradients, no heavy shadows.
- **Spacing:** one scale (4/8/16/24/32). Generous air. Whitespace is part of the design.
- **Borders:** soft, consistent radii. One elevation (a subtle card shadow). No hard borders competing.

---

## 4. Screen specification

### 4.1 `Game.jsx` — the round view (A4)

Three panels stacked vertically in one column. Top to bottom, in order of attention priority:

```
┌─────────────────────────────┐
│  ROUND 7 / 12      ⏱ 14s     │  ← thin header: round + countdown
├─────────────────────────────┤
│  🎯 YOUR GOAL                │  ← goal, large (it motivates, doesn't grade)
│  Maximize profit             │
├─────────────────────────────┤
│  MARKET                      │  ← panel 2: the context to decide
│  Rival: $6   ·  Demand: 84   │
│  Avg price: $6               │
│  ┌───────────────────────┐   │
│  │ ⚠ FROST: costs x2     │   │  ← news banner (loud at R8)
│  └───────────────────────┘   │
├─────────────────────────────┤
│  YOU                         │  ← panel 1: your state
│  Cash      $312              │
│  Unit cost $2                │
│  Inventory 18 crates         │
│   · 12 fresh · 6 (spoil 2r)  │  ← crate age = teaches holding cost
├─────────────────────────────┤
│  What do we do this round?   │  ← command box
│  ┌───────────────────────┐   │
│  │ e.g. "raise to $7,     │   │  ← free text = the AI-native path
│  │  demand can take it"   │   │
│  └───────────────────────┘   │
│  [Raise $1] [Undercut B]     │  ← chips: prefill the text
│  [Hold] [Produce +10]        │
│         [ Send → ]           │
└─────────────────────────────┘
```

**Design rules for this screen:**
- **Reading order = decision order.** Goal (why) → Market (what's happening) → You (what I have) → Action (what I do). The player scrolls down and the decision is already formed.
- **Crate age is a pedagogical element, not a detail.** Showing "6 crates · spoil in 2 rounds" in **amber** teaches holding cost without a single word of theory. Don't hide it in a tooltip.
- **The FROST banner (R8) is the climax.** Full-screen for 1.5s or a fixed, prominent amber bar. It must interrupt. It's the moment the world changes and anchoring to the old price should *feel* wrong.
- **Chips prefill the input, they don't send it.** The chip writes "raise $1" into the box; the player can edit before sending. Chips = onboarding for judges; free text = what the examiner rewards.
- **Delegate state is visible.** On send: "Your delegate is thinking…". If the delegate asks ONE clarifying question (Person B's), show it inline as a mini-dialog, not a modal that covers the context — the question *itself* teaches (e.g. "raise to $7 — hold production, or cut since you'll sell less?").
- **Big moves ask for a "why?".** If the price change > $1, one line of intent is required. It's *deliberate* friction: it forces the player to articulate strategy (and feeds the examiner).

**Done when:** playable on your phone against a hardcoded rival. A judge who has never seen this sets their first price in < 15s with zero questions.

---

### 4.2 `Cascade.jsx` — the consequences visualization (A5) · **the demo weapon**

This is the screen that wins the hackathon. It's where a single decision is revealed as a chain of economic consequences. **Do not build a graph.** A styled, clickable chained list IS the feature.

```
  ROUND 7
  ┌──────────────────────────────────┐
  │ ● YOU raised price  $5 → $7      │  ← cause (highlighted: involves you)
  │   ↓                               │
  │ ○ 18 of your 40 buyers switched  │  ← effect
  │   to B · 6 stopped buying         │
  │   ↓                               │
  │ ⚡ Revenue  $200 → $154           │  ← the "aha": price +40%, revenue DOWN
  │   Price up, revenue down =        │     (elasticity flag, in red)
  │   elastic demand                  │
  └──────────────────────────────────┘

  ROUND 8   ⚠ FROST
  ┌──────────────────────────────────┐
  │ ○ B sold out                      │
  │   ↓                               │
  │ ● Your 18 unsold crates aged      │  ← involves you → highlighted
  │   (spoil in 2)                    │
  └──────────────────────────────────┘
```

**Design rules for this screen:**
- **Group by round.** Each round is a block. Inside it, entries are chained with cause→effect arrows (↓). Vertical, it reads like a story top to bottom.
- **What involves you is highlighted.** Entries that mention the current player: filled dot (●) + accent background/border. The rival's: empty dot (○), dimmed. The player finds *their* footprint at a glance.
- **The elasticity flag is the heart.** When revenue falls even though price rose, that entry goes **red** with the one-line explanation ("price +40%, revenue down = elastic demand"). That row is literally the concept we teach. Don't let it get lost among the others.
- **Click = replay.** Clicking an entry opens a simple modal with that round's `TickState` snapshot (prices, demand, inventories). B's examiner links to these same rounds ("strategic anticipation, 30th percentile — rounds 5, 8, 11 → click to replay"). Your modal is the destination of those links.
- **No heavy animation dependencies.** The cascade appears per round; new entries can do a short fade-in. Nothing more. The content is the show.

**Done when:** after 5 rounds of play the trace reads like a story. The example R7–R9 trace from the spec reproduces exactly.

---

### 4.3 Admin / demo surface (A6) — not for the player, it's for you on stage

Minimal, functional, demo-nerves-proof:
- **FROST button.** One big, obvious button on an admin page. It's *the* demo button (fires `POST /admin/shock`). Don't hide it.
- **Cohort seed.** A script that fast-forwards a fake 6-player cohort — Person B needs it for the examiner's percentiles. Without it, the radar has nothing to compare against.
- **Reset.** An endpoint to return to a clean state between rehearsals. You'll use it 4 times this afternoon.

---

## 5. The engine (non-UI, but it's the UI's source of truth)

The UI only paints what the engine computes. If the engine lies, the lesson lies. **Formula fidelity > everything.**

### A1 — Tick loop (`server/index.js`)
Game object `{round, phase, pendingDecisions[], state}`. Loop: when all active players confirmed **or** the 20s timer fires → `resolveRound()` → `round++` → broadcast. Clients poll `GET /state/:studentId` every 2s. **Do not build WebSockets first.**
**Done when:** two curl clients can join, submit hardcoded actions, and the round advances.

### A2 — Market math (`server/market.js`) — copy these formulas exactly
```js
const D = Math.max(0, 140 - 10 * avgPrice);              // total demand
const gap = priceB - priceA;                              // >0 → A is cheaper
const shift = Math.min(0.5, Math.max(-0.5, 0.2 * gap));
const shareA = 0.5 + shift, shareB = 1 - shareA;
const demandA = Math.round(D * shareA);
const soldA = Math.min(demandA, totalInventoryA);
// costs: produce N crates at unitCost, paid immediately
// aging: each round age += 1; crates with age > 3 are destroyed (spoilage)
// FIFO: sell oldest crates first
```
Frost: `POST /admin/shock` sets `unitCost = 4` for all and `market.news = "FROST: input costs doubled"`.
**Done when:** a scripted 12-round run with hardcoded prices yields sane numbers. Hand-check R1: both at $5 → avgPrice 5 → D=90 → 45/45 split.

### A3 — Cascade log (`server/cascade.js`) — the demo engine
Inside every branch of `resolveRound()` that changes someone's state, push a `CascadeEntry`. Minimum causes to instrument: price change, buyer switching, sellout, unsold inventory aging, spoilage destruction, **revenue drop despite price rise (elasticity flag)**, shock, panic pricing (price cut > $2 in one round).
**Done when:** the example R7–R9 trace from the spec reproduces when you replay those actions.

---

## 6. Data contracts (the boundary with Person B — frozen after 0.3)

You **produce** these; B consumes them. Don't change a key without saying it out loud.

**TickState** (you produce every round):
```json
{
  "round": 7, "phase": "collecting | resolving | done",
  "growers": [
    {"id":"A","name":"Grower A","price":7,"produced":40,"sold":22,
     "inventory":[{"age":1,"crates":18}],"cash":312,"unitCost":2,
     "goal":"max_profit","goalProgress":0.62}
  ],
  "market": {"totalDemand":84,"avgPrice":6,"news":null},
  "cascade": [ /* CascadeEntry, ... */ ]
}
```

**CascadeEntry** (you produce it in `market.js`):
```json
{"round":7,"cause":"A raised price 5→7","effect":"18 buyers switched A→B","affected":"B"}
```

**DecisionLogEntry** (B's delegate produces it; your engine executes it):
```json
{"round":7,"studentId":"A","intent":"raise to 7, demand can take it",
 "action":{"price":7,"produce":40},"visibleState":{ /* subset of TickState */ }}
```

**HTTP endpoints (you own the server, B calls):**
| Method | Route | Who implements | Note |
|---|---|---|---|
| POST | `/join {name}` | A stubs, B fills roleCard | orchestrator fills goal |
| GET | `/state/:studentId` | A | filtered to what that player may see |
| POST | `/intent {studentId, text}` | B the handler, A wires the route | delegate runs |
| POST | `/confirm {studentId, action, intent}` | A | queues DecisionLogEntry |
| POST | `/admin/shock` | **A** | **the demo button** |
| GET | `/report/:studentId` | B | examiner output |

**Visibility filtering matters pedagogically:** `GET /state` returns only what that player *could see* when deciding. Learning under incomplete information (inferring the rival's goal from behavior) is the advanced skill no quiz measures. Don't over- or under-filter.

---

## 7. Person A timeline (1:00–4:15, then freeze)

| Time | You build | Checkpoint |
|---|---|---|
| 1:00–1:25 | A1 tick loop | 2 curl clients advance the round |
| 1:25–2:15 | A2 formulas + A3 cascade woven in | **2:15 — typed intent → market moves** (with B) |
| 2:15–3:10 | A4 Game.jsx (3 panels) | playable on your phone |
| 3:10–3:45 | A5 Cascade.jsx | after 5 rounds the trace tells a story |
| 3:45–4:15 | A6 shock button + seed + reset | **3:30 — full loop, 2 players, frost, report** (with B) |
| **4:15** | **FREEZE** | bugs only, zero features |
| 4:30 / 4:50 | rehearsal ×2 + fallback video | fix only what broke |

**Elasticity twist (medicine, `D = 60 − 2×price`, inelastic):** ONLY if you're ahead after A5. Otherwise it's a slide. Do not code it before 4:15.

---

## 8. Acceptance criteria (Person A's definition of "done")

- [ ] **A1:** two clients join via curl, submit actions, the round advances on its own at 20s or when all confirm.
- [ ] **A2:** a 12-round run yields sane numbers; R1 with both at $5 gives a 45/45 split (hand-checked).
- [ ] **A3:** the spec's R7–R9 trace reproduces exactly when you replay those actions.
- [ ] **A4:** a new judge sets their first price in < 15s with no instructions; playable on a portrait phone.
- [ ] **A5:** after 5 rounds the cascade reads like a story; clicking an entry opens that round's snapshot.
- [ ] **Frost:** the R8 banner is impossible to ignore, even projected from 3 meters away.
- [ ] **A6:** the shock button works live; the 6-player seed runs; reset leaves a clean state.
- [ ] **Master UX:** on every screen, the economic relationship it teaches is impossible to miss.

---

## 9. Risk register (yours)

| Risk | Mitigation |
|---|---|
| Venue wifi dies | Fallback video; your laptop can hotspot and run everything locally |
| Claude latency freezes the UI | Clear "thinking" state; 20s tick advances without stragglers |
| Formulas produce weird numbers live | R1 hand-check done ahead of time; reproducible seed |
| Cascade illegible on the projector | High contrast, big data, tested at distance in rehearsal |
| Scope creep (WebSockets, 2nd good, graph) | "Slide, not code" until after 4:15 |

---

## 10. The rule that sums it all up

> **Minimalism is not removing things until it looks clean. It's removing things until only the lesson remains — and then making that lesson shine.**

Every pixel Person A renders answers one question: *what economic concept does this make visible?* If the answer is "none", it's out. If the answer is "elasticity / holding cost / competitive response / anchoring", then it's sacred and never cut.
