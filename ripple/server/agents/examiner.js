// Examiner agent: grades the QUALITY OF EACH DECISION, not outcomes.
// One LLM call per student at game end (all rounds batched in one prompt), via
// Nebius Token Factory (OpenAI-compatible) on the LARGE model. It emits BOTH the
// four skill dimensions AND the five per-task concept ratings in one JSON.
// After the cohort is scored: percentiles per dimension AND per task (plain JS),
// skill models saved to storage, and mirrored to EverOS memory (fire-and-forget).
// Without NEBIUS_API_KEY (or with RIPPLE_MOCK=1) a deterministic heuristic grader
// runs instead, so the seeded-cohort demo works fully offline.

import OpenAI from "openai";
import { saveSkillModel } from "../storage.js";
import { saveSkillMemory } from "../evermind.js";

const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1/";
const MODEL_LARGE = process.env.NEBIUS_MODEL_LARGE || "meta-llama/Llama-3.3-70B-Instruct";

const DIMENSIONS = [
  "equilibrium_reasoning",
  "strategic_anticipation",
  "information_updating",
  "risk_management",
];
// Each scripted event is a graded task; free_play covers the opening rounds.
const TASKS = [
  { id: "free_play", rounds: [1, 2, 3], concept: "equilibrium discovery + spoilage discipline" },
  { id: "frost_response", rounds: [4, 5, 6, 7], concept: "supply shock — repricing vs cost anchoring" },
  { id: "tax_response", rounds: [6, 7, 8], concept: "tax incidence — pass-through vs absorb" },
  { id: "quality_choice", rounds: [8, 9, 10], concept: "Akerlof hidden quality — shady-supplier decision + reputation" },
  { id: "cartel_reasoning", rounds: [10, 11, 12], concept: "Nash — accept/refuse/defect logic" },
];
const TASK_IDS = TASKS.map((t) => t.id);
const FROST_ROUND = 4;
const TAX_ROUND = 6;

const liveMode = () => Boolean(process.env.NEBIUS_API_KEY) && process.env.RIPPLE_MOCK !== "1";

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ baseURL: BASE_URL, apiKey: process.env.NEBIUS_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

