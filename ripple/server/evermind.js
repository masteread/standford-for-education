// EverOS (EverMind) memory layer — hackathon partner integration.
// API (docs.evermind.ai, v1): base https://api.evermind.ai, Bearer EVEROS_API_KEY.
//   POST /api/v1/memories/agent        {user_id, messages[]}  -> async extraction
//   POST /api/v1/memories/agent/flush  {user_id}              -> force consolidation
//   POST /api/v1/memories/search       {query, filters, method, top_k}
//
// Design rule: OFF the critical path. Extraction is async and lossy, so we
// embed the skill-model JSON verbatim in the stored message and parse it back
// out of search results. A local map doubles as cache and fallback; every
// remote call is try/catch + timeout. The demo NEVER blocks on memory.

const BASE = process.env.EVEROS_URL || "https://api.evermind.ai";
const API_KEY = process.env.EVEROS_API_KEY;
const REMOTE_TIMEOUT_MS = 4000;
const MARKER = "RIPPLE_SKILL_MODEL_JSON:";

const configured = Boolean(API_KEY);
const localMemory = new Map(); // studentId -> skillModel

async function post(path, body) {
  if (!configured) throw new Error("EVEROS_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`evermind ${path} -> ${res.status}`);
  return res.json();
}

/**
 * Persist a student's skill model as an agent memory (fire-and-forget safe).
 * Always writes the local cache; the cloud write is best-effort.
 */
export async function saveSkillMemory(studentId, skillModel) {
  localMemory.set(studentId, skillModel);
  try {
    await post("/api/v1/memories/agent", {
      user_id: String(studentId),
      messages: [
        {
          role: "user",
          content:
            `Graded skill model for economics student ${studentId} from a Ripple market ` +
            `simulation session. ${MARKER}${JSON.stringify(skillModel)}`,
        },
      ],
    });
    await post("/api/v1/memories/agent/flush", { user_id: String(studentId) });
    return true;
  } catch (err) {
    console.warn(`[evermind] saveSkillMemory(${studentId}) failed (local fallback kept): ${err.message}`);
    return false;
  }
}

function extractModelFromText(text) {
  const i = typeof text === "string" ? text.indexOf(MARKER) : -1;
  if (i === -1) return null;
  const raw = text.slice(i + MARKER.length).trim();
  // JSON may be followed by prose; find the balanced object.
  let depth = 0;
  for (let j = 0; j < raw.length; j++) {
    if (raw[j] === "{") depth++;
    else if (raw[j] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(0, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Retrieve a student's prior skill model. Cloud search first, local cache
 * as fallback. Returns null on miss — callers must handle null (v0 casting).
 */
export async function getSkillMemory(studentId) {
  try {
    const result = await post("/api/v1/memories/search", {
      query: "graded skill model scores for market simulation",
      filters: { user_id: String(studentId) },
      method: "hybrid",
      top_k: 5,
    });
    const episodes = result?.episodes ?? [];
    for (const ep of episodes) {
      const model =
        extractModelFromText(ep?.episode) ??
        extractModelFromText(ep?.summary) ??
        (ep?.atomic_facts ?? []).map(extractModelFromText).find(Boolean);
      if (model) {
        localMemory.set(studentId, model);
        return model;
      }
    }
  } catch (err) {
    console.warn(`[evermind] getSkillMemory(${studentId}) failed (trying local): ${err.message}`);
  }
  return localMemory.get(studentId) ?? null;
}

export function _resetForTests() {
  localMemory.clear();
}
