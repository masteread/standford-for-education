// B2 — Delegate agent: converts a student's free-text intent into a market
// action {price, produce}, or asks at most one clarifying question.
// One Claude call per intent, 8s hard timeout (risk register: a slow call must
// never stall the tick — fall back to repeating the last action).
// Without ANTHROPIC_API_KEY (or with RIPPLE_MOCK=1) a deterministic regex
// parser is used, which doubles as the integration-checkpoint stub.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";
const DELEGATE_TIMEOUT_MS = 8000;
const PRICE_MIN = 1;
const PRICE_MAX = 15;
const PRODUCE_MIN = 0;
const PRODUCE_MAX = 100;
const DEFAULT_ACTION = { price: 5, produce: 20 };

const liveMode = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.RIPPLE_MOCK !== "1";

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ timeout: DELEGATE_TIMEOUT_MS, maxRetries: 0 });
  return client;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function normalizeAction(action, lastAction) {
  const base = lastAction ?? DEFAULT_ACTION;
  const price = Number(action?.price);
  const produce = Number(action?.produce);
  return {
    price: clamp(Number.isFinite(price) ? Math.round(price * 100) / 100 : base.price, PRICE_MIN, PRICE_MAX),
    produce: clamp(Number.isFinite(produce) ? Math.round(produce) : base.produce, PRODUCE_MIN, PRODUCE_MAX),
  };
}

// Prompt agreed in ripple-work-split.md §B2 (lightly tuned).
function buildPrompt({ intent, visibleState, ownState }) {
  return `You are a student's trading delegate in a lemon-market simulation.
Convert their instruction into an action. You may ask AT MOST one short
clarifying question, and only if the instruction is genuinely ambiguous
about price or production. Otherwise act.

Market state visible to the student: ${JSON.stringify(visibleState ?? {})}
Their current holdings: ${JSON.stringify(ownState ?? {})}
Their instruction: "${intent}"

Respond ONLY with JSON:
{"action": {"price": <number>, "produce": <number>}, "question": null}
or
{"action": null, "question": "<one short question>"}

Rules: price must be ${PRICE_MIN}-${PRICE_MAX}; produce ${PRODUCE_MIN}-${PRODUCE_MAX}; if the instruction is relative
("undercut slightly"), resolve it against the rival's last price; never
invent information not in the state.`;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    action: {
      anyOf: [
        {
          type: "object",
          properties: { price: { type: "number" }, produce: { type: "number" } },
          required: ["price", "produce"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    question: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["action", "question"],
  additionalProperties: false,
};

/** Defensive parse: strip ```json fences, find the first JSON object. */
export function parseDelegateJson(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function rivalLastPrice(visibleState, studentId) {
  const growers = visibleState?.growers ?? [];
  const rival = growers.find((g) => g.id !== studentId);
  return Number.isFinite(rival?.price) ? rival.price : null;
}

/** Deterministic fallback/stub parser — also the mock mode. */
export function regexDelegate({ intent, visibleState, ownState, lastAction, studentId }) {
  const text = String(intent ?? "").toLowerCase();
  const base = lastAction ?? DEFAULT_ACTION;
  let price = base.price;
  let produce = base.produce;

  const rival = rivalLastPrice(visibleState, studentId ?? ownState?.id);
  const num = (re) => {
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  };

  const priceTo = num(/(?:price|raise|set|go)\s*(?:to|at)?\s*\$?(\d+(?:\.\d+)?)/);
  const raiseBy = num(/raise\s*(?:price\s*)?by\s*\$?(\d+(?:\.\d+)?)/);
  const cutBy = num(/(?:cut|drop|lower|discount)\s*(?:price\s*)?(?:by|to)?\s*\$?(\d+(?:\.\d+)?)/);
  const undercutBy = num(/undercut\s*(?:\w+\s*)?by\s*\$?(\d+(?:\.\d+)?)/);

  if (text.includes("undercut") && rival !== null) {
    price = rival - (undercutBy ?? 0.5);
  } else if (raiseBy !== null) {
    price = base.price + raiseBy;
  } else if (text.includes("raise") && priceTo !== null) {
    price = priceTo;
  } else if (cutBy !== null) {
    price = text.includes("to") ? cutBy : base.price - cutBy;
  } else if (priceTo !== null) {
    price = priceTo;
  } else if (text.includes("raise")) {
    price = base.price + 1;
  }

  // "protect margin": never price below unit cost + 1
  const unitCost = Number.isFinite(ownState?.unitCost) ? ownState.unitCost : 2;
  if (text.includes("margin") || text.includes("profit")) {
    price = Math.max(price, unitCost + 1);
  }

  const produceTo = num(/produce\s*\$?(\d+(?:\.\d+)?)/);
  const produceMore = num(/produce\s*\+\s*(\d+)/);
  if (produceMore !== null) produce = base.produce + produceMore;
  else if (produceTo !== null) produce = produceTo;

  return { action: normalizeAction({ price, produce }, lastAction), question: null, source: "regex" };
}

/**
 * Main entry — Person A's `POST /intent` route calls this.
 * Returns {action, question, source} where exactly one of action/question is
 * non-null. Never throws; never takes longer than ~8s.
 */
export async function runDelegate({ studentId, intent, visibleState, ownState, lastAction }) {
  if (!liveMode()) {
    return regexDelegate({ intent, visibleState, ownState, lastAction, studentId });
  }
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1000,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: buildPrompt({ intent, visibleState, ownState }) }],
    });
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = parseDelegateJson(text);
    if (!parsed) throw new Error("unparseable delegate output");
    if (parsed.question && !parsed.action) {
      return { action: null, question: String(parsed.question), source: "claude" };
    }
    return { action: normalizeAction(parsed.action, lastAction), question: null, source: "claude" };
  } catch (err) {
    console.warn(`[delegate] ${studentId ?? "?"} fell back to last action: ${err.message}`);
    return { action: normalizeAction(lastAction ?? DEFAULT_ACTION, lastAction), question: null, source: "fallback" };
  }
}