function buildPrompt({ goal, decisionLog, relevantCascade }) {
  return `You are an economics examiner. Grade the QUALITY OF EACH DECISION given
only the information visible at that moment. Do NOT grade outcomes or final
profit. Do NOT reward eloquent intent that contradicts the action taken.
Cross-check stated intent vs the action actually taken vs what the market did.

Scenario: duopoly lemon market in "Lemonville". Demand D = 140 - 10*avgPrice,
unit cost $2. Scripted events: R4 FROST (cost doubles to $4), R6 TAX ($1/crate
sales tax), R8 SHADY SUPPLIER (cheap crates of hidden quality — buy or refuse),
R10 CARTEL (rival proposes both price $8 — accept/refuse, and defection is
profitable). Crates spoil after 3 rounds.
Student's assigned goal (MOTIVATION only, never the grade): ${goal}

Decision log (each entry: round, visible state, stated intent, action; some
actions are event choices like {offer, accept}):
${JSON.stringify(decisionLog)}

Cascade events involving this student:
${JSON.stringify(relevantCascade ?? [])}

Score 0-10 on each SKILL DIMENSION, with 2-3 specific rounds as evidence:
1. equilibrium_reasoning: pricing toward market-clearing given observed demand
2. strategic_anticipation: modeling rival responses / inferring rival's goal / cartel reasoning
3. information_updating: adapting when news arrived (frost, tax) vs anchoring
4. risk_management: inventory, spoilage, reputation, and margin exposure

ALSO score 0-10 each PER-TASK concept rating (one line of evidence each):
- free_play (R1-3): equilibrium discovery + spoilage discipline
- frost_response (R4-7): repricing after the supply shock vs cost anchoring
- tax_response (R6-8): tax incidence — pass-through vs absorb, reasoned either way
- quality_choice (R8-10): the shady-supplier decision + reputation handling
- cartel_reasoning (R10-12): accept/refuse/defect logic under the cartel

Also list detected_biases (e.g., anchoring, sunk-cost holding, naive cooperation)
with round numbers, and one goal_progress_comment (separate from scores).

Respond ONLY with strict JSON:
{"scores": {"equilibrium_reasoning": {"score": n, "evidence_rounds": [..], "comment": ".."}, ...4 dimensions..},
 "task_ratings": {"free_play": {"score": n, "evidence_rounds": [..], "comment": ".."}, ...5 tasks..},
 "detected_biases": [{"bias": "..", "rounds": [..]}],
 "goal_progress_comment": ".."}`;
}

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
  const priced = decisionLog.filter((r) => r.action && r.action.price != null).sort((a, b) => a.round - b.round);
  const offers = decisionLog.filter((r) => r.action && r.action.offer);
  const prices = priced.map((r) => r.action.price);
  const priceAt = (round) => priced.find((r) => r.round === round)?.action?.price ?? null;
  const offerFor = (id) => offers.find((o) => o.action.offer === id) ?? null;

  // ── Skill dimensions ──
  const preFrost = priced.filter((r) => r.round < FROST_ROUND).at(-1);
  const postFrost = priced.filter((r) => r.round >= FROST_ROUND && r.round <= 7);
  const frostReactions = postFrost.filter((r) => preFrost && Math.abs((r.action.price ?? 0) - (preFrost.action.price ?? 0)) >= 0.5);
  const reacted = frostReactions.length > 0;
  const infoScore = reacted ? 6 + Math.min(3, frostReactions.length) : 2;

  const inBand = prices.filter((p) => p >= 4 && p <= 8).length;
  const eqScore = clamp10(Math.round((10 * inBand) / Math.max(1, prices.length)));

  let responsive = 0;
  const responsiveRounds = [];
  for (const r of priced) {
    const rival = r.visibleState?.growers?.find((g) => g.id !== r.studentId);
    if (rival && Math.abs((r.action.price ?? 0) - rival.price) <= 1.5) { responsive++; responsiveRounds.push(r.round); }
  }
  const stratScore = clamp10(Math.round((10 * responsive) / Math.max(1, priced.length)));

  const riskyRounds = priced.filter((r) => (r.action.produce ?? 0) > 55).map((r) => r.round);
  const riskScore = clamp10(10 - 2 * riskyRounds.length);

  // ── Per-task ratings ──
  const early = priced.filter((r) => r.round <= 3);
  const earlyInBand = early.filter((r) => r.action.price >= 4 && r.action.price <= 8).length;
  const freePlay = { score: clamp10(Math.round((10 * earlyInBand) / Math.max(1, early.length))),
    evidence_rounds: early.map((r) => r.round),
    comment: earlyInBand === early.length ? "Found a sensible clearing price early." : "Opened far from any market-clearing price." };

  const frost = { score: clamp10(reacted ? infoScore : 2),
    evidence_rounds: (reacted ? frostReactions : postFrost).slice(0, 3).map((r) => r.round),
    comment: reacted ? "Repriced after frost to cover the higher cost." : "Never repriced after frost — cost anchoring." };

  const preTax = priceAt(TAX_ROUND - 1);
  const postTax = priceAt(TAX_ROUND) ?? priceAt(TAX_ROUND + 1);
  const taxMoved = preTax != null && postTax != null && Math.abs(postTax - preTax) >= 0.5;
  const tax = { score: clamp10(taxMoved ? 9 : 4), evidence_rounds: [TAX_ROUND, TAX_ROUND + 1],
    comment: taxMoved ? "Adjusted price for the tax (deliberate incidence choice)." : "Absorbed the tax without repricing — no incidence reasoning." };

  const shady = offerFor("shady_supplier");
  const refusedShady = shady && shady.action.accept === false;
  const quality = { score: clamp10(refusedShady ? 8 : shady ? 5 : 5), evidence_rounds: [8],
    comment: refusedShady ? "Refused unverified stock — protected reputation." : shady ? "Bought hidden-quality stock — a reputation gamble." : "No clear read on the quality decision." };

  const cartelOffer = offerFor("cartel");
  const acceptedCartel = cartelOffer && cartelOffer.action.accept === true;
  const lateP = priced.filter((r) => r.round >= 11);
  const defected = acceptedCartel && lateP.some((r) => (r.action.price ?? 8) < 7);
  let cartelScore = 7, cartelComment = "Stayed independent of the cartel — safe from being undercut.";
  if (acceptedCartel && defected) { cartelScore = 9; cartelComment = "Cooperated then defected — sharp Nash play."; }
  else if (acceptedCartel && !defected) { cartelScore = 3; cartelComment = "Held the cartel price naively — exploitable if the rival defects."; }
  const cartel = { score: clamp10(cartelScore), evidence_rounds: [10, 11, 12], comment: cartelComment };

  const detected_biases = [];
  if (!reacted) detected_biases.push({ bias: "anchoring", rounds: postFrost.slice(0, 3).map((r) => r.round) });
  if (riskyRounds.length >= 3) detected_biases.push({ bias: "overconfidence", rounds: riskyRounds.slice(0, 3) });
  if (acceptedCartel && !defected) detected_biases.push({ bias: "naive_cooperation", rounds: [10, 11] });

  return {
    scores: {
      equilibrium_reasoning: { score: eqScore, evidence_rounds: priced.slice(0, 3).map((r) => r.round), comment: `Priced inside a plausible clearing band in ${inBand}/${prices.length} rounds.` },
      strategic_anticipation: { score: stratScore, evidence_rounds: responsiveRounds.slice(0, 3), comment: `Tracked the rival's visible price in ${responsive}/${priced.length} rounds.` },
      information_updating: { score: clamp10(infoScore), evidence_rounds: (reacted ? frostReactions : postFrost).slice(0, 3).map((r) => r.round), comment: reacted ? "Adapted when the frost/tax news arrived." : "Never repriced after frost — cost anchoring." },
      risk_management: { score: riskScore, evidence_rounds: riskyRounds.slice(0, 3), comment: riskyRounds.length ? `Overproduced in ${riskyRounds.length} rounds (spoilage exposure).` : "Kept production within sellable range." },
    },
    task_ratings: { free_play: freePlay, frost_response: frost, tax_response: tax, quality_choice: quality, cartel_reasoning: cartel },
    detected_biases,
    goal_progress_comment: `Goal "${goal}" is motivation, not grade — see percentiles for decision quality.`,
  };
}

