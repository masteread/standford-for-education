// B4 — Examiner agent: grades the QUALITY OF EACH DECISION, not outcomes.
// One Claude call per student at game end (all rounds batched in one prompt).
// After the cohort is scored: percentiles per dimension (plain JS), skill
// models saved to Butterbase, and the model mirrored to EverOS memory
// (fire-and-forget — the report never blocks on the partner integration).
// Without ANTHROPIC_API_KEY (or with RIPPLE_MOCK=1) a deterministic heuristic
// grader runs instead, so the seeded-cohort test works offline.

import Anthropic from "@anthropic-ai/sdk";
import { saveSkillModel } from "../butterbase.js";
import { saveSkillMemory } from "../evermind.js";

const MODEL = "claude-opus-4-8";
const DIMENSIONS = [
  "equilibrium_reasoning",
  "strategic_anticipation",
  "information_updating",
  "risk_management",
];
const FROST_ROUND = 8;

const liveMode = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.RIPPLE_MOCK !== "1";

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return client;
}

// Prompt agreed in ripple-work-split.md §B4 (lightly tuned).
function buildPrompt({ goal, decisionLog, relevantCascade }) {
  return `You are an economics examiner. Grade the QUALITY OF EACH DECISION given
only the information visible at that moment. Do NOT grade outcomes or
final profit. Do NOT reward eloquent intent that contradicts the action
taken.

Scenario: duopoly lemon market, demand D = 140 - 10*avgPrice, unit cost
$2 (doubles to $4 at the round marked FROST), crates spoil after 3 rounds.
Student's assigned goal: ${goal}

Decision log (each entry: round, visible state, stated intent, action):
${JSON.stringify(decisionLog)}

Cascade events involving this student:
${JSON.stringify(relevantCascade ?? [])}

Score 0-10 on each dimension, with 2-3 specific rounds as evidence:
1. equilibrium_reasoning: pricing toward market-clearing given observed demand
2. strategic_anticipation: modeling rival responses / inferring rival's goal
3. information_updating: adapting when news arrived (frost) vs anchoring
4. risk_management: inventory, spoilage, and margin exposure

Also list: detected_biases (e.g., anchoring, sunk-cost holding) with the
round numbers that evidence them, and goal_progress_comment (1 sentence,
separate from scores — goals are motivation, not grade).

Respond ONLY with JSON:
{"scores": {"equilibrium_reasoning": {"score": n, "evidence_rounds": [..], "comment": ".."}, ...},
 "detected_biases": [{"bias": "..", "rounds": [..]}],
 "goal_progress_comment": ".."}`;
}

const dimensionSchema = {
  type: "object",
  properties: {
    score: { type: "number" },
    evidence_rounds: { type: "array", items: { type: "integer" } },
    comment: { type: "string" },
  },
  required: ["score", "evidence_rounds", "comment"],
  additionalProperties: false,
};

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: Object.fromEntries(DIMENSIONS.map((d) => [d, dimensionSchema])),
      required: DIMENSIONS,
      additionalProperties: false,
    },
    detected_biases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bias: { type: "string" },
          rounds: { type: "array", items: { type: "integer" } },
        },
        required: ["bias", "rounds"],
        additionalProperties: false,
      },
    },
    goal_progress_comment: { type: "string" },
  },
  required: ["scores", "detected_biases", "goal_progress_comment"],
  additionalProperties: false,
};

function parseExaminerJson(text) {
  const cleaned = String(text ?? "").replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, cleaned.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}

const clamp10 = (v) => Math.min(10, Math.max(0, Number(v) || 0));

