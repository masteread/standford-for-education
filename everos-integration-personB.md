# EverOS Integration — Task for Person B

> **How to use this:** Pull this file from GitHub, open Claude Code in the repo, and paste the
> prompt in the fenced block below as your message. Everything above the block is context for you;
> the block is what Claude Code runs.

## Context

- **You are Person B** (Agents & Assessment). Person A owns the world engine + market UI.
- We're adding **EverOS (EverMind)** as the student **memory layer**. This satisfies the hackathon's
  **mandatory Cloud/AI partner-integration requirement** and opens the "Lifelong / Autonomous
  Learning Agents" tracks — the student's skill model persists across sessions instead of dying
  with the game.
- EverOS maps naturally onto what our examiner already produces: it "records agent trajectories as
  Cases and distills them into reusable Skills" — i.e. our `skill_models`.
- **Design rule:** EverOS is OFF the critical path. The cascade trace and examiner are our core and
  must never depend on it. The write is the must-have; the orchestrator read is nice-to-have.

## The prompt to paste into Claude Code

```
I'm integrating EverOS (EverMind) as the student memory layer in our Ripple project.
I'm Person B (Agents & Assessment). Do NOT touch Person A's files (server/index.js,
market.js, cascade.js, Game.jsx, Cascade.jsx, scenario.json).

Required context before writing any code:
1. Read ripple-work-split.md and ripple-final-spec.md in full.
2. EverOS is the hackathon's memory partner (it satisfies the mandatory partner-integration
   requirement). Its Memories API ("agent" context) is where we persist each student's skill
   model. Check the real API shape here before coding:
   https://docs.evermind.ai/api-reference/introduction
   Use EverOS Cloud (API key in .env), not self-host.

Design principle (critical): EverOS is OFF the critical path. The cascade trace and examiner
are our core and must never depend on it. Wrap every EverOS call in try/catch with a no-op
fallback, exactly like our butterbase.js pattern. The demo must NEVER block on memory.

Do this, in order:

A) Create server/evermind.js (next to butterbase.js) — a thin wrapper with two functions:
     - saveSkillMemory(studentId, skillModel)  -> POST to EverOS Memories API, agent context = studentId
     - getSkillMemory(studentId)               -> retrieve/search that student's prior skill model
   Both defensive: try/catch, log-and-continue, in-memory fallback. Return null on miss.

B) In server/agents/examiner.js: after we compute percentiles and save the skill model to
   Butterbase, ALSO call saveSkillMemory(studentId, model). This write is fire-and-forget,
   after the tick loop, never inside it. This is the write that guarantees the partner-integration
   checkbox even if everything else gets cut.

C) In server/agents/orchestrator.js: before assigning role/goal, call getSkillMemory(studentId).
   If a prior profile exists, cast against the historically weakest dimension (e.g. low
   strategic_anticipation -> tight duopoly + market-share rival). If there's no prior memory,
   fall back to the v0 behavior (round-robin role + random goal). Keep the casting decision
   explainable in one line.

D) Add the EverOS API key to .env and .env.example (use the exact var name from the docs), and
   write a tiny test script that saves a dummy skill model and reads it back by studentId.

Constraints:
- Stay strictly in Person B's lane. Cross-column needs go through the data contracts, not by
  editing Person A's files.
- Respect the 4:15 feature freeze: the EverOS write (step B) is the must-have; the orchestrator
  read (step C) is nice-to-have and can degrade to the v0 behavior.
- Submission still happens through Butterbase MCP — don't change that.

Acceptance criteria:
- evermind.js: save a dummy skill model, retrieve it in a separate call.
- examiner: after grading, the student's skill model is persisted in EverOS and retrievable by studentId.
- orchestrator: with a seeded skill model in EverOS, a second "join" of the same studentId gets a
  different, explainable casting.
- If EverOS is unreachable, everything above still runs with the in-memory fallback and no errors
  surface in the demo.

Show me your plan before making changes.
```

## After Claude Code finishes — quick checklist

- [ ] `server/evermind.js` exists and round-trips a dummy skill model.
- [ ] Examiner writes the skill model to EverOS after grading (fire-and-forget).
- [ ] Orchestrator reads prior memory and casts explainably; falls back cleanly when absent.
- [ ] EverOS API key is in `.env` (and `.env.example` documents the var name).
- [ ] Kill the network / bad key → demo still runs on the in-memory fallback, no visible errors.

## Notes

- Confirm the exact env-var name from the EverOS docs during step D — the prompt intentionally
  leaves it to the docs rather than guessing.
- For a 4-hour hackathon, use **EverOS Cloud** (API key, zero ops), not self-host.
- Remove the final "Show me your plan before making changes" line if you'd rather it just execute.
