# 🍋 Lemonville — an agent-native economics classroom

Lemonville is a live, multiplayer market simulation for teaching economics. Students
run businesses in a pixel-art supply chain (farms → wholesalers → grocers → cafés),
command an **AI delegate** in plain English, watch every decision ripple through the
whole town, and get an **AI-graded skill report** at the end — graded on the *quality
of their decisions*, not on luck or on an essay a chatbot could have written.

It's built for a classroom: the professor injects shocks (a frost, a tax, a shady
supplier, a cartel offer) and a dashboard ranks the class by **decision quality vs.
profit** — so students see that winning and *understanding* aren't the same thing.

> **Runs with zero setup and zero API keys.** The AI agents have built-in offline
> fallbacks, so you can teach a class today. Add your own LLM key when you want the
> full natural-language + AI-grading experience (see [Bring your own key](#bring-your-own-key)).

---

## Quick start

**Requirements:** [Node.js](https://nodejs.org) **20 or newer**. That's it.

```bash
git clone https://github.com/masteread/standford-for-education.git
cd standford-for-education/ripple
npm install
npm run dev
```

Open **http://localhost:3001** — enter a name and start playing. Done.

The three screens:

| URL | Who | What |
|-----|-----|------|
| `http://localhost:3001/` | **Students** | Join and run a business |
| `http://localhost:3001/admin` | **You (host)** | Start the game, inject events, add NPCs, reset |
| `http://localhost:3001/professor` | **You (host)** | Class dashboard: skill rankings, per-task scores, misconceptions |

---

## Running a class (multiple students)

Everyone just needs to be on the **same Wi-Fi** as the machine running the server.

1. Start the server (`npm run dev`). On boot it prints a join URL, e.g.
   `players on the same wifi join at: http://192.168.1.42:3001/`.
2. Students open that URL on their phones (or scan the QR shown on the join screen).
3. Up to **11 students** play at once, one per seat across the four tiers
   (3 farms, 2 depots, 3 grocers, 3 cafés). Empty seats are filled by scripted NPCs,
   so it works with any class size — even one student vs. the town.
4. You drive the room from `/admin` (inject the frost, the tax, etc.) and reveal the
   `/professor` dashboard at the end.

> Students on **cellular / a different network** need a public URL. Expose the server
> with any tunnel (e.g. [`cloudflared tunnel --url http://localhost:3001`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/))
> and set `PUBLIC_URL=<your https url>` in `.env` so the join QR points to it.

---

## Bring your own key

The game plays fine with no key (offline delegate + heuristic grader). For the full
experience — students typing free-form strategy and a large model writing the skill
reports — add **your own** API key. It works with **any OpenAI-compatible provider**
(Nebius, OpenAI, Together, Groq, Fireworks, OpenRouter, a local Ollama/vLLM, …).

```bash
cd ripple
cp .env.example .env      # then edit .env
```

Set these in `.env` (see `.env.example` for per-provider examples):

```ini
LLM_API_KEY=sk-your-own-key
LLM_BASE_URL=https://api.openai.com/v1/     # or your provider's endpoint
LLM_MODEL_SMALL=gpt-4o-mini                 # fast model for the student's delegate
LLM_MODEL_LARGE=gpt-4o                      # stronger model for the examiner/grading
```

Restart the server. Verify connectivity any time with `npm run test:nebius`.

**Your key stays yours.** `.env` is git-ignored and never committed. There are no
project-owned keys baked into this repo — check for yourself with `git grep -i api_key`.

---

## What gets graded (and why it's hard to cheat)

The examiner scores the **decision at the moment it was made**, against the information
visible then — never the final profit. It reports:

- **4 skill dimensions:** equilibrium reasoning, strategic anticipation, information
  updating, risk management.
- **5 per-task concept scores:** free-play, frost response, tax incidence, hidden-quality
  (Akerlof) choice, cartel/Nash reasoning.
- **Ecosystem impact:** how each student's moves changed total town welfare
  (a butterfly-effect ledger computed by the engine, not the LLM).

The professor dashboard ranks the class by decision quality *and* by profit, side by
side, and clusters misconceptions ("4 of 11 never repriced after the frost — cost
anchoring"). Every score is evidence-linked to specific rounds and professor-overridable.

---

## Customize the lesson

The whole scenario is data in [`ripple/shared/scenario.json`](ripple/shared/scenario.json):
number of rounds, tiers/seats, demand curve, costs, and the event timeline (which shock
fires on which round). Edit it to teach a different concept — no code changes needed.

## Tests

```bash
cd ripple
npm run test:all        # engine + storage + agents (all offline, deterministic)
```

## Optional persistence

By default everything lives in memory (perfect for a single class). To persist world
state, decision logs, and skill models across sessions, set the optional
`BUTTERBASE_*` (storage) and/or `EVEROS_*` (cross-session skill memory) variables in
`.env`. Both degrade gracefully to in-memory when unset — the game never blocks on them.

## License

[MIT](LICENSE) — free for any teacher, school, or student to use, modify, and share.
