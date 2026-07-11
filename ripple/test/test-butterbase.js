// B1 done-when: test write/read round-trips (in-memory fallback path).
import "./loadenv.js";
import {
  saveState,
  appendDecision,
  saveSkillModel,
  getLeaderboard,
  getDecisions,
  getSkillModel,
  _resetForTests,
} from "../server/butterbase.js";

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  if (!ok) failures++;
};

_resetForTests();

await saveState(1, { round: 1, growers: [], market: {} });
await appendDecision({ round: 1, studentId: "A", intent: "hold", action: { price: 5, produce: 20 } });
await saveSkillModel("A", { name: "Ada", scores: { equilibrium_reasoning: { score: 8 } } });
await saveSkillModel("B", { name: "Bo", scores: { equilibrium_reasoning: { score: 4 } } });

check("appendDecision round-trips", getDecisions("A").length === 1);
check("saveSkillModel round-trips", getSkillModel("A")?.name === "Ada");

// The cloud leaderboard is shared and persistent, so other test runs'
// students may be present — assert our two entries exist and are ordered.
const board = await getLeaderboard();
const posA = board.findIndex((r) => r.studentId === "A");
const posB = board.findIndex((r) => r.studentId === "B");
check(
  "leaderboard contains A above B (quality 8 vs 4)",
  posA !== -1 && posB !== -1 && posA < posB,
  board.map((r) => `${r.studentId}:${r.decisionQuality}`).join(" ")
);

process.exit(failures ? 1 : 0);
