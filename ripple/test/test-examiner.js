// Examiner done-when (v4): the seeded 8-player, 4-tier cohort produces
// plausible, DIFFERENT scores; the anchoring grocer (never reprices after
// frost) is flagged; ecosystem-impact percentiles come from the engine numbers,
// not the LLM. Heuristic path runs offline; RIPPLE_LIVE_EXAMINER=1 grades one
// student live via Nebius.
import "./loadenv.js";
import { gradeCohort, gradeStudent, percentile } from "../server/agents/examiner.js";
import { getSkillMemory } from "../server/evermind.js";
import { seededCohort, sampleCascade } from "./fixtures.js";

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

check("percentile: max of set is 100", percentile(10, [2, 5, 10]) === 100);
check("percentile: solo player is 50", percentile(7, [7]) === 50);

process.env.RIPPLE_MOCK = "1";
const cohort = seededCohort();
const models = await gradeCohort(cohort, { cascade: sampleCascade });

const ids = Object.keys(models);
check("all 8 students graded", ids.length === 8, ids.join(","));
check("roles preserved on models", models.sF1.role === "farmer" && models.sG3.role === "grocer");

const signatures = new Set(ids.map((id) => Object.values(models[id].scores).map((d) => d.score).join("-")));
check("scores differ across players", signatures.size >= 4, `${signatures.size} distinct score profiles`);

const fred = models.sG3; // Frozen Fred
check("anchoring player flagged", (fred.detected_biases ?? []).some((b) => b.bias === "anchoring"), JSON.stringify(fred.detected_biases));
check(
  "Fred scores lowest on information_updating",
  ids.every((id) => models[id].scores.information_updating.score >= fred.scores.information_updating.score)
);

// impact comes from engine numbers on the student record, never the LLM
check("impact attached from engine", models.sW1.impact.welfareDelta === 48 && models.sG2.impact.welfareDelta === -55);
check(
  "impact percentiles rank Cai above Eve",
  models.sW1.impactPercentile > models.sG2.impactPercentile,
  `Cai ${models.sW1.impactPercentile} vs Eve ${models.sG2.impactPercentile}`
);

const remembered = await getSkillMemory("Frozen Fred");
check("skill model mirrored to EverOS memory (by name)", remembered?.scores?.information_updating != null);

delete process.env.RIPPLE_MOCK;
if (process.env.NEBIUS_API_KEY && process.env.RIPPLE_LIVE_EXAMINER === "1") {
  const live = await gradeStudent({ ...cohort[5], cascade: sampleCascade });
  check("live: examiner returns 4 scored dimensions", Object.keys(live.scores).length === 4, `source=${live.source}`);
  check("live: examiner flags anchoring on Frozen Fred", (live.detected_biases ?? []).some((b) => /anchor/i.test(b.bias)), JSON.stringify(live.detected_biases));
} else {
  console.log("SKIP: live examiner (set RIPPLE_LIVE_EXAMINER=1 to run)");
}

process.exit(failures ? 1 : 0);
