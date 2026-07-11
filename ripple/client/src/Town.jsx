// The town of Lemonville — an animated pixel scene, the demo centerpiece.
// A market square with a sky (drifting clouds, sun, birds), a skyline of houses,
// a cobblestone street, two market stalls with striped awnings + flipping price
// signs, a patrolling dog, and 20 townsfolk who WALK to the stall they buy from
// after each round — the crowd distribution mirrors the engine's demand split
// exactly (the crowd IS the demand curve). Priced-out folk trudge off with 💸.
// All CSS/emoji, no sprite sheets.
import { P, BORDER, SHADOW, pixFont, bodyFont, Tag } from "./pixel.js";

const FOLK = ["🧑‍🌾", "👵", "🧒", "👨‍🍳", "🧓", "👩‍🦰", "🧔", "👦", "👩", "🧑", "👴", "👧", "🧑‍🦱", "👨‍🦰", "👩‍🌾"];
const HOUSES = ["🏠", "🏪", "🏛️", "🏫", "🏬", "🏘️", "⛪", "🏦"];

// Place `indices` around a center x (%), alternating two depth rows.
function place(indices, centerX, tops) {
  const n = Math.ceil(indices.length / 2);
  return indices.map((idx, k) => {
    const row = k % 2;
    const col = Math.floor(k / 2);
    return {
      idx,
      left: centerX + (col - (n - 1) / 2) * 8.5,
      top: row === 0 ? tops[0] : tops[1],
      scale: row === 0 ? 0.85 : 1.12,
      z: row === 0 ? 2 : 3,
    };
  });
}

/** Assign 20 townsfolk to {A, B, off, idle} based on sold + demand. */
function assign(state, ids) {
  const g = {};
  for (const gr of state.growers) g[gr.id] = gr;
  const [a, b] = ids;
  const soldA = g[a]?.sold ?? 0;
  const soldB = g[b]?.sold ?? 0;
  const total = soldA + soldB;
  const N = state.townsfolk ?? 20;
  if (total === 0) return { A: [], B: [], off: [], idle: [...Array(N).keys()] };
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

function bubbles(state, ids) {
  const cascade = state.cascade ?? [];
  if (!cascade.length) return [];
  const last = Math.max(...cascade.map((c) => c.round));
  const kinds = new Set(cascade.filter((c) => c.round === last).map((c) => c.kind));
  const g = {};
  for (const gr of state.growers) g[gr.id] = gr;
  const cheaper = (g[ids[0]]?.price ?? 0) <= (g[ids[1]]?.price ?? 0) ? "A" : "B";
  const out = [];
  if (kinds.has("switch")) out.push({ side: cheaper, text: "Cheaper here!" });
  if (kinds.has("sellout")) out.push({ side: cheaper, text: "Sold out! 😮" });
  if (kinds.has("quality")) out.push({ side: "off", text: "Bad lemons! 🤢" });
  if (kinds.has("tax")) out.push({ side: "off", text: "Pricey now 😕" });
  if (kinds.has("elasticity")) out.push({ side: "off", text: "Too dear! 😤" });
  return out.slice(0, 3);
}

function Stall({ gr, mine, x }) {
  const stripeA = mine ? P.lemon : P.green;
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: "34%", transform: "translateX(-50%)", width: 132, textAlign: "center", zIndex: 2 }}>
      {/* hanging price sign — flips when the price changes */}
      <div style={{ width: 2, height: 8, background: P.ink, margin: "0 auto" }} />
      <div key={gr.price} className="flip" style={{ display: "inline-block", background: P.white, border: BORDER, boxShadow: "2px 2px 0 " + P.ink, padding: "3px 8px", fontFamily: pixFont, fontSize: 13, marginBottom: 2 }}>
        ${gr.price}
      </div>
      {/* striped awning */}
      <div style={{ height: 16, border: BORDER, borderBottom: "none", background: `repeating-linear-gradient(90deg, ${stripeA} 0 12px, ${P.white} 12px 24px)` }} />
      {/* counter (wood) with a lemon pile + keeper */}
      <div style={{ border: BORDER, background: "#C9A227", padding: "4px 0 6px", position: "relative" }}>
        <div style={{ position: "absolute", top: -22, left: 8, fontSize: 22 }} className="bob">{mine ? "🧑‍🌾" : "🧔"}</div>
        <div style={{ fontSize: 20, letterSpacing: -6 }}>🍋🍋🍋</div>
      </div>
      {/* name plate */}
      <div style={{ background: mine ? P.lemon : P.white, border: BORDER, boxShadow: "2px 2px 0 " + P.ink, fontFamily: pixFont, fontSize: 8, padding: "3px 2px", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {mine ? "YOUR STAND" : gr.name}
      </div>
    </div>
  );
}

