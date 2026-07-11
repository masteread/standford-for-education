// A3 — Cascade log helpers. The cascade trace IS the demo (never cut).
// market.js pushes entries here as it resolves each round; the client renders
// them grouped by round, highlighting the entries that involve the viewer.
//
// CascadeEntry shape (see shared/contracts.md):
//   { round, cause, effect, affected, kind? }
// `kind` is an optional tag so the UI can style teaching moments.

/** Build one cascade entry. */
export function entry(round, cause, effect, affected, kind) {
  return { round, cause, effect, affected, kind };
}

/** Append an entry to the running trace and return it. */
export function push(cascade, round, cause, effect, affected, kind) {
  const e = entry(round, cause, effect, affected, kind);
  cascade.push(e);
  return e;
}

/** Entries that involve a given student (as cause author or affected party). */
export function relevantTo(cascade, studentId) {
  return cascade.filter(
    (c) => c.affected === studentId || String(c.cause ?? "").startsWith(studentId) || c.affected === "all"
  );
}
