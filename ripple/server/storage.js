// Storage facade. Spec reuse map: "alias butterbase as storage.js; add saveOverride."
// Re-exports the Butterbase wrapper's frozen 4-function contract (which already has
// its own in-memory fallback so the demo never blocks on storage) and adds the
// professor-override store.

export {
  saveState,
  appendDecision,
  saveSkillModel,
  getLeaderboard,
  getDecisions,
  getSkillModel,
  _resetForTests,
} from "./butterbase.js";

// Professor overrides: AI proposes with evidence, professor disposes. Keyed by task+student.
const overrides = new Map(); // `${taskId}:${studentId}` -> {taskId, studentId, newScore, note, at}

export async function saveOverride({ taskId, studentId, newScore, note }) {
  const rec = { taskId, studentId, newScore: Number(newScore), note: note ?? "", at: Date.now() };
  overrides.set(`${taskId}:${studentId}`, rec);
  // TODO: Butterbase — persist overrides to an `overrides` collection (best-effort).
  return rec;
}

export function getOverrides() {
  return [...overrides.values()];
}
export function getOverride(taskId, studentId) {
  return overrides.get(`${taskId}:${studentId}`) ?? null;
}
export function _resetOverrides() {
  overrides.clear();
}
