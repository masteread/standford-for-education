// Examiner agent: grades the QUALITY OF EACH DECISION, never outcomes — now
// role-aware for the ecosystem (a farmer and a grocer face the same shocks but
// through different levers). One large-model call per student (batched rounds),
// emitting the 4 skill dimensions + 5 per-task concept ratings in one JSON.
// The ECOSYSTEM-IMPACT score is attached from the engine's counterfactuals
// (impact.js) — the LLM never invents it. Percentiles per dimension, per task,
// and for impact are plain JS. RIPPLE_MOCK=1 → deterministic heuristic grader.

import OpenAI from "openai";
import { saveSkillModel } from "../storage.js";
import { saveSkillMemory } from "../evermind.js";

// Bring-your-own-key: any OpenAI-compatible provider (LLM_* vars; NEBIUS_* aliased).
const BASE_URL = process.env.LLM_BASE_URL || process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1/";
const MODEL_LARGE = process.env.LLM_MODEL_LARGE || process.env.NEBIUS_MODEL_LARGE || "meta-llama/Llama-3.3-70B-Instruct";

const DIMENSIONS = ["equilibrium_reasoning", "strategic_anticipation", "information_updating", "risk_management"];
const TASKS = [
  { id: "free_play", rounds: [1, 2, 3], concept: "equilibrium discovery across the chain + spoilage discipline" },
  { id: "frost_response", rounds: [4, 5, 6, 7], concept: "supply shock — pass-through vs cost anchoring (even downstream of the farms)" },
  { id: "tax_response", rounds: [6, 7, 8], concept: "retail tax incidence — absorb, pass through, or (upstream) absorb the order shock" },
  { id: "quality_choice", rounds: [8, 9, 10], concept: "Akerlof hidden quality — shady supplier decision + reputation handling" },
  { id: "cartel_reasoning", rounds: [10, 11, 12], concept: "Nash — accept/refuse/defect within your own tier" },
];
const TASK_IDS = TASKS.map((t) => t.id);
const FROST_ROUND = 4;
const TAX_ROUND = 6;
const QTY_MAX = { farmer: 30, wholesaler: 40, grocer: 20, restaurant: 8 };

const apiKey = () => process.env.LLM_API_KEY || process.env.NEBIUS_API_KEY;
const liveMode = () => Boolean(apiKey()) && process.env.RIPPLE_MOCK !== "1";
let client = null;
const getClient = () => (client ??= new OpenAI({ baseURL: BASE_URL, apiKey: apiKey(), timeout: 60_000, maxRetries: 1 }));
const clamp10 = (v) => Math.min(10, Math.max(0, Number(v) || 0));

