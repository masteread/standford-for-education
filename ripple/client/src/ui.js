// Design system for Person A's screens — "Citrus Terminal": calm editorial layout
// with a Lemon Wars identity. Minimalist by subtraction, color = meaning only.
// (PRD-personA.md §3). Shared tokens + tiny presentational components.

export const C = {
  paper: "#FBFAF7",
  ink: "#17150F",
  muted: "#8A857C",
  faint: "#B8B2A7",
  line: "#ECE7DE",
  surface: "#FFFFFF",
  lemon: "#E6B10A", // brand / goal
  lemonSoft: "#FFF6D6",
  green: "#177245", // gain / revenue / in your favor
  greenSoft: "#E7F3EC",
  red: "#BE3A2E", // cost / loss / spoilage / elasticity
  redSoft: "#FBEAE7",
  frost: "#2F6BF0", // the shock (cold blue — stands out from the warm palette)
  frostSoft: "#E9F0FF",
  accentBg: "#F4F7FF", // "this involves you"
  accentLine: "#C7D8FF",
};

export const SHADOW = "0 1px 2px rgba(23,21,15,.04), 0 12px 28px -18px rgba(23,21,15,.20)";

export const T = {
  wordmark: { fontSize: 15, fontWeight: 800, letterSpacing: -0.2 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.muted },
  data: { fontSize: 26, fontWeight: 750, letterSpacing: -0.5 },
  body: { fontSize: 15, lineHeight: 1.5 },
};

export function Screen({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.paper }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "18px 16px 48px" }}>{children}</div>
    </div>
  );
}

export function Wordmark({ sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: C.lemon, boxShadow: `0 0 0 3px ${C.lemonSoft}` }} />
      <span style={T.wordmark}>Ripple</span>
      {sub && <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>· {sub}</span>}
    </div>
  );
}

export function Card({ children, accent, style }) {
  return (
    <div
      className="fade-in"
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderLeft: accent ? `3px solid ${accent}` : `1px solid ${C.line}`,
        borderRadius: 16,
        padding: 18,
        marginBottom: 12,
        boxShadow: SHADOW,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Label({ children, color }) {
  return <div style={{ ...T.label, color: color ?? C.muted }}>{children}</div>;
}

export function Stat({ label, value, color, hint }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0" }}>
      <span style={{ ...T.label, letterSpacing: 0.4 }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span className="tnum" style={{ ...T.data, fontSize: 20, color: color ?? C.ink }}>{value}</span>
        {hint && <span style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 500 }}>{hint}</span>}
      </span>
    </div>
  );
}

export function Button({ children, onClick, disabled, tone = "ink", style }) {
  const tones = {
    ink: { background: C.ink, color: "#fff", border: `1px solid ${C.ink}` },
    green: { background: C.green, color: "#fff", border: `1px solid ${C.green}` },
    ghost: { background: "#fff", color: C.ink, border: `1px solid ${C.line}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", padding: "14px 16px", fontSize: 16, fontWeight: 700, borderRadius: 12,
        opacity: disabled ? 0.45 : 1, ...tones[tone], ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Chip({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 13px", borderRadius: 999, border: `1px solid ${C.line}`,
        background: "#fff", fontSize: 13.5, fontWeight: 600, color: C.ink,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.lemonSoft)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
    >
      {children}
    </button>
  );
}
