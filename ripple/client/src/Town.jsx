// The town square — demo centerpiece. Two lemon stalls and 20 townsfolk emoji
// who WALK (CSS transition) to the stall they buy from after each round. The
// crowd distribution mirrors the engine's demand split exactly: the crowd IS
// the demand curve, visualized. Priced-out folk wander to the edge with 😤.
import { P, BORDER, SHADOW, pixFont, bodyFont, Tag } from "./pixel.js";

const FOLK = ["🧑‍🌾", "👵", "🧒", "👨‍🍳", "🧓", "👩‍🦰", "🧔", "👦", "👩", "🧑"];

// Lay `n` members in centered rows of up to `perRow`, around a center x (%).
function layout(indices, centerX, topBase) {
  const perRow = 5;
  return indices.map((idx, k) => {
    const row = Math.floor(k / perRow);
    const inRow = Math.min(perRow, indices.length - row * perRow);
    const col = k % perRow;
    const spread = 9; // % per person
    const left = centerX + (col - (inRow - 1) / 2) * spread;
    return { idx, left, top: topBase + row * 34 };
  });
}

/** Assign 20 townsfolk to {A, B, off} based on sold + demand. */
function assign(state, ids) {
  const g = {};
  for (const gr of state.growers) g[gr.id] = gr;
  const [a, b] = ids;
  const soldA = g[a]?.sold ?? 0;
  const soldB = g[b]?.sold ?? 0;
  const total = soldA + soldB;
  const N = state.townsfolk ?? 20;

  if (total === 0) return { A: [], B: [], off: [], idle: [...Array(N).keys()] };

  // Participation scales with total demand → high prices leave more folk priced out.
  const active = Math.max(0, Math.min(N, Math.round((N * (state.market.totalDemand ?? total)) / 100)));
  const nA = Math.round((active * soldA) / total);
  const nB = Math.max(0, active - nA);
  const out = { A: [], B: [], off: [], idle: [] };
  let i = 0;
  for (let k = 0; k < nA && i < N; k++, i++) out.A.push(i);
  for (let k = 0; k < nB && i < N; k++, i++) out.B.push(i);
  for (; i < N; i++) out.off.push(i);
  return out;
}

// Speech bubbles derived from the latest round's cascade entries.
function bubbles(state, ids) {
  const cascade = state.cascade ?? [];
  if (!cascade.length) return [];
  const last = Math.max(...cascade.map((c) => c.round));
  const kinds = new Set(cascade.filter((c) => c.round === last).map((c) => c.kind));
  const out = [];
  const g = {};
  for (const gr of state.growers) g[gr.id] = gr;
  const cheaper = (g[ids[0]]?.price ?? 0) <= (g[ids[1]]?.price ?? 0) ? ids[0] : ids[1];
  if (kinds.has("switch")) out.push({ side: cheaper, text: "Cheaper over here!" });
  if (kinds.has("sellout")) out.push({ side: cheaper, text: "Sold out! 😮" });
  if (kinds.has("quality")) out.push({ side: "off", text: "Bad lemons! 🤢" });
  if (kinds.has("tax")) out.push({ side: "off", text: "Prices went up 😕" });
  if (kinds.has("elasticity")) out.push({ side: "off", text: "Too pricey! 😤" });
  return out.slice(0, 3);
}

function Stall({ gr, mine }) {
  return (
    <div style={{ textAlign: "center", width: 120 }}>
      <div style={{ fontSize: 40, lineHeight: 1 }} className="bob">🍋</div>
      <div style={{ background: mine ? P.lemon : P.white, border: BORDER, boxShadow: SHADOW, padding: "4px 2px", marginTop: 2 }}>
        <div style={{ fontFamily: pixFont, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mine ? "YOU" : gr.name}
        </div>
        {/* price sign flips when the price changes (key remounts → .flip plays) */}
        <div key={gr.price} className="flip" style={{ fontFamily: pixFont, fontSize: 14, marginTop: 3 }}>
          ${gr.price}
        </div>
      </div>
    </div>
  );
}

export default function Town({ state, studentId }) {
  const ids = state.growers.map((g) => g.id);
  const a = state.growers.find((g) => g.id === ids[0]);
  const b = state.growers.find((g) => g.id === ids[1]);
  const groups = assign(state, ids);
  const speech = bubbles(state, ids);

  // Position lookup for all townsfolk.
  const pos = {};
  layout(groups.A, 25, 96).forEach((p) => (pos[p.idx] = { ...p, faded: false }));
  layout(groups.B, 75, 96).forEach((p) => (pos[p.idx] = { ...p, faded: false }));
  layout(groups.off, 50, 176).forEach((p) => (pos[p.idx] = { ...p, faded: true, sad: true }));
  layout(groups.idle, 50, 130).forEach((p) => (pos[p.idx] = { ...p, faded: false }));

  return (
    <div style={{ border: BORDER, boxShadow: SHADOW, background: P.skySoft, padding: 12, marginBottom: 14 }}>
      {/* Stalls */}
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end" }}>
        <div style={{ position: "relative" }}>
          {speech.filter((s) => s.side === ids[0]).map((s, i) => <Bubble key={i} text={s.text} />)}
          <Stall gr={a} mine={a.id === studentId} />
        </div>
        <div style={{ position: "relative" }}>
          {speech.filter((s) => s.side === ids[1]).map((s, i) => <Bubble key={i} text={s.text} />)}
          <Stall gr={b} mine={b.id === studentId} />
        </div>
      </div>

      {/* Plaza with walking townsfolk */}
      <div style={{ position: "relative", height: 230, marginTop: 6 }}>
        {speech.filter((s) => s.side === "off").map((s, i) => (
          <div key={`ob${i}`} style={{ position: "absolute", left: "50%", top: 150, transform: "translateX(-50%)" }}>
            <Bubble text={s.text} />
          </div>
        ))}
        {[...Array(state.townsfolk ?? 20).keys()].map((i) => {
          const p = pos[i] ?? { left: 50, top: 130, faded: true };
          return (
            <div
              key={i}
              className="walk"
              style={{
                position: "absolute", left: `${p.left}%`, top: p.top, transform: "translateX(-50%)",
                fontSize: 26, opacity: p.faded ? 0.4 : 1, filter: p.faded ? "grayscale(1)" : "none",
              }}
            >
              {FOLK[i % FOLK.length]}
              {p.sad && <span style={{ fontSize: 14 }}>💸</span>}
            </div>
          );
        })}
        {/* ground line */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderTop: `4px dashed ${P.ink}44` }} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <Tag bg={P.white}>Demand {state.market.totalDemand ?? "—"}</Tag>
        <Tag bg={P.white}>Avg ${state.market.avgPrice ?? "—"}</Tag>
        <Tag bg={P.lemonSoft}>🍋 {a.name} sold {a.sold}</Tag>
        <Tag bg={P.greenSoft}>🍋 {b.name} sold {b.sold}</Tag>
      </div>
    </div>
  );
}

function Bubble({ text }) {
  return (
    <div
      className="pop"
      style={{
        position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 4,
        background: P.white, border: BORDER, boxShadow: "2px 2px 0 " + P.ink, padding: "4px 6px",
        fontFamily: bodyFont, fontSize: 15, whiteSpace: "nowrap", zIndex: 5,
      }}
    >
      {text}
    </div>
  );
}