function Person({ p, emoji, round, sad, buying }) {
  return (
    <div className="walk" style={{ position: "absolute", left: `${p.left}%`, top: `${p.top}%`, transform: "translateX(-50%)", zIndex: p.z }}>
      {buying && <span key={round} className="coin" style={{ position: "absolute", left: "50%", top: -14, fontSize: 13 }}>🪙</span>}
      <span className="step" style={{ display: "inline-block", fontSize: 30 * p.scale, filter: sad ? "grayscale(1)" : "none", opacity: sad ? 0.55 : 1 }}>
        {emoji}
      </span>
      {sad && <span style={{ position: "absolute", left: "60%", top: -6, fontSize: 13 }}>💸</span>}
    </div>
  );
}

function Bubble({ x, y, text }) {
  return (
    <div className="pop" style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translateX(-50%)", background: P.white, border: BORDER, boxShadow: "2px 2px 0 " + P.ink, padding: "3px 6px", fontFamily: bodyFont, fontSize: 15, whiteSpace: "nowrap", zIndex: 7 }}>
      {text}
    </div>
  );
}

export default function Town({ state, studentId }) {
  const ids = state.growers.map((g) => g.id);
  const a = state.growers.find((g) => g.id === ids[0]);
  const b = state.growers.find((g) => g.id === ids[1]);
  const groups = assign(state, ids);
  const speech = bubbles(state, ids);
  const round = state.round;

  const pos = {};
  place(groups.A, 25, [64, 80]).forEach((p) => (pos[p.idx] = { ...p, buying: true }));
  place(groups.B, 75, [64, 80]).forEach((p) => (pos[p.idx] = { ...p, buying: true }));
  place(groups.off, 92, [70, 86]).forEach((p, i) => (pos[p.idx] = { ...p, left: i % 2 ? 96 : 5, sad: true }));
  place(groups.idle, 50, [66, 82]).forEach((p) => (pos[p.idx] = { ...p }));

  const bubbleAt = { A: { x: 25, y: 25 }, B: { x: 75, y: 25 }, off: { x: 50, y: 63 } };

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          position: "relative", border: BORDER, boxShadow: SHADOW, overflow: "hidden",
          height: "min(58vw, 430px)", minHeight: 360,
          background: "linear-gradient(#BFE3FF 0%, #DFF1FF 44%, #CDE8A6 44%, #CDE8A6 58%, #B8AE93 58%, #A89E82 100%)",
        }}
      >
        {/* sky ambience */}
        <span className="sun" style={{ position: "absolute", top: 10, right: 16, fontSize: 34, zIndex: 1 }}>☀️</span>
        <span className="drift" style={{ position: "absolute", top: 22, fontSize: 28, zIndex: 1 }}>☁️</span>
        <span className="drift2" style={{ position: "absolute", top: 60, fontSize: 22, zIndex: 1 }}>☁️</span>
        <span className="fly" style={{ position: "absolute", top: 40, fontSize: 16, zIndex: 1 }}>🐦</span>

        {/* skyline of houses along the horizon */}
        <div style={{ position: "absolute", top: "30%", left: 0, right: 0, display: "flex", justifyContent: "space-around", alignItems: "flex-end", zIndex: 1, opacity: 0.95 }}>
          {HOUSES.map((h, i) => <span key={i} style={{ fontSize: 30 + (i % 3) * 6 }}>{h}</span>)}
        </div>

        {/* trees flanking the square */}
        <span className="sway" style={{ position: "absolute", left: 6, top: "50%", fontSize: 34, zIndex: 2 }}>🌳</span>
        <span className="sway" style={{ position: "absolute", right: 6, top: "50%", fontSize: 34, zIndex: 2 }}>🌳</span>

        {/* the two market stalls */}
        <Stall gr={a} mine={a.id === studentId} x={25} />
        <Stall gr={b} mine={b.id === studentId} x={75} />

        {/* patrolling dog */}
        <span className="patrol" style={{ position: "absolute", top: "90%", fontSize: 22, zIndex: 3 }}>🐕</span>

        {/* townsfolk */}
        {[...Array(state.townsfolk ?? 20).keys()].map((i) => {
          const p = pos[i] ?? { left: 50, top: 84, scale: 1, z: 3, sad: true };
          return <Person key={i} p={p} emoji={FOLK[i % FOLK.length]} round={round} sad={p.sad} buying={p.buying} />;
        })}

        {/* speech bubbles */}
        {speech.map((s, i) => <Bubble key={i} x={bubbleAt[s.side].x} y={bubbleAt[s.side].y} text={s.text} />)}

        {/* idle hint */}
        {groups.idle.length > 0 && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: P.white, border: BORDER, boxShadow: "2px 2px 0 " + P.ink, padding: "6px 10px", fontFamily: pixFont, fontSize: 9, zIndex: 6 }}>
            Market opens — set your price! 🍋
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Tag bg={P.white}>Demand {state.market.totalDemand ?? "—"}</Tag>
        <Tag bg={P.white}>Avg ${state.market.avgPrice ?? "—"}</Tag>
        <Tag bg={P.lemon}>{a.id === studentId ? "You" : a.name} sold {a.sold}</Tag>
        <Tag bg={P.green}>{b.id === studentId ? "You" : b.name} sold {b.sold}</Tag>
      </div>
    </div>
  );
}