function buildPrompt({ role, goal, decisionLog, relevantCascade }) {
  return `You are an economics examiner. Grade the QUALITY OF EACH DECISION given only
the information visible at that moment. Do NOT grade outcomes or final profit.
Do NOT reward eloquent intent that contradicts the action taken.

Scenario: the town of Lemonville is a 4-tier lemon supply chain — 3 farms sell to
2 wholesale depots, depots sell to 3 grocers and 3 cafés, and 24 townsfolk with
private willingness-to-pay buy groceries and meals. Buyers pick the cheapest
supplier with loyalty friction; crates spoil after 3 rounds AT ANY TIER.
This student plays a ${role.toUpperCase()} (their "price"/"qty" levers belong to that tier).
Scripted shocks: R4 FROST (farm cost doubles — downstream tiers feel it through
wholesale prices), R6 RETAIL TAX ($1/sale remitted by grocers+cafés — upstream
tiers feel it through shrinking orders), R8 SHADY SUPPLIER (cheap crates, 50%
bad, reputation penalty if sold on), R10 CARTEL (each tier's peers propose
holding prices high; defection is profitable).
Student's assigned goal (MOTIVATION only, never the grade): ${goal}

Decision log (round, visible state, stated intent, action; some actions are event
choices like {offer, accept}):
${JSON.stringify(decisionLog)}

Cascade events involving this student:
${JSON.stringify(relevantCascade ?? [])}

Score 0-10 on each SKILL DIMENSION, with 2-3 specific rounds as evidence:
1. equilibrium_reasoning: pricing toward what their tier's market clears at
2. strategic_anticipation: modeling competitors/suppliers/buyers one step ahead (incl. cartel logic)
3. information_updating: reacting to frost/tax/quality news vs anchoring
4. risk_management: inventory vs spoilage, reputation exposure, margin protection

ALSO score 0-10 each PER-TASK concept rating (one line of evidence each):
free_play (R1-3), frost_response (R4-7), tax_response (R6-8), quality_choice (R8-10),
cartel_reasoning (R10-12).

Also list detected_biases (anchoring, sunk-cost holding, naive cooperation,
overordering) with round numbers, and one goal_progress_comment (separate from scores).

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
  try { return JSON.parse(cleaned.slice(start, cleaned.lastIndexOf("}") + 1)); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Heuristic grader (mock mode + fallback). Deterministic, decision-quality
// flavored: reads only the log, not outcomes. Role-aware via qty bounds and
// tier-average price bands from the visible state.
// ---------------------------------------------------------------------------
export function heuristicGrade({ role, goal, decisionLog }) {
  const priced = decisionLog.filter((r) => r.action && r.action.price != null).sort((a, b) => a.round - b.round);
  const offers = decisionLog.filter((r) => r.action && r.action.offer);
  const priceAt = (round) => priced.find((r) => r.round === round)?.action?.price ?? null;
  const offerFor = (id) => offers.find((o) => o.action.offer === id) ?? null;
  const qtyMax = QTY_MAX[role] ?? 30;

  // in-band = within ±30% of the tier's average posted price that round
  const inBandRounds = [];
  for (const r of priced) {
    const peers = (r.visibleState?.players ?? []).filter((p) => p.role === role);
    if (!peers.length) continue;
    const avg = peers.reduce((s, p) => s + p.price, 0) / peers.length;
    if (Math.abs(r.action.price - avg) <= 0.3 * avg) inBandRounds.push(r.round);
  }
  const eqScore = clamp10(Math.round((10 * inBandRounds.length) / Math.max(1, priced.length)));

  const preFrost = priced.filter((r) => r.round < FROST_ROUND).at(-1);
  const postFrost = priced.filter((r) => r.round >= FROST_ROUND && r.round <= 7);
  const frostReactions = postFrost.filter((r) => preFrost && Math.abs((r.action.price ?? 0) - (preFrost.action.price ?? 0)) >= 0.5);
  const reacted = frostReactions.length > 0;
  const infoScore = reacted ? 6 + Math.min(3, frostReactions.length) : 2;

  let responsive = 0;
  const responsiveRounds = [];
  for (const r of priced) {
    const peers = (r.visibleState?.players ?? []).filter((p) => p.role === role && p.id !== r.studentId);
    if (!peers.length) continue;
    const cheapest = Math.min(...peers.map((p) => p.price));
    if (Math.abs((r.action.price ?? 0) - cheapest) <= 1.5) { responsive++; responsiveRounds.push(r.round); }
  }
  const stratScore = clamp10(Math.round((10 * responsive) / Math.max(1, priced.length)));

  const riskyRounds = priced.filter((r) => (r.action.qty ?? 0) > 0.7 * qtyMax).map((r) => r.round);
  const riskScore = clamp10(10 - 2 * riskyRounds.length);

  // per-task ratings
  const early = priced.filter((r) => r.round <= 3);
  const earlyInBand = early.filter((r) => inBandRounds.includes(r.round)).length;
  const freePlay = {
    score: clamp10(Math.round((10 * earlyInBand) / Math.max(1, early.length))),
    evidence_rounds: early.map((r) => r.round),
    comment: earlyInBand === early.length ? "Found a workable price for their tier early." : "Opened far from what their market clears at.",
  };
  const frost = {
    score: clamp10(reacted ? infoScore : 2),
    evidence_rounds: (reacted ? frostReactions : postFrost).slice(0, 3).map((r) => r.round),
    comment: reacted ? "Repriced when the frost hit the chain." : "Never repriced after frost — cost anchoring.",
  };
  const preTax = priceAt(TAX_ROUND - 1);
  const postTax = priceAt(TAX_ROUND) ?? priceAt(TAX_ROUND + 1);
  const taxMoved = preTax != null && postTax != null && Math.abs(postTax - preTax) >= 0.5;
  const retailer = role === "grocer" || role === "restaurant";
  const tax = {
    score: clamp10(taxMoved ? 9 : retailer ? 4 : 6),
    evidence_rounds: [TAX_ROUND, TAX_ROUND + 1],
    comment: taxMoved
      ? "Adjusted price around the tax (deliberate incidence choice)."
      : retailer
        ? "Absorbed the retail tax without repricing — no incidence reasoning."
        : "Upstream of the tax; held price while orders adjusted (acceptable).",
  };
  const shady = offerFor("shady_supplier");
  const refusedShady = shady && shady.action.accept === false;
  const quality = {
    score: clamp10(refusedShady ? 8 : shady ? 5 : 5),
    evidence_rounds: [8],
    comment: refusedShady ? "Refused unverified stock — protected reputation." : shady ? "Bought hidden-quality stock — a reputation gamble." : "No clear read on the quality decision.",
  };
  const cartelOffer = offerFor("cartel");
  const acceptedCartel = cartelOffer && cartelOffer.action.accept === true;
  const lateP = priced.filter((r) => r.round >= 11);
  const cartelBase = priced.filter((r) => r.round === 10).at(-1)?.action?.price ?? null;
  const defected = acceptedCartel && cartelBase != null && lateP.some((r) => (r.action.price ?? cartelBase) < cartelBase - 0.5);
  let cartelScore = 7, cartelComment = "Stayed independent of the cartel — safe from being undercut.";
  if (acceptedCartel && defected) { cartelScore = 9; cartelComment = "Cooperated then defected — sharp Nash play."; }
  else if (acceptedCartel && !defected) { cartelScore = 3; cartelComment = "Held the cartel price naively — exploitable when peers defect."; }
  const cartel = { score: clamp10(cartelScore), evidence_rounds: [10, 11, 12], comment: cartelComment };

  const detected_biases = [];
  if (!reacted) detected_biases.push({ bias: "anchoring", rounds: postFrost.slice(0, 3).map((r) => r.round) });
  if (riskyRounds.length >= 3) detected_biases.push({ bias: "overordering", rounds: riskyRounds.slice(0, 3) });
  if (acceptedCartel && !defected) detected_biases.push({ bias: "naive_cooperation", rounds: [10, 11] });

  return {
    scores: {
      equilibrium_reasoning: { score: eqScore, evidence_rounds: inBandRounds.slice(0, 3), comment: `Priced inside their tier's plausible band in ${inBandRounds.length}/${priced.length} rounds.` },
      strategic_anticipation: { score: stratScore, evidence_rounds: responsiveRounds.slice(0, 3), comment: `Tracked competitors' posted prices in ${responsive}/${priced.length} rounds.` },
      information_updating: { score: clamp10(infoScore), evidence_rounds: (reacted ? frostReactions : postFrost).slice(0, 3).map((r) => r.round), comment: reacted ? "Adapted when shocks arrived." : "Never repriced after frost — cost anchoring." },
      risk_management: { score: riskScore, evidence_rounds: riskyRounds.slice(0, 3), comment: riskyRounds.length ? `Ordered near the cap in ${riskyRounds.length} rounds (spoilage exposure).` : "Kept orders within sellable range." },
    },
    task_ratings: { free_play: freePlay, frost_response: frost, tax_response: tax, quality_choice: quality, cartel_reasoning: cartel },
    detected_biases,
    goal_progress_comment: `Goal "${goal}" is motivation, not grade — see percentiles for decision quality.`,
  };
}

