# Ripple — Data Contracts (frozen after 0.3)

Copied verbatim from `ripple-work-split.md` §1. Changes require both A and B to agree out loud.

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
  "cascade": [ "CascadeEntry, ..." ]
}
```

**DecisionLogEntry** (B's delegate produces; A's engine executes; B's examiner grades):
```json
{
  "round": 7, "studentId": "A",
  "intent": "raise to 7, demand can take it",
  "action": {"price": 7, "produce": 40},
  "visibleState": { "subset of TickState the student could see at decision time" }
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

**EverOS (B owns wrapper, off the critical path):** per-student skill model persisted as an
agent memory keyed by `user_id = studentId`. Write after examiner grading (fire-and-forget);
read (optional) by orchestrator before casting. Never blocks the tick or the demo.
