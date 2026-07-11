// End-to-end HTTP driver (v4 ecosystem): plays a full 12-round game against a
// running server — two humans in different tiers (a farmer who anchors, a grocer
// who adapts), NPCs everywhere else — responding to offers, then checks the
// butterfly ledger, reports, and the professor grid.
// Usage: RIPPLE_MOCK=1 PORT=3998 node server/index.js &
//        BASE=http://localhost:3998 node test/test-e2e.js
const BASE = process.env.BASE || "http://localhost:3998";
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.log(`  ✗ ${m}`)));
const j = async (path, method = "GET", body) => {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

// Reset + join two humans → seats interleave across tiers (F1 then G1).
await j("/admin/reset", "POST");
const a = await j("/join", "POST", { name: "Ada" });
const b = await j("/join", "POST", { name: "Bo" });
ok(a.studentId === "F1" && b.studentId === "G1", `seats spread tiers (${a.studentId} farmer, ${b.studentId} grocer)`);
ok(a.role === "farmer" && b.role === "grocer", "roles assigned per seat");
ok(a.goal !== b.goal || a.role !== b.role, "asymmetric casting");

// The professor starts the game (joining no longer starts the clock).
let pre = await j(`/state/F1`);
ok(pre.started === false, "clock waits for the professor");
await j("/admin/start", "POST");
pre = await j(`/state/F1`);
ok(pre.started === true, "professor start opens round 1");

// Delegate smoke: plain English → {price, qty}
const intent = await j("/intent", "POST", { studentId: "G1", text: "undercut the other grocers slightly and order 12" });
ok(intent.action && intent.action.qty === 12, `delegate parsed intent → ${JSON.stringify(intent.action)}`);

// Play 12 rounds. Ada the farmer NEVER reprices (anchoring, even through frost);
// Bo the grocer adapts: passes the tax through, raises with costs.
for (let round = 1; round <= 12; round++) {
  const sa = await j(`/state/F1`);
  for (const o of sa.offers ?? []) await j("/offer", "POST", { studentId: "F1", offerId: o.offerId, accept: true }); // shady + cartel: yes
  const sb = await j(`/state/G1`);
  for (const o of sb.offers ?? []) await j("/offer", "POST", { studentId: "G1", offerId: o.offerId, accept: false }); // refuses both

  await j("/confirm", "POST", { studentId: "F1", action: { price: 3, qty: 14 }, intent: "hold steady, costs will settle" });
  const grocerPrice = round >= 6 ? 9 : round >= 4 ? 8.5 : 7.5;
  await j("/confirm", "POST", { studentId: "G1", action: { price: grocerPrice, qty: 10 }, intent: round === 6 ? "pass the tax through" : round === 4 ? "costs rising up the chain, reprice" : "steady margin over wholesale" });
  await j("/admin/resolve", "POST");
}

const done = await j(`/state/F1`);
ok(done.phase === "done", `game reached done (round ${done.round})`);
ok((done.cascade ?? []).length > 25, `cascade has ${done.cascade.length} entries`);
ok((done.lastResolution?.trades ?? []).length > 0, "final round has a trade ledger");
ok((done.lastResolution?.folkTrips ?? []).some((t) => t.to), "townsfolk shopped in the final round");
ok(done.ripple != null, "per-player ripple attribution present");

// Reports: three separate scores, role-aware grading.
const rA = await j(`/report/F1`);
const rB = await j(`/report/G1`);
ok(rA.scores && rA.task_ratings, "farmer report has scores + per-task ratings");
ok(rB.scores && rB.task_ratings, "grocer report has scores + per-task ratings");
ok(rA.role === "farmer" && rB.role === "grocer", "reports carry roles");
ok(rA.impact && typeof rA.impact.welfareDelta === "number", `impact ledger on report (F1 welfare ${rA.impact.welfareDelta})`);
ok(rA.impactPercentile != null && rB.impactPercentile != null, "impact percentiles computed");
ok(JSON.stringify(rA.scores) !== JSON.stringify(rB.scores), "the two humans graded differently");
ok(rA.task_ratings.frost_response.score <= rB.task_ratings.frost_response.score,
  `anchoring farmer ≤ adapting grocer on frost (${rA.task_ratings.frost_response.score} ≤ ${rB.task_ratings.frost_response.score})`);
const anchored = (rA.detected_biases ?? []).some((x) => x.bias === "anchoring");
ok(anchored, "anchoring bias flagged on the frozen farmer");

// Professor: full class grid + town health + replay fuel.
const prof = await j(`/professor/data`);
const ids = Object.keys(prof.models);
ok(ids.length >= 8, `professor grid has ${ids.length} students (humans + seed cohort)`);
ok(prof.tasks.length === 5 && prof.dimensions.length === 4, "5 tasks + 4 dimensions exposed");
ok((prof.history ?? []).length === 12, "12 rounds of town-health history");
ok((prof.cascade ?? []).length > 25, "cascade available for lecture replay");
const someImpact = ids.some((id) => prof.models[id].impact && prof.models[id].impact.welfareDelta !== 0);
ok(someImpact, "at least one student moved the town (nonzero impact)");

// Override round-trip.
const over = await j("/professor/override", "POST", { taskId: "tax_response", studentId: "G1", newScore: 10, note: "clean incidence reasoning" });
ok(over.ok, "professor override saved");
const prof2 = await j(`/professor/data`);
ok((prof2.overrides ?? []).some((o) => o.taskId === "tax_response" && o.studentId === "G1" && o.newScore === 10), "override persisted and returned");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
