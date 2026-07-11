// Minimal visual system for Person A's screens (see PRD-personA.md §3).
// One font, three type sizes, color = meaning only. Shared by Game + Cascade.

export const C = {
  ink: "#1a1a1a",
  sub: "#6b7280",
  bg: "#fafafa",
  card: "#ffffff",
  line: "#e5e7eb",
  green: "#1a7f37", // in your favor / revenue (matches Person B's Join/Report)
  red: "#c81e1e", // cost / loss / spoilage / elasticity
  amber: "#b45309", // shock / attention
  amberBg: "#fff8e1",
  accentBg: "#eef6ff", // "this involves you"
  accentLine: "#99c2ff",
};

export const F = {
  base: { fontFamily: "system-ui, -apple-system, sans-serif", color: C.ink },
  data: { fontSize: 30, fontWeight: 800, lineHeight: 1.1 },
  body: { fontSize: 16 },
  label: { fontSize: 12, color: C.sub, textTransform: "uppercase", letterSpacing: 0.4 },
};

export const S = {
  wrap: { maxWidth: 440, margin: "0 auto", padding: 16, ...F.base },
  card: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "6px 0" },
  chip: { padding: "8px 12px", borderRadius: 999, border: `1px solid ${C.line}`, background: "#fff", fontSize: 14, cursor: "pointer" },
  primary: { width: "100%", padding: 14, fontSize: 18, fontWeight: 700, color: "#fff", background: C.green, border: "none", borderRadius: 10, cursor: "pointer" },
  input: { width: "100%", fontSize: 17, padding: 12, boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.line}` },
};
