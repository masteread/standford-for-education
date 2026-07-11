// Delegate agent: converts a student's free-text intent into a market action
// {price, produce}, or asks at most one clarifying question. One LLM call per
// intent via Nebius Token Factory (OpenAI-compatible) on the SMALL/fast model,
// 8s hard timeout (a slow call must never stall the tick — fall back to
// repeating the last action). The chat reply shown to the player is a TEMPLATED
// one-liner (not the LLM) so ticks stay fast and the tone stays consistent.
// Without NEBIUS_API_KEY (or with RIPPLE_MOCK=1) a deterministic regex parser
// runs, which also doubles as the integration-checkpoint stub.

import OpenAI from "openai";

const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1/";
const MODEL_SMALL = process.env.NEBIUS_MODEL_SMALL || "meta-llama/Llama-3.1-8B-Instruct";
const DELEGATE_TIMEOUT_MS = 8000;
const PRICE_MIN = 1;
const PRICE_MAX = 15;
const PRODUCE_MIN = 0;
const PRODUCE_MAX = 100;
const DEFAULT_ACTION = { price: 5, produce: 20 };

const liveMode = () => Boolean(process.env.NEBIUS_API_KEY) && process.env.RIPPLE_MOCK !== "1";

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ baseURL: BASE_URL, apiKey: process.env.NEBIUS_API_KEY, timeout: DELEGATE_TIMEOUT_MS, maxRetries: 0 });
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

// Cheerful pixel-assistant confirmation, built from the parsed action by TEMPLATE.
function replyFor(action) {
  return `Okay! I'll price us at $${action.price} and stock ${action.produce} crates this round. 🍋`;
}

function buildPrompt({ intent, visibleState, ownState }) {
  return `You are a lemon-stand owner's cheerful trading delegate in the town of Lemonville.
Convert their instruction into an action. You may ask AT MOST one short clarifying
question, and only if the instruction is genuinely ambiguous about price or
production. Otherwise act.

Market state visible to the owner: ${JSON.stringify(visibleState ?? {})}
Their current holdings: ${JSON.stringify(ownState ?? {})}
Their instruction: "${intent}"

Respond ONLY with JSON:
{"action": {"price": <number>, "produce": <number>}, "question": null}
or
{"action": null, "question": "<one short question>"}

Rules: price must be ${PRICE_MIN}-${PRICE_MAX}; produce ${PRODUCE_MIN}-${PRODUCE_MAX}; if the instruction is relative
("undercut slightly"), resolve it against the rival's last price; never invent
information not in the state.`;
}

/** Defensive parse: strip ```json fences, find the first balanced JSON object. */
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

  const unitCost = Number.isFinite(ownState?.unitCost) ? ownState.unitCost : 2;
  if (text.includes("margin") || text.includes("profit")) {
    price = Math.max(price, unitCost + 1);
  }

  const produceTo = num(/produce\s*\$?(\d+(?:\.\d+)?)/);
  const produceMore = num(/produce\s*\+\s*(\d+)/);
  if (produceMore !== null) produce = base.produce + produceMore;
  else if (produceTo !== null) produce = produceTo;

  const action = normalizeAction({ price, produce }, lastAction);
  return { action, question: null, reply: replyFor(action), source: "regex" };
}

/**
 * Main entry — the POST /intent route calls this. Returns {action, question,
 * reply, source} where exactly one of action/question is non-null. Never throws;
 * never takes longer than ~8s.
 */
export async function runDelegate({ studentId, intent, visibleState, ownState, lastAction }) {
  if (!liveMode()) {
    return regexDelegate({ intent, visibleState, ownState, lastAction, studentId });
  }
  try {
    const response = await getClient().chat.completions.create({
      model: MODEL_SMALL,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You convert a lemon-stand owner's plain-English instruction into a trading action. Respond ONLY with JSON." },
        { role: "user", content: buildPrompt({ intent, visibleState, ownState }) },
      ],
    });
    const text = response.choices?.[0]?.message?.content ?? "";
    const parsed = parseDelegateJson(text);
    if (!parsed) throw new Error("unparseable delegate output");
    if (parsed.question && !parsed.action) {
      return { action: null, question: String(parsed.question), reply: String(parsed.question), source: "nebius" };
    }
    const action = normalizeAction(parsed.action, lastAction);
    return { action, question: null, reply: replyFor(action), source: "nebius" };
  } catch (err) {
    console.warn(`[delegate] ${studentId ?? "?"} fell back to last action: ${err.message}`);
    const action = normalizeAction(lastAction ?? DEFAULT_ACTION, lastAction);
    return { action, question: null, reply: "I wasn't sure, so I kept our prices steady! 🍋", source: "fallback" };
  }
}
