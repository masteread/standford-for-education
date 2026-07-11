// End-to-end HTTP driver: plays a full 12-round Lemonville game against a running
// server (two humans A+B), responding to offers, then checks reports + professor.
// Usage: RIPPLE_MOCK=1 PORT=3998 node server/index.js &  then  BASE=http://localhost:3998 node test/test-e2e.js
const BASE = process.env.BASE || "http://localhost:3998";
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.log(`  ✗ ${m}`)));
const j = async (path, method = "GET", body) => {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

// Reset + join two humans.
await j("/admin/reset", "POST");
const a = await j("/join", "POST", { name: "Ada" });
const b = await j("/join", "POST", { name: "Bo" });
ok(a.studentId === "A" && b.studentId === "B", `joined A=${a.goal} B=${b.goal}`);
ok(a.goal !== b.goal, "asymmetric goals assigned");

// Play 12 rounds: each round, both confirm a price, respond to any offer, force-resolve.
for (let round = 1; round <= 12; round++) {
  const sa = await j(`/state/A`);
  // respond to offers (A buys shady + joins cartel; B refuses both)
  for (const o of sa.offers ?? []) await j("/offer", "POST", { studentId: "A", offerId: o.offerId, accept: true });
  const sb = await j(`/state/B`);
  for (const o of sb.offers ?? []) await j("/offer", "POST", { studentId: "B", offerId: o.offerId, accept: false });

  // A holds ~5 (never reprices after frost → anchoring), B undercuts.
  await j("/confirm", "POST", { studentId: "A", action: { price: 5, produce: 40 }, intent: "hold steady" });
  await j("/confirm", "POST", { studentId: "B", action: { price: round >= 4 ? 6 : 4.5, produce: 45 }, intent: round >= 4 ? "raise for costs" : "undercut" });
  await j("/admin/resolve", "POST");
}

const done = await j(`/state/A`);
ok(done.phase === "done", `game reached done (round ${done.round})`);
ok((done.cascade ?? []).length > 15, `cascade has ${done.cascade.length} entries`);

// Reports
const rA = await j(`/report/A`);
const rB = await j(`/report/B`);
ok(rA.scores && rA.task_ratings, "A report has scores + per-task ratings");
ok(rB.scores && rB.task_ratings, "B report has scores + per-task ratings");
ok(JSON.stringify(rA.scores) !== JSON.stringify(rB.scores), "A and B graded differently");
ok(rA.task_ratings.frost_response.score <= rB.task_ratings.frost_response.score, `A anchored on frost (A ${rA.task_ratings.frost_response.score} ≤ B ${rB.task_ratings.frost_response.score})`);
ok(rA.qualityPercentile != null && rA.profit != null, "A report carries qualityPercentile + profit");

// Professor
const prof = await j(`/professor/data`);
const ids = Object.keys(prof.models);
ok(ids.length >= 6, `professor grid has ${ids.length} students (humans + seed)`);
ok(prof.tasks.length === 5, "professor exposes 5 tasks");
const ov = await j("/professor/override", "POST", { taskId: "frost_response", studentId: "A", newScore: 9, note: "reconsidered" });
ok(ov.ok && ov.override.newScore === 9, "professor override saved");
const prof2 = await j(`/professor/data`);
ok((prof2.overrides ?? []).some((o) => o.taskId === "frost_response" && o.studentId === "A"), "override persists in /professor/data");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
