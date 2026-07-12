// Delegate agent: converts a player's free-text strategy into a market action
// {price, qty} for their ROLE in the chain (farm-gate price + crates to grow,
// wholesale ask + order size, shelf price + order, meal price + crates).
// One small-model call via Nebius (OpenAI-compatible), 8s hard timeout — a slow
// call must never stall the tick; fall back to repeating the last action. The
// chat reply is TEMPLATED from the parsed action (fast, consistent tone).
// Without NEBIUS_API_KEY (or with RIPPLE_MOCK=1) a deterministic regex parser runs.

import OpenAI from "openai";

// Bring-your-own-key: any OpenAI-compatible provider. Generic LLM_* vars are the
// documented names; NEBIUS_* are kept as aliases for back-compat.
const BASE_URL = process.env.LLM_BASE_URL || process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1/";
const MODEL_SMALL = process.env.LLM_MODEL_SMALL || process.env.NEBIUS_MODEL_SMALL || "meta-llama/Llama-3.1-8B-Instruct";
const DELEGATE_TIMEOUT_MS = 8000;

const apiKey = () => process.env.LLM_API_KEY || process.env.NEBIUS_API_KEY;
const liveMode = () => Boolean(apiKey()) && process.env.RIPPLE_MOCK !== "1";
let client = null;
const getClient = () =>
  (client ??= new OpenAI({ baseURL: BASE_URL, apiKey: apiKey(), timeout: DELEGATE_TIMEOUT_MS, maxRetries: 0 }));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const ROLE_WORDS = {
  farmer: { priceMeans: "your farm-gate price per crate", qtyMeans: "crates to GROW this round", unit: "crate", peers: "the other farms", buyers: "the depots" },
  wholesaler: { priceMeans: "your wholesale ask per crate", qtyMeans: "crates to ORDER from farms", unit: "crate", peers: "the other depot", buyers: "grocers and cafés" },
  grocer: { priceMeans: "your shelf price per crate", qtyMeans: "crates to ORDER from depots", unit: "crate", peers: "the other grocers", buyers: "the townsfolk" },
  restaurant: { priceMeans: "your MEAL price", qtyMeans: "crates to ORDER from depots (1 crate = 4 meals)", unit: "meal", peers: "the other cafés", buyers: "diners" },
};

function normalizeAction(action, lastAction, tier) {
  const price = Number(action?.price);
  const qty = Number(action?.qty);
  return {
    price: clamp(Number.isFinite(price) ? Math.round(price * 100) / 100 : lastAction.price, tier.priceBounds.min, tier.priceBounds.max),
    qty: clamp(Number.isFinite(qty) ? Math.round(qty) : lastAction.qty, tier.qtyBounds.min, tier.qtyBounds.max),
  };
}

function replyFor(action, role) {
  const w = ROLE_WORDS[role];
  const verb = role === "farmer" ? `grow ${action.qty} crates` : `order ${action.qty} crates`;
  return `Okay! ${w.unit === "meal" ? "Meals" : "Crates"} at $${action.price}, and I'll ${verb} this round. 🍋`;
}

function buildPrompt({ intent, role, tier, visibleState, ownState }) {
  const w = ROLE_WORDS[role];
  const peers = (visibleState?.players ?? []).filter((p) => p.role === role && p.id !== ownState.id).map((p) => ({ id: p.id, price: p.price, stock: p.stock }));
  const suppliers = (visibleState?.players ?? []).filter((p) => (role === "wholesaler" ? p.role === "farmer" : p.role === "wholesaler")).map((p) => ({ id: p.id, price: p.price, stock: p.stock }));
  return `You are the cheerful trading delegate for a ${role} in the town of Lemonville's
lemon supply chain (farms → depots → grocers/cafés → townsfolk).
"price" means ${w.priceMeans}; "qty" means ${w.qtyMeans}.
Convert the owner's instruction into an action. You may ask AT MOST one short
clarifying question, only if genuinely ambiguous about price or qty. Otherwise act.

Your competitors (${w.peers}): ${JSON.stringify(peers)}
${role === "farmer" ? "" : `Your suppliers and their asks: ${JSON.stringify(suppliers)}\n`}Your holdings: ${JSON.stringify(ownState)}
Owner's instruction: "${intent}"

Respond ONLY with JSON:
{"action": {"price": <number>, "qty": <number>}, "question": null}
or
{"action": null, "question": "<one short question>"}

Rules: price ${tier.priceBounds.min}-${tier.priceBounds.max}; qty ${tier.qtyBounds.min}-${tier.qtyBounds.max}. Resolve relative instructions
("undercut slightly") against competitors' posted prices. Never invent information.`;
}