// ---------------------------------------------------------------------------
// Heuristic grader (mock mode + hand-written fallback for the rehearsed run).
// Deterministic, decision-quality flavored: reads only the log, not outcomes.
// ---------------------------------------------------------------------------
export function heuristicGrade({ goal, decisionLog }) {
  const rounds = [...decisionLog].sort((a, b) => a.round - b.round);
  const prices = rounds.map((r) => r.action?.price ?? 5);

  // information_updating: did the price/production move after frost news?
  const preFrost = rounds.filter((r) => r.round < FROST_ROUND).at(-1);
  const postFrost = rounds.filter((r) => r.round >= FROST_ROUND);
  const reactions = postFrost.filter(
    (r) => preFrost && Math.abs((r.action?.price ?? 0) - (preFrost.action?.price ?? 0)) >= 0.5
  );
  const reacted = reactions.length > 0;
  const infoScore = reacted ? 6 + Math.min(3, reactions.length) : 2;
  const infoEvidence = (reacted ? reactions : postFrost).slice(0, 3).map((r) => r.round);

  // equilibrium_reasoning: penalize distance from a plausible clearing band ($4–$8).
  const inBand = prices.filter((p) => p >= 4 && p <= 8).length;
  const eqScore = clamp10(Math.round((10 * inBand) / Math.max(1, prices.length)));

  // strategic_anticipation: price changes responding to visible rival price.
  let responsive = 0;
  const responsiveRounds = [];
  for (const r of rounds) {
    const rival = r.visibleState?.growers?.find((g) => g.id !== r.studentId);
    if (rival && Math.abs((r.action?.price ?? 0) - rival.price) <= 1) {
      responsive++;
      responsiveRounds.push(r.round);
    }
  }
  const stratScore = clamp10(Math.round((10 * responsive) / Math.max(1, rounds.length)));

  // risk_management: overproduction relative to what could sell is the proxy.
  let risky = 0;
  const riskyRounds = [];
  for (const r of rounds) {
    if ((r.action?.produce ?? 0) > 55) {
      risky++;
      riskyRounds.push(r.round);
    }
  }
  const riskScore = clamp10(10 - 2 * risky);

  const detected_biases = [];
  if (!reacted) {
    detected_biases.push({
      bias: "anchoring",
      rounds: postFrost.slice(0, 3).map((r) => r.round),
    });
  }
  if (risky >= 3) detected_biases.push({ bias: "overconfidence", rounds: riskyRounds.slice(0, 3) });

  return {
    scores: {
      equilibrium_reasoning: {
        score: eqScore,
        evidence_rounds: rounds.slice(0, 3).map((r) => r.round),
        comment: `Priced inside a plausible clearing band in ${inBand}/${prices.length} rounds.`,
      },
      strategic_anticipation: {
        score: stratScore,
        evidence_rounds: responsiveRounds.slice(0, 3),
        comment: `Responded to the rival's visible price in ${responsive}/${rounds.length} rounds.`,
      },
      information_updating: {
        score: clamp10(infoScore),
        evidence_rounds: infoEvidence,
        comment: reacted
          ? "Repriced after the frost news arrived."
          : "Never repriced after frost — cost anchoring.",
      },
      risk_management: {
        score: riskScore,
        evidence_rounds: riskyRounds.slice(0, 3),
        comment: risky ? `Overproduced in ${risky} rounds (spoilage exposure).` : "Kept production within sellable range.",
      },
    },
    detected_biases,
    goal_progress_comment: `Goal "${goal}" is motivation, not grade — see percentile for decision quality.`,
  };
}

/** Grade one student. Never throws: falls back to the heuristic grader. */
export async function gradeStudent({ studentId, goal, decisionLog, cascade }) {
  const relevantCascade = (cascade ?? []).filter(
    (c) => c.affected === studentId || String(c.cause ?? "").startsWith(studentId)
  );
  if (liveMode()) {
    try {
      const response = await getClient().messages.create({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "high",
          format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        },
        messages: [
          { role: "user", content: buildPrompt({ goal, decisionLog, relevantCascade }) },
        ],
      });
      const text = response.content.find((b) => b.type === "text")?.text ?? "";
      const parsed = parseExaminerJson(text);
      if (parsed?.scores) {
        for (const dim of DIMENSIONS) {
          if (parsed.scores[dim]) parsed.scores[dim].score = clamp10(parsed.scores[dim].score);
        }
        return { studentId, goal, ...parsed, source: "claude" };
      }
      console.warn(`[examiner] ${studentId}: malformed JSON, using heuristic fallback`);
    } catch (err) {
      console.warn(`[examiner] ${studentId}: ${err.message}; using heuristic fallback`);
    }
  }
  return { studentId, goal, ...heuristicGrade({ goal, decisionLog }), source: "heuristic" };
}

/** Percentile of x within values (0–100, rank-based, ties share rank). */
export function percentile(x, values) {
  if (values.length <= 1) return 50;
  const below = values.filter((v) => v < x).length;
  const equal = values.filter((v) => v === x).length;
  return Math.round((100 * (below + (equal - 1) / 2)) / (values.length - 1));
}

/**
 * Grade a whole cohort: [{studentId, name, goal, decisionLog, goalProgress}].
 * Returns models keyed by studentId, each with per-dimension percentiles.
 * Persists to Butterbase and mirrors to EverOS (both best-effort).
 */
export async function gradeCohort(students, { cascade } = {}) {
  const graded = await Promise.all(
    students.map((s) => gradeStudent({ ...s, cascade }))
  );

  const cohortScores = Object.fromEntries(
    DIMENSIONS.map((d) => [d, graded.map((g) => g.scores[d]?.score ?? 0)])
  );

  const models = {};
  for (const g of graded) {
    const student = students.find((s) => s.studentId === g.studentId);
    const percentiles = Object.fromEntries(
      DIMENSIONS.map((d) => [d, percentile(g.scores[d]?.score ?? 0, cohortScores[d])])
    );
    const model = {
      ...g,
      name: student?.name ?? g.studentId,
      percentiles,
      goalProgress: student?.goalProgress ?? null,
      gradedAt: new Date().toISOString(),
    };
    models[g.studentId] = model;

    await saveSkillModel(g.studentId, model); // Butterbase (has its own fallback)
    // EverOS partner integration: fire-and-forget, never on the critical path.
    saveSkillMemory(g.studentId, model).catch(() => {});
  }
  return models;
}
