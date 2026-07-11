// Task 0.4 — one test completion against the Claude API.
import "../test/loadenv.js";
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("SKIP: ANTHROPIC_API_KEY not set (add it to ripple/.env)");
  process.exit(0);
}

const client = new Anthropic();
const response = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 100,
  messages: [{ role: "user", content: "Reply with exactly: RIPPLE OK" }],
});
const text = response.content.find((b) => b.type === "text")?.text ?? "";
console.log("model:", response.model, "| stop:", response.stop_reason);
console.log("response:", text.trim());
if (!text.includes("RIPPLE OK")) {
  console.error("FAIL: unexpected response");
  process.exit(1);
}
console.log("PASS: Claude API reachable");
