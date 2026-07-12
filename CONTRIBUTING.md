# Contributing to Lemonville 🍋

Thanks for helping make economics fun to teach! Lemonville is an open-source
classroom simulation, and contributions from teachers, students, and developers
are all welcome — whether that's a bug fix, a new lesson scenario, a translation,
or just clearer docs.

## Ways to contribute

- **🐛 Report a bug or suggest an idea** — open an [issue](https://github.com/masteread/standford-for-education/issues).
  For bugs, include your OS, Node version (`node -v`), and the steps to reproduce.
- **📚 Share a lesson** — Lemonville's whole scenario lives in one JSON file. New
  scenarios (different concepts, demand curves, event timelines) are the most
  valuable contribution of all. See [Adding a lesson](#adding-a-lesson).
- **💻 Fix or build** — pick up an issue, or propose a change in an issue first if
  it's large.
- **🌍 Translate** — UI strings and role/goal text live in the client + scenario;
  happy to help wire up a language you want to add.

## Project layout

Everything lives under [`ripple/`](ripple/):

```
ripple/
  server/        # Express + deterministic tick loop (the "world")
    index.js       # tick loop, HTTP routes, and the market/economics formulas
    events.js      # scripted shocks: frost, tax, shady supplier, cartel
    cascade.js     # the butterfly ripple / consequence log
    npc.js         # scripted (non-LLM) NPC policies that fill empty seats
    agents/        # delegate (per student) + examiner (grading) + orchestrator (casting)
    storage.js     # optional persistence (in-memory by default)
  client/src/    # React UI (esbuild — no bundler config to fight)
    Town.jsx       # the animated pixel town
    Game.jsx       # the 3-column play screen
    Professor.jsx  # the class dashboard
  shared/
    scenario.json  # THE LESSON — rounds, tiers, demand, events (edit this!)
  test/          # deterministic offline tests
```

Design rule of the repo: **the world is deterministic math; the LLM only plays
characters (delegate, examiner).** Anything that must be fair, fast, and
reproducible belongs in the `server/` engine, not in a prompt.

## Getting set up

Requires **Node 20+**.

```bash
git clone https://github.com/masteread/standford-for-education.git
cd standford-for-education/ripple
npm install
npm run dev          # serves http://localhost:3001
```

No API keys needed — the AI agents fall back to deterministic offline versions.
To develop against real LLMs, copy `.env.example` to `.env` and add your own key
(any OpenAI-compatible provider). See the [README](README.md#bring-your-own-key).

## Before you open a pull request

1. **Run the tests** — they're offline and deterministic:
   ```bash
   cd ripple && npm run test:all
   ```
   If you changed the engine, `test/test-engine.js` should still pass (and add an
   assertion for your new behavior).
2. **Keep it playable with no keys.** Every feature must work in offline/mock mode
   (`RIPPLE_MOCK=1`) so a teacher with no account can still run a class.
3. **Never commit secrets.** `.env` is git-ignored; there are no project-owned keys
   in the repo. Double-check with `git grep -i api_key` before pushing.
4. **Match the surrounding style** — small modules, formulas commented with their
   economics names, plain JavaScript (no build step for the server).
5. Write a clear PR description: what changed, why, and how you verified it.

## Adding a lesson

You can teach a different concept **without touching code** — edit
[`ripple/shared/scenario.json`](ripple/shared/scenario.json):

- `rounds`, `roundSeconds` — length and pace
- `tiers` — the businesses students run, their price/quantity bounds
- `demand`, costs — the market fundamentals
- `events` — which shock fires on which round (frost, tax, shady supplier, cartel)

Restart the server and your new lesson is live. If you build something great,
please open a PR adding it as a named scenario so other teachers can use it.

## Code of conduct

Be kind. This is a project for classrooms — assume good faith, welcome newcomers,
and keep discussion constructive. Harassment of any kind isn't tolerated.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
