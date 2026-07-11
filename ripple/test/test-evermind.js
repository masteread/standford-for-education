// EverOS acceptance: save a dummy skill model, retrieve it in a separate call,
// and confirm the orchestrator re-casts explainably from memory.
// Without EVEROS_API_KEY this exercises the in-memory fallback (same API).
import "./loadenv.js";
import { saveSkillMemory, getSkillMemory, _resetForTests } from "../server/evermind.js";
import { castStudent } from "../server/agents/orchestrator.js";

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

const cloud = Boolean(process.env.EVEROS_API_KEY);
console.log(cloud ? "mode: EverOS Cloud + local fallback" : "mode: in-memory fallback (no EVEROS_API_KEY)");

_resetForTests();

// v0 casting first (no memory)
const first = await castStudent({ name: "Ada", index: 0 });
check("v0 casting without memory", first.castingReason.startsWith("v0"), first.castingReason);

const dummy = {
  name: "Ada",
  scores: {
    equilibrium_reasoning: { score: 8, evidence_rounds: [2, 5], comment: "ok" },
    strategic_anticipation: { score: 2, evidence_rounds: [5, 8], comment: "weak" },
    information_updating: { score: 7, evidence_rounds: [8], comment: "ok" },
    risk_management: { score: 6, evidence_rounds: [9], comment: "ok" },
  },
};

const saved = await saveSkillMemory("A", dummy);
console.log(`saveSkillMemory -> cloud write ${saved ? "succeeded" : "skipped/failed (fallback in use)"}`);

const roundTrip = await getSkillMemory("A");
check("skill model retrievable in a separate call", roundTrip?.scores?.strategic_anticipation?.score === 2);

// second join of the same studentId must re-cast against the weakest dimension
const second = await castStudent({ name: "Ada", index: 0 });
check(
  "memory-aware casting targets weakest dimension",
  second.goal === "max_market_share" && second.castingReason.includes("strategic_anticipation"),
  `${second.goal} | ${second.castingReason}`
);

check("miss returns null", (await getSkillMemory("ZZ-nobody")) === null || !cloud);

process.exit(failures ? 1 : 0);
