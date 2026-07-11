# Lemonville — 2-Minute Live Demo Script

**Cast:** Shreeya = narrator (all the talking) · Eduardo = driver (laptop + phone, 2 short lines total)

## Pre-demo checklist (do 10 min before, not on stage)

- [ ] Laptop on venue wi-fi. Server running: `cd ripple && RIPPLE_MOCK=1 node server/index.js`
      (with EverMind/Nebius keys in `.env`, drop `RIPPLE_MOCK=1` for live agents)
- [ ] Projector tab: `localhost:3001/live` (shows lobby + giant QR)
- [ ] Hidden tab: `localhost:3001/admin` (START + FORCE RESOLVE + inject FROST live here)
- [ ] Eduardo's phone: already joined as a **farmer** (type name, pick seat, press I'M READY)
- [ ] Shreeya's phone: already joined as a **grocer**
- [ ] Do a full reset right before going on stage: `/admin` → ♻ RESET → re-join both phones
- [ ] NEVER wait for the 35s timer on stage — Eduardo drives every round with ⏭ FORCE RESOLVE

## Timeline (2:00 strict)

### 0:00–0:20 — Hook (slide 1 up, then switch to projector)
**SHREEYA:** "Economics is taught with formulas. Students memorize D equals a minus bP
and never *feel* a market. So we turned the classroom itself into the economy.
This is Lemonville — every student runs one business in a living supply chain:
farms, depots, grocery stores, cafés… and 24 simulated townsfolk doing the shopping."

*(Eduardo: switch projector tab to `/live` — lobby with QR is on screen)*

### 0:20–0:35 — The class joins
**SHREEYA:** "You join by scanning — go ahead, a couple of you, take a seat."
*(pause 5 seconds — seats flip from 🤖 npc to 🧑 taken, live on the wall)*
"Any seat nobody takes plays itself. The town is always complete."

*(Eduardo: `/admin` → ▶ START)*

### 0:35–1:05 — The butterfly moment ⭐ (the whole demo is this)
*(Eduardo on his phone: raise farm price $3 → $6, press ✅ CONFIRM.
Then `/admin` → ⏭ FORCE RESOLVE. Town animates: trucks reroute, folk walk.)*

**EDUARDO (line 1 of 2):** "I just doubled my farm's price. Watch the town."

**SHREEYA** *(pointing at the 🦋 feed as it appears)*: "Look at the right side —
the engine re-simulates the entire town *without* his move and diffs the two worlds.
That's a real counterfactual, not a script: *'Eduardo's Farm raised price three to six —
felt by Old Mill Farm plus thirty-six, Big Crate Depot minus twelve, three townsfolk priced out.'*
The trucks you saw reroute? That's the depots switching to the cheaper farm. That's Bertrand
competition — nobody coded that outcome, it emerged."

### 1:05–1:30 — The shock
*(Eduardo: `/admin` → ❄️ Frost → back to `/live` → ⏭ FORCE RESOLVE)*

**EDUARDO (line 2 of 2):** "Frost. Every farm's cost just doubled."

**SHREEYA:** "Nobody else's costs moved — but watch the shock travel *down* the chain,
tier by tier, with a lag: farms reprice, depots squeeze, shelf prices rise, and the
townsfolk who can't afford lemons walk home. That's supply-shock pass-through,
happening to the class, not to a textbook."

### 1:30–1:50 — The grade + the memory (slide 3 or professor tab)
*(Eduardo: switch to `/professor` tab)*

**SHREEYA:** "And here's the teacher's side. Every student gets three separate scores:
their goal, their *decision quality* — an AI examiner grades each economic concept,
so a lucky profit doesn't hide bad reasoning — and their butterfly impact on the town.
It's built on EverOS memory: next session, Lemonville remembers each student's weakest
skill and casts them into the role that trains it. The class that remembers you."

### 1:50–2:00 — Close
**SHREEYA:** "Lemonville — the class IS the economy. Live at ripple.butterbase.dev.
Come play a round at our table." 🍋

## If something breaks (nobody panics, Shreeya keeps talking)

| Problem | Move |
|---|---|
| Wi-fi dies / nobody scans | NPCs fill all seats — demo works identically with just Eduardo's phone (or zero phones: START + FORCE RESOLVE alone animates a full NPC economy) |
| Phone won't load | Play Eduardo's move from a laptop tab (`localhost:3001`) |
| Feed shows a quiet round | FORCE RESOLVE again — NPCs move every round, there's always a story |
| Projector tab frozen | Reload `/live` — state is server-side, nothing is lost |

## One-liners Shreeya can drop if there's dead air
- "The demand curve here isn't a formula — it's 24 little people with private budgets."
- "We grade the thinking, not the profit. The lucky and the smart finally look different."
- "Every truck on that screen is a row in the trade ledger — nothing is decoration."
