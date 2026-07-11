// Lemonville pixel design system — 8-bit palette, chunky 4px borders, hard drop
// shadows (no blur), rounded-none. Buttons depress 2px on click (in index.html).
// Shared tokens + tiny presentational components used across every screen.

export const P = {
  cream: "#FDF6E3",
  lemon: "#FFD93D",
  green: "#6BCB77",
  sky: "#4D96FF",
  red: "#FF6B6B",
  ink: "#2D2D2D",
  white: "#FFFFFF",
  lemonSoft: "#FFF3C4",
  greenSoft: "#E4F7E7",
  skySoft: "#E3EEFF",
  redSoft: "#FFE3E3",
  paper: "#FFFDF5",
};

export const BORDER = `4px solid ${P.ink}`;
export const SHADOW = `4px 4px 0 ${P.ink}`;
export const SHADOW_SM = `3px 3px 0 ${P.ink}`;

export const pixFont = '"Press Start 2P", "Courier New", monospace';
export const bodyFont = '"VT323", "Courier New", monospace';

/** A hard-edged 8-bit panel. */
export function Panel({ children, bg = P.white, style, className, onClick }) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{ background: bg, border: BORDER, boxShadow: SHADOW, padding: 14, marginBottom: 14, ...style }}
    >
      {children}
    </div>
  );
}

/** Section label in the pixel font. */
export function PixLabel({ children, color = P.ink, size = 10, style }) {
  return (
    <div style={{ fontFamily: pixFont, fontSize: size, color, letterSpacing: 0.5, lineHeight: 1.6, ...style }}>
      {children}
    </div>
  );
}

/** Chunky pixel button. tone sets the fill. */
export function Btn({ children, onClick, disabled, tone = "white", size = 11, style }) {
  const bg = { white: P.white, lemon: P.lemon, green: P.green, sky: P.sky, red: P.red, ink: P.ink }[tone] ?? P.white;
  const color = tone === "ink" || tone === "sky" ? "#fff" : P.ink;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ fontFamily: pixFont, fontSize: size, background: bg, color, padding: "12px 14px", lineHeight: 1.4, ...style }}
    >
      {children}
    </button>
  );
}

/** Prefill chip (thinner than Btn). */
export function Chip({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: pixFont, fontSize: 9, padding: "8px 9px", background: active ? P.lemon : P.white,
        boxShadow: SHADOW_SM, lineHeight: 1.4,
      }}
    >
      {children}
    </button>
  );
}

/** Big event banner that takes over the top of the screen. */
export function Banner({ emoji, title, sub, bg = P.red, onClose }) {
  return (
    <div
      className="fade-in shake"
      style={{
        background: bg, border: BORDER, boxShadow: SHADOW, padding: "12px 14px", marginBottom: 14,
        display: "flex", alignItems: "center", gap: 12, color: P.ink,
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: pixFont, fontSize: 13 }}>{title}</div>
        {sub && <div style={{ fontFamily: bodyFont, fontSize: 18, marginTop: 4 }}>{sub}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} style={{ fontFamily: pixFont, fontSize: 10, padding: "6px 8px", background: P.white }}>✕</button>
      )}
    </div>
  );
}

/** A labeled stat row. */
export function Stat({ label, value, hint, color = P.ink }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `2px dotted ${P.ink}22` }}>
      <span style={{ fontFamily: pixFont, fontSize: 9 }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ fontFamily: pixFont, fontSize: 13, color }}>{value}</span>
        {hint && <span style={{ display: "block", fontFamily: bodyFont, fontSize: 15, color: P.ink }}>{hint}</span>}
      </span>
    </div>
  );
}

/** A pixel progress bar (goal progress, round timer). */
export function Bar({ frac, color = P.green, height = 14, bg = P.white }) {
  return (
    <div style={{ border: BORDER, background: bg, height, padding: 2 }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color, transition: "width .3s steps(6)" }} />
    </div>
  );
}

/** Small colored tag. */
export function Tag({ children, bg = P.lemon, color = P.ink }) {
  return (
    <span style={{ fontFamily: pixFont, fontSize: 8, background: bg, color, border: `2px solid ${P.ink}`, padding: "3px 5px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** Full-screen cream wrapper. `wide` widens for the town/professor layouts. */
export function Screen({ children, wide }) {
  return (
    <div style={{ minHeight: "100vh", padding: "14px 12px 40px" }}>
      <div style={{ maxWidth: wide ? 1120 : 480, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

/** Lemonville wordmark. */
export function Wordmark({ sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 26 }} className="bob">🍋</span>
      <span style={{ fontFamily: pixFont, fontSize: 18, color: P.ink }}>Lemonville</span>
      {sub && <span style={{ fontFamily: pixFont, fontSize: 9, color: P.ink, opacity: 0.7 }}>{sub}</span>}
    </div>
  );
}

/** Goal label lookup shared by cards/reports. */
export const GOAL_LABEL = {
  max_profit: "Make the most PROFIT by the final round",
  market_share: "Capture the BIGGEST share of your tier",
  survive_frost: "Survive the frost with CASH over $60",
  zero_spoilage: "End with ZERO spoiled crates",
  volume_mover: "Move 100+ crates through your depot",
  perfect_fill: "Fill 90%+ of the orders that reach you",
  clean_reputation: "Never sell a bad lemon",
  serve_meals: "Serve 60+ meals at your café",
};

/** Role metadata shared by every screen. */
export const ROLE_META = {
  farmer: { emoji: "🧑‍🌾", glyph: "🌾", label: "Lemon Farm", tint: P.greenSoft, qtyWord: "grow" },
  wholesaler: { emoji: "🚛", glyph: "🏭", label: "Wholesale Depot", tint: P.skySoft, qtyWord: "order" },
  grocer: { emoji: "🛒", glyph: "🏪", label: "Grocery Store", tint: P.lemonSoft, qtyWord: "order" },
  restaurant: { emoji: "👨‍🍳", glyph: "🍽️", label: "Lemon Café", tint: P.redSoft, qtyWord: "order" },
};