/** Grade one student. Never throws: falls back to the heuristic grader. */
export async function gradeStudent({ studentId, role, goal, decisionLog, cascade }) {
  const relevantCascade = (cascade ?? []).filter((c) => c.affected === studentId || c.source === studentId || c.affected === "all").slice(-60);
  const safeRole = role ?? "farmer";
  if (liveMode()) {
    try {
      const response = await getClient().chat.completions.create({
        model: MODEL_LARGE,
        temperature: 0.2,
        max_tokens: 2400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a rigorous economics examiner. Respond ONLY with strict JSON matching the requested shape." },
          { role: "user", content: buildPrompt({ role: safeRole, goal, decisionLog, relevantCascade }) },
        ],
      });
      const parsed = parseExaminerJson(response.choices?.[0]?.message?.content ?? "");
      if (parsed?.scores) {
        for (const dim of DIMENSIONS) if (parsed.scores[dim]) parsed.scores[dim].score = clamp10(parsed.scores[dim].score);
        for (const t of TASK_IDS) if (parsed.task_ratings?.[t]) parsed.task_ratings[t].score = clamp10(parsed.task_ratings[t].score);
        const heur = heuristicGrade({ role: safeRole, goal, decisionLog });
        parsed.task_ratings ??= {};
        for (const t of TASK_IDS) parsed.task_ratings[t] ??= heur.task_ratings[t];
        return { studentId, role: safeRole, goal, ...parsed, source: "nebius" };
      }
      console.warn(`[examiner] ${studentId}: malformed JSON, using heuristic fallback`);
    } catch (err) {
      console.warn(`[examiner] ${studentId}: ${err.message}; using heuristic fallback`);
    }
  }
  return { studentId, role: safeRole, goal, ...heuristicGrade({ role: safeRole, goal, decisionLog }), source: "heuristic" };
}

/** Percentile of x within values (0–100, rank-based, ties share rank). */
export function percentile(x, values) {
  if (values.length <= 1) return 50;
  const below = values.filter((v) => v < x).length;
  const equal = values.filter((v) => v === x).length;
  return Math.round((100 * (below + (equal - 1) / 2)) / (values.length - 1));
}

/**
 * Grade a whole cohort: [{studentId, name, role, goal, decisionLog, goalProgress,
 * profit, impact}]. Returns models keyed by studentId with percentiles per
 * dimension, per task, AND for ecosystem impact. Persists best-effort.
 */
export async function gradeCohort(students, { cascade } = {}) {
  const graded = await Promise.all(students.map((s) => gradeStudent({ ...s, cascade })));

  const dimScores = Object.fromEntries(DIMENSIONS.map((d) => [d, graded.map((g) => g.scores?.[d]?.score ?? 0)]));
  const taskScores = Object.fromEntries(TASK_IDS.map((t) => [t, graded.map((g) => g.task_ratings?.[t]?.score ?? 0)]));
  const impactValues = students.map((s) => s.impact?.welfareDelta ?? 0);

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
      impact: student?.impact ?? null, // engine counterfactuals — never the LLM
      impactPercentile: percentile(student?.impact?.welfareDelta ?? 0, impactValues),
      gradedAt: new Date().toISOString(),
    };
    models[g.studentId] = model;
    await saveSkillModel(g.studentId, model);
    saveSkillMemory(student?.name ?? g.studentId, model).catch(() => {});
  }
  return models;
}

export { TASK_IDS, DIMENSIONS };