/** Defensive parse: strip fences, find the first balanced JSON object. */
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
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/** Deterministic fallback/stub parser — also mock mode. */
export function regexDelegate({ intent, role, tier, visibleState, ownState, lastAction }) {
  const text = String(intent ?? "").toLowerCase();
  let price = lastAction.price;
  let qty = lastAction.qty;

  const peers = (visibleState?.players ?? []).filter((p) => p.role === role && p.id !== (ownState?.id));
  const cheapestPeer = peers.length ? Math.min(...peers.map((p) => p.price)) : null;
  const num = (re) => { const m = text.match(re); return m ? parseFloat(m[1]) : null; };

  const priceTo = num(/(?:price|charge|sell|set|go)\s*(?:it|to|at)?\s*\$?(\d+(?:\.\d+)?)/);
  const raiseBy = num(/raise\s*(?:price\s*)?by\s*\$?(\d+(?:\.\d+)?)/);
  const cutBy = num(/(?:cut|drop|lower|discount)\s*(?:price\s*)?(?:by|to)?\s*\$?(\d+(?:\.\d+)?)/);
  const undercutBy = num(/undercut\s*(?:\w+\s*)?by\s*\$?(\d+(?:\.\d+)?)/);

  if (text.includes("undercut") && cheapestPeer !== null) price = cheapestPeer - (undercutBy ?? 0.5);
  else if (raiseBy !== null) price = lastAction.price + raiseBy;
  else if (cutBy !== null) price = text.includes(" to ") ? cutBy : lastAction.price - cutBy;
  else if (priceTo !== null) price = priceTo;
  else if (text.includes("raise")) price = lastAction.price + 1;
  else if (text.includes("match") && cheapestPeer !== null) price = cheapestPeer;

  if ((text.includes("margin") || text.includes("profit")) && Number.isFinite(ownState?.unitCost)) {
    price = Math.max(price, ownState.unitCost + 1);
  }

  const qtyTo = num(/(?:grow|produce|order|buy|stock|restock)\s*\$?(\d+)/);
  const qtyMore = num(/(?:grow|produce|order|buy|stock)\s*\+\s*(\d+)/) ?? num(/(\d+)\s*more/);
  if (qtyMore !== null) qty = lastAction.qty + qtyMore;
  else if (qtyTo !== null) qty = qtyTo;
  if (text.includes("nothing") || text.includes("skip")) qty = 0;

  const action = normalizeAction({ price, qty }, lastAction, tier);
  return { action, question: null, reply: replyFor(action, role), source: "regex" };
}

/**
 * Main entry — POST /intent calls this. Returns {action, question, reply, source};
 * exactly one of action/question is non-null. Never throws; never exceeds ~8s.
 */
export async function runDelegate({ studentId, intent, role, tier, visibleState, ownState, lastAction }) {
  const fallbackArgs = { intent, role, tier, visibleState, ownState, lastAction };
  if (!liveMode()) return regexDelegate(fallbackArgs);
  try {
    const response = await getClient().chat.completions.create({
      model: MODEL_SMALL,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You convert a business owner's plain-English instruction into a trading action. Respond ONLY with JSON." },
        { role: "user", content: buildPrompt({ intent, role, tier, visibleState, ownState }) },
      ],
    });
    const parsed = parseDelegateJson(response.choices?.[0]?.message?.content ?? "");
    if (!parsed) throw new Error("unparseable delegate output");
    if (parsed.question && !parsed.action) {
      return { action: null, question: String(parsed.question), reply: String(parsed.question), source: "nebius" };
    }
    const action = normalizeAction(parsed.action, lastAction, tier);
    return { action, question: null, reply: replyFor(action, role), source: "nebius" };
  } catch (err) {
    console.warn(`[delegate] ${studentId ?? "?"} fell back to last action: ${err.message}`);
    return { action: { ...lastAction }, question: null, reply: "I wasn't sure, so I kept things steady! 🍋", source: "fallback" };
  }
}
