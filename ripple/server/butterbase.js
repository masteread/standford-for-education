// B1 — Butterbase storage wrapper.
// Data API (docs.butterbase.ai): rows live at {BASE}/v1/{app_id}/{table},
// auth is `Authorization: Bearer bb_sk_...` (service key, bypasses RLS).
// Every call is wrapped: local memory is written first and is the source of
// truth for the demo; the remote write is best-effort. The demo NEVER blocks
// on storage.

const BASE = process.env.BUTTERBASE_URL || "https://api.butterbase.ai";
const APP_ID = process.env.BUTTERBASE_APP_ID;
const API_KEY = process.env.BUTTERBASE_API_KEY;
const REMOTE_TIMEOUT_MS = 2500;

const configured = Boolean(APP_ID && API_KEY);

// In-memory fallback store, keyed by collection name.
const mem = {
  world_state: [],
  decision_logs: [],
  skill_models: new Map(), // studentId -> model
  leaderboard: new Map(), // studentId -> entry
};

async function remote(method, table, body, query = "") {
  if (!configured) return null;
  const url = `${BASE}/v1/${APP_ID}/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`butterbase ${method} ${table} -> ${res.status}`);
  return res.json();
}

function bestEffort(promise, label) {
  return promise.catch((err) => {
    console.warn(`[butterbase] ${label} failed (using in-memory fallback): ${err.message}`);
    return null;
  });
}

/** Snapshot the full TickState for a round. */
export async function saveState(round, tickState) {
  mem.world_state.push({ round, tickState, at: Date.now() });
  await bestEffort(remote("POST", "world_state", { round, state: tickState }), "saveState");
}

/** Append one DecisionLogEntry (see shared/contracts.md). */
export async function appendDecision(entry) {
  mem.decision_logs.push(entry);
  await bestEffort(remote("POST", "decision_logs", entry), "appendDecision");
}

/** Persist a student's graded skill model; also updates the local leaderboard. */
export async function saveSkillModel(studentId, model) {
  mem.skill_models.set(studentId, model);
  const avg = model?.scores
    ? Object.values(model.scores).reduce((s, d) => s + (d.score ?? 0), 0) /
      Math.max(1, Object.keys(model.scores).length)
    : 0;
  mem.leaderboard.set(studentId, {
    studentId,
    name: model?.name ?? studentId,
    decisionQuality: Number(avg.toFixed(2)),
  });
  await bestEffort(remote("POST", "skill_models", { studentId, model }), "saveSkillModel");
  await bestEffort(
    remote("POST", "leaderboard", mem.leaderboard.get(studentId)),
    "saveSkillModel(leaderboard)"
  );
}

/** Shared leaderboard, best decision quality first. Remote if reachable, else local. */
export async function getLeaderboard() {
  const rows = await bestEffort(
    remote("GET", "leaderboard", undefined, "?order=decisionQuality.desc"),
    "getLeaderboard"
  );
  if (Array.isArray(rows) && rows.length > 0) return rows;
  return [...mem.leaderboard.values()].sort((a, b) => b.decisionQuality - a.decisionQuality);
}

// Read helpers used by B's own tests/report; not part of the frozen 4-function contract.
export function getDecisions(studentId) {
  return mem.decision_logs.filter((d) => d.studentId === studentId);
}
export function getSkillModel(studentId) {
  return mem.skill_models.get(studentId) ?? null;
}
export function _resetForTests() {
  mem.world_state.length = 0;
  mem.decision_logs.length = 0;
  mem.skill_models.clear();
  mem.leaderboard.clear();
}