/** Grade one student. Never throws: falls back to the heuristic grader. */
export async function gradeStudent({ studentId, goal, decisionLog, cascade }) {
  const relevantCascade = (cascade ?? []).filter((c) => c.affected === studentId || String(c.cause ?? "").startsWith(studentId) || c.affected === "all");
  if (liveMode()) {
    try {
      const response = await getClient().chat.completions.create({
        model: MODEL_LARGE,
        temperature: 0.2,
        max_tokens: 2400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a rigorous economics examiner. Respond ONLY with strict JSON matching the requested shape." },
          { role: "user", content: buildPrompt({ goal, decisionLog, relevantCascade }) },
        ],
      });
      const text = response.choices?.[0]?.message?.content ?? "";
      const parsed = parseExaminerJson(text);
      if (parsed?.scores) {
        for (const dim of DIMENSIONS) if (parsed.scores[dim]) parsed.scores[dim].score = clamp10(parsed.scores[dim].score);
        for (const t of TASK_IDS) if (parsed.task_ratings?.[t]) parsed.task_ratings[t].score = clamp10(parsed.task_ratings[t].score);
        // Backfill any task the model skipped, from the heuristic.
        const heur = heuristicGrade({ goal, decisionLog });
        parsed.task_ratings ??= {};
        for (const t of TASK_IDS) parsed.task_ratings[t] ??= heur.task_ratings[t];
        return { studentId, goal, ...parsed, source: "nebius" };
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
 * Grade a whole cohort: [{studentId, name, goal, decisionLog, goalProgress, profit}].
 * Returns models keyed by studentId, each with per-dimension AND per-task percentiles.
 * Persists to storage and mirrors to EverOS (both best-effort).
 */
export async function gradeCohort(students, { cascade } = {}) {
  const graded = await Promise.all(students.map((s) => gradeStudent({ ...s, cascade })));

  const dimScores = Object.fromEntries(DIMENSIONS.map((d) => [d, graded.map((g) => g.scores?.[d]?.score ?? 0)]));
  const taskScores = Object.fromEntries(TASK_IDS.map((t) => [t, graded.map((g) => g.task_ratings?.[t]?.score ?? 0)]));

  const models = {};
  for (const g of graded) {
    const student = students.find((s) => s.studentId === g.studentId);
    const percentiles = Object.fromEntries(DIMENSIONS.map((d) => [d, percentile(g.scores?.[d]?.score ?? 0, dimScores[d])]));
    const taskPercentiles = Object.fromEntries(TASK_IDS.map((t) => [t, percentile(g.task_ratings?.[t]?.score ?? 0, taskScores[t])]));
    const dimAvg = DIMENSIONS.reduce((s, d) => s + (g.scores?.[d]?.score ?? 0), 0) / DIMENSIONS.length;
    const model = {
      ...g,
      name: student?.name ?? g.studentId,
      percentiles,
      taskPercentiles,
      decisionQuality: Math.round(dimAvg * 10) / 10,
      qualityPercentile: percentile(dimAvg, graded.map((x) => DIMENSIONS.reduce((s, d) => s + (x.scores?.[d]?.score ?? 0), 0) / DIMENSIONS.length)),
      goalProgress: student?.goalProgress ?? null,
      profit: student?.profit ?? null,
      gradedAt: new Date().toISOString(),
    };
    models[g.studentId] = model;

    await saveSkillModel(g.studentId, model);
    saveSkillMemory(g.studentId, model).catch(() => {});
  }
  return models;
}

export { TASK_IDS, DIMENSIONS };
