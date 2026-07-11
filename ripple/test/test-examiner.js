// B4 done-when: the seeded 6-player cohort produces plausible, DIFFERENT
// scores per player, and the anchoring player (never reprices after frost)
// gets flagged. Heuristic path runs offline; RIPPLE_LIVE_EXAMINER=1 also
// grades one student live via Claude.
import "./loadenv.js";
import { gradeCohort, gradeStudent, percentile } from "../server/agents/examiner.js";
import { getSkillMemory } from "../server/evermind.js";
import { seededCohort, sampleCascade } from "./fixtures.js";

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

// percentile math sanity
check("percentile: max of set is 100", percentile(10, [2, 5, 10]) === 100);
check("percentile: solo player is 50", percentile(7, [7]) === 50);

// force the heuristic path for the cohort run (deterministic, free)
process.env.RIPPLE_MOCK = "1";
const cohort = seededCohort();
const models = await gradeCohort(cohort, { cascade: sampleCascade });

const ids = Object.keys(models);
check("all 6 students graded", ids.length === 6, ids.join(","));

const signatures = new Set(
  ids.map((id) => Object.values(models[id].scores).map((d) => d.score).join("-"))
);
check("scores differ across players", signatures.size >= 4, `${signatures.size} distinct score profiles`);

const fred = models.F;
const anchoringFlagged = (fred.detected_biases ?? []).some((b) => b.bias === "anchoring");
check("anchoring player (F) flagged", anchoringFlagged, JSON.stringify(fred.detected_biases));
check(
  "F scores lowest on information_updating",
  ids.every((id) => models[id].scores.information_updating.score >= fred.scores.information_updating.score)
);

// Heuristic grader ties the five reactive players, so assert spread + Fred at
// the bottom rather than an absolute ceiling (live grading spreads wider).
const percentiles = ids.map((id) => models[id].percentiles.information_updating);
check(
  "percentiles separate Fred from the cohort",
  models.F.percentiles.information_updating < 30 && Math.max(...percentiles) - Math.min(...percentiles) >= 40,
  percentiles.join(",")
);

// EverOS mirror (in-memory fallback without a key)
const remembered = await getSkillMemory("F");
check("skill model mirrored to EverOS memory (or fallback)", remembered?.scores?.information_updating != null);

// optional live grading of one student
delete process.env.RIPPLE_MOCK;
if (process.env.ANTHROPIC_API_KEY && process.env.RIPPLE_LIVE_EXAMINER === "1") {
  const live = await gradeStudent({ ...cohort[5], cascade: sampleCascade });
  check("live: examiner returns 4 scored dimensions", Object.keys(live.scores).length === 4, `source=${live.source}`);
  const liveAnchor = (live.detected_biases ?? []).some((b) => /anchor/i.test(b.bias));
  check("live: Claude flags anchoring on Frozen Fred", liveAnchor, JSON.stringify(live.detected_biases));
} else {
  console.log("SKIP: live examiner (set RIPPLE_LIVE_EXAMINER=1 to run)");
}

process.exit(failures ? 1 : 0);
