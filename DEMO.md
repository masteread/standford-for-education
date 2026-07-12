# Lemonville — 2-Minute Live Demo Script (verified against `main`)

**Cast:** Shreeya = narrator (all the talking) · Eduardo = driver (laptop + phone, 2 short lines total)

**The world (as actually configured in `shared/scenario.json`):** 5 rounds × 24s ·
11 business seats (3 🧑‍🌾 farms, 2 🚛 depots, 3 🛒 grocers, 3 👨‍🍳 cafés) · 24 townsfolk
with private willingness-to-pay — demand slopes down *emergently*, there is no D = a − bP
anywhere in the engine. Scheduled events: **❄️ Frost fires automatically when Round 2
resolves** · 🕵️ Shady Supplier R3 · 🤝 Cartel R4 (📜 Tax is disabled for the 5-round cut;
the admin button still works if you want it).

## Pre-demo checklist (10 min before, not on stage)

- [ ] `git pull` then **`npm install`** in `ripple/` (new deps: openai/Nebius) — a stale
      install crashes the server with `Cannot find package 'openai'`
- [ ] Server up: `cd ripple && RIPPLE_MOCK=1 node --env-file-if-exists=.env server/index.js`
      (drop `RIPPLE_MOCK=1` for live Nebius/EverMind agents — mock mode is 100% safe on stage)
- [ ] Projector tab: `localhost:3001/live` (lobby + giant QR)
- [ ] Hidden tab: `localhost:3001/admin` — buttons you'll use: **▶ START**, **⏭ FORCE RESOLVE**,
      **❄️ Frost (farms)** (backup only — frost self-fires at R2), **♻ RESET**
- [ ] Eduardo's phone: joined as **farmer** (first join gets seat F1 🧑‍🌾, goal *max profit*)
- [ ] Shreeya's phone: joined as **grocer**
- [ ] Full **♻ RESET** right before going on stage → re-join both phones
- [ ] NEVER wait for the 24s round timer on stage — Eduardo drives every round with ⏭ FORCE RESOLVE

## Timeline (2:00 strict)

### 0:00–0:20 — Hook (slide 1 up, then switch to projector)
**SHREEYA:** "Economics is taught with formulas. Students memorize D equals a minus bP
and never *feel* a market. So we turned the classroom itself into the economy.
This is Lemonville — every student runs one business in a living supply chain:
farms, depots, grocery stores, cafés… and 24 simulated townsfolk doing the shopping.
There is no demand formula in this engine — the curve *emerges* from those little people."

*(Eduardo: switch projector tab to `/live` — lobby with QR is on screen)*

### 0:20–0:35 — The class joins
**SHREEYA:** "You join by scanning — go ahead, a couple of you, take a seat."
*(pause 5 seconds — seats flip from 🤖 npc to 🧑 taken, live on the wall)*
"Any seat nobody takes plays itself. The town is always complete — eleven businesses, always."

*(Eduardo: `/admin` → ▶ START)*

### 0:35–1:05 — The butterfly moment ⭐ (the whole demo is this)
*(Eduardo on his phone: raise farm price **$3 → $6**, ✅ CONFIRM. Then ⏭ FORCE RESOLVE.
Town animates: trucks reroute, folk walk.)*

**EDUARDO (line 1 of 2):** "I just doubled my farm's price. Watch the town."

**SHREEYA** *(pointing at the 🦋 ripples card as it appears)*: "Look at the right side —
the engine just re-ran this entire round *without* his move and diffed the two towns.
That's a real counterfactual, not a script — every 'felt by' number on that card is the
difference between two simulations: the depot that switched to the cheaper farm, the
rival farm that gained, the townsfolk priced out downstream. The trucks you saw reroute?
Nobody coded that outcome. That's Bertrand competition — it *emerged*."

*(If Eduardo's card reads quiet, point at ANY mover's card — NPCs move every round,
there is always a ripple to narrate.)*

### 1:05–1:30 — The shock
*(Eduardo: just ⏭ FORCE RESOLVE — **frost fires itself as Round 2 resolves**.
Banner: "❄️ FROST hit the lemon groves." If it somehow didn't, `/admin` → ❄️ Frost, resolve again.)*

**EDUARDO (line 2 of 2):** "Frost. Every farm's cost just doubled."

**SHREEYA:** "Nobody else's costs moved — but watch the shock travel *down* the chain,
tier by tier, with a lag: farms reprice, depots squeeze, shelf prices rise, and the
townsfolk who can't afford lemons walk home. That's supply-shock pass-through,
happening to the class, not to a textbook. And the examiner is watching who
*anchors* — the farmer who never reprices is about to get caught."

*(Optional if ahead of time: one more FORCE RESOLVE — R3 brings the 🕵️ shady supplier
offer to every phone: cheap crates, 50% bad, reputation on the line. One sentence:
"Akerlof's market for lemons — literally.")*

### 1:30–1:50 — The grade + the memory
*(Eduardo: FORCE RESOLVE through round 5 if not there; switch to `/professor` tab)*

**SHREEYA:** "Here's the teacher's side. Every student gets THREE separate scores,
kept apart on purpose: their 🎯 goal — that's motivation; their 🧠 decision quality —
an AI examiner grades every economic concept on what the student could *see* at that
moment, so a lucky profit can't hide bad reasoning; and their 🦋 ecosystem impact —
those same counterfactuals, summed. Per-task ratings — frost, quality, cartel — and
the professor can override any cell; AI proposes, professor disposes.
It runs on EverOS memory: next session, Lemonville remembers each student's weakest
skill and casts them into the seat that trains it. The class that remembers you."

### 1:50–2:00 — Close
**SHREEYA:** "Lemonville — the class IS the economy. Live at ripple.butterbase.dev.
Come play a round at our table." 🍋

## If something breaks (nobody panics, Shreeya keeps talking)

| Problem | Move |
|---|---|
| Wi-fi dies / nobody scans | NPCs fill all 11 seats — demo works identically with just Eduardo's phone, or zero phones: START + FORCE RESOLVE alone animates a full NPC economy |
| Phone won't load | Play Eduardo's move from a laptop tab (`localhost:3001`) |
| Feed shows a quiet round | FORCE RESOLVE again — NPCs move every round, there's always a story |
| Projector tab frozen | Reload `/live` — state is server-side, nothing is lost |
| Report/professor slow (live examiner) | Run demo in `RIPPLE_MOCK=1` — heuristic grader is instant and deterministic; or pre-seed via `/admin` seed cohort |
| Server crashed | It boots in ~2s: re-run the checklist command; RESET, re-join, keep narrating the slide |

## One-liners Shreeya can drop if there's dead air
- "The demand curve here isn't a formula — it's 24 little people with private budgets."
- "We grade the thinking, not the profit. The lucky and the smart finally look different."
- "Every truck on that screen is a row in the trade ledger — nothing is decoration."
- "Every number on a ripple card is the diff of two simulations — one with you, one without you."
