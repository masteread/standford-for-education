// One test completion against Nebius Token Factory (OpenAI-compatible).
import "../test/loadenv.js";
import OpenAI from "openai";

if (!process.env.NEBIUS_API_KEY) {
  console.log("SKIP: NEBIUS_API_KEY not set (add it to ripple/.env)");
  process.exit(0);
}

const client = new OpenAI({
  baseURL: process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1/",
  apiKey: process.env.NEBIUS_API_KEY,
});
const model = process.env.NEBIUS_MODEL_SMALL || "meta-llama/Llama-3.1-8B-Instruct";
const response = await client.chat.completions.create({
  model,
  max_tokens: 20,
  messages: [{ role: "user", content: "Reply with exactly: RIPPLE OK" }],
});
const text = response.choices?.[0]?.message?.content ?? "";
console.log("model:", model, "| finish:", response.choices?.[0]?.finish_reason);
console.log("response:", text.trim());
if (!text.includes("RIPPLE OK")) {
  console.error("FAIL: unexpected response");
  process.exit(1);
}
console.log("PASS: Nebius Token Factory reachable");
