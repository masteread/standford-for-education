// The town of Lemonville — a living pixel city and the demo centerpiece.
// Three bands: farms on the ridge, warehouse district, main street of grocers &
// cafés, and 24 townsfolk homes at the bottom. When a round resolves, the
// BUTTERFLY CASCADE physically plays out in stages:
//   step 1  price signs flip + ripple pulses at every player who moved
//   step 2  🚚 trucks run farm → depot along the top road (real trades)
//   step 3  🚐 vans run depot → shops (real trades)
//   step 4  townsfolk WALK home → shop (real folkTrips); priced-out folk stay
//           home with 💸; then speech bubbles from real cascade entries
// Every moving sprite is an entry in the engine's ledger — nothing is decorative
// guesswork. All CSS/emoji, no sprite sheets, no chart libs.
import { useEffect, useRef, useState } from "react";
import { P, BORDER, SHADOW, pixFont, bodyFont, Tag } from "./pixel.js";
import { BUILDING_POS, ROADS, ROLE_GLYPH, ROLE_TINT, homePos, shopSpot, folkIndex } from "./town-layout.js";

const STEP_AT = [0, 400, 1600, 2900, 4200]; // ms offsets for steps 1..4
const PLAYBACK_MS = 7200;

/** Stage the resolution playback: returns current step (0 = idle) + shown trips. */
function usePlayback(lastResolution) {
  const [step, setStep] = useState(0);
  const [trips, setTrips] = useState(lastResolution?.folkTrips ?? []);
  const seen = useRef(null);
  useEffect(() => {
    const key = lastResolution?.resolvedAt;
    if (!key || seen.current === key) return;
    const first = seen.current === null;
    seen.current = key;
    if (first) { setTrips(lastResolution.folkTrips ?? []); return; } // joined mid-game: no replay
    const timers = [1, 2, 3, 4].map((s) => setTimeout(() => setStep(s), STEP_AT[s]));
    timers.push(setTimeout(() => setTrips(lastResolution.folkTrips ?? []), STEP_AT[4]));
    timers.push(setTimeout(() => setStep(0), PLAYBACK_MS));
    return () => timers.forEach(clearTimeout);
  }, [lastResolution?.resolvedAt]);
  return { step, trips };
}

/** A sprite that glides from → to (CSS transition does the moving). */
function Mover({ from, to, emoji, label, duration = 1100, size = 22 }) {
  const [pos, setPos] = useState(from);
  useEffect(() => {
    const t = setTimeout(() => setPos(to), 40);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)", transition: `left ${duration}ms ease-in-out, top ${duration}ms ease-in-out`, zIndex: 9, textAlign: "center" }}>
      <span style={{ fontSize: size, display: "block", lineHeight: 1 }}>{emoji}</span>
      {label && <span style={{ fontFamily: pixFont, fontSize: 7, background: P.white, border: `2px solid ${P.ink}`, padding: "1px 3px", whiteSpace: "nowrap" }}>{label}</span>}
    </div>
  );
}

function PulseRing({ x, y, color = P.red }) {
  return <span className="pulse" style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 18, height: 18, marginLeft: -9, marginTop: -9, border: `3px solid ${color}`, borderRadius: "50%", zIndex: 8 }} />;
}

function Bubble({ x, y, text }) {
  return (
    <div className="pop" style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translateX(-50%)", background: P.white, border: `3px solid ${P.ink}`, boxShadow: `2px 2px 0 ${P.ink}`, padding: "2px 6px", fontFamily: bodyFont, fontSize: 14, whiteSpace: "nowrap", zIndex: 11 }}>
      {text}
    </div>
  );
}

function Building({ p, mine, step }) {
  const pos = BUILDING_POS[p.id];
  if (!pos) return null;
  const glyph = ROLE_GLYPH[p.role];
  const tint = ROLE_TINT[p.role];
  const stock = Math.min(p.stock ?? 0, 12);
  return (
    <div style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)", textAlign: "center", zIndex: 4, width: 86 }}>
      {/* price sign — key on price so it flips when it changes */}
      <div key={p.price} className="flip" style={{ display: "inline-block", background: p.badRep ? P.redSoft : P.white, border: `3px solid ${P.ink}`, boxShadow: `2px 2px 0 ${P.ink}`, padding: "2px 5px", fontFamily: pixFont, fontSize: 10, marginBottom: 2 }}>
        ${p.price}{p.badRep ? " 🤢" : ""}
      </div>
      <div style={{ fontSize: 30, lineHeight: 1.05, filter: mine ? `drop-shadow(0 0 6px ${P.lemon})` : "none" }}>{glyph}</div>
      {/* shelf/stock strip */}
      <div style={{ fontSize: 9, letterSpacing: -2, minHeight: 12, opacity: 0.95 }}>
        {stock > 0 ? "🍋".repeat(Math.max(1, Math.round(stock / 2))) : <span style={{ fontFamily: pixFont, fontSize: 6, color: P.red }}>EMPTY</span>}
      </div>
      {step > 0 && p.sold > 0 && (
        <div key={`sold-${step}`} className="coin" style={{ position: "absolute", top: -10, right: 0, fontSize: 12 }}>💰</div>
      )}
      <div style={{ background: mine ? P.lemon : tint, border: `3px solid ${P.ink}`, boxShadow: `2px 2px 0 ${P.ink}`, fontFamily: pixFont, fontSize: 7, padding: "2px 2px", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {mine ? "★ YOU" : p.name.length > 12 ? p.id : p.name}{p.isHuman && !mine ? " 🧑" : ""}
      </div>
    </div>
  );
}

/** Speech bubbles sampled from the round's REAL cascade entries. */
function bubblesFor(cascade, step) {
  if (step < 4 || !cascade?.length) return [];
  const out = [];
  const at = (id, dy = -8) => {
    const b = BUILDING_POS[id];
    return b ? { x: b.x, y: b.y + dy } : { x: 50, y: 74 };
  };
  for (const c of cascade) {
    if (out.length >= 4) break;
    if (c.kind === "switch" && c.source) out.push({ ...at(c.source), text: "Cheaper here! 🚶" });
    else if (c.kind === "sellout") out.push({ ...at(c.affected), text: "Sold out! 😮" });
    else if (c.kind === "shortage") out.push({ ...at(c.affected), text: "Where's my delivery?! 📦" });
    else if (c.kind === "quality") out.push({ ...at(c.affected ?? c.source), text: "Bad lemons! 🤢" });
    else if (c.kind === "pricedout") out.push({ x: 50, y: 76, text: "Too pricey! 😤" });
    else if (c.kind === "spoilage") out.push({ ...at(c.affected), text: "It all went brown… 🟤" });
  }
  return out;
}

export default function Town({ state, studentId }) {
  const lr = state.lastResolution;
  const { step, trips } = usePlayback(lr);
  const players = state.players;
  const folk = state.folk ?? [];

  // trucks (step 2) + vans (step 3) from the trade ledger
  const trades = lr?.trades ?? [];
  const trucks = step === 2 ? trades.filter((t) => t.from.startsWith("F")) : [];
  const vans = step === 3 ? trades.filter((t) => t.from.startsWith("W")) : [];

  // folk placement from the shown trips (the crowd IS the ledger)
  const tripByFolk = {};
  for (const t of trips) if (t.kind === "grocery" || (t.kind === "meal" && t.to)) tripByFolk[t.folk] ??= t;
  for (const t of trips) if (!tripByFolk[t.folk]) tripByFolk[t.folk] = t;

  // movers who moved price this round → pulse rings (step 1+)
  const pulses = step >= 1 ? (lr?.cascade ?? []).filter((c) => c.kind === "price" && c.source && BUILDING_POS[c.source]) : [];
  const bubbles = bubblesFor(lr?.cascade, step);
  const metrics = lr?.metrics;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ position: "relative", border: BORDER, boxShadow: SHADOW, overflow: "hidden", height: "min(120vw, 560px)", minHeight: 480, background: "linear-gradient(#BFE3FF 0%, #DFF1FF 9%, #CDE8A6 9%, #BFDD90 24%, #D9CFA8 24%, #D9CFA8 31%, #CFE3B0 31%, #C4DCA0 46%, #BFB694 46%, #BFB694 52%, #E8DFC0 52%, #DED4B2 70%, #CDE8A6 70%, #B9DB92 100%)" }}>
        {/* sky ambience */}
        <span className="sun" style={{ position: "absolute", top: 6, right: 14, fontSize: 30, zIndex: 1 }}>☀️</span>
        <span className="drift" style={{ position: "absolute", top: 8, fontSize: 24, zIndex: 1 }}>☁️</span>
        <span className="drift2" style={{ position: "absolute", top: 26, fontSize: 18, zIndex: 1 }}>☁️</span>
        <span className="fly" style={{ position: "absolute", top: 18, fontSize: 14, zIndex: 1 }}>🐦</span>

        {/* roads */}
        {ROADS.map((r, i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${r.y}%`, height: "4.5%", background: "#8B8378", borderTop: `3px solid ${P.ink}`, borderBottom: `3px solid ${P.ink}`, zIndex: 2 }}>
            <div style={{ height: 2, marginTop: "1.6%", background: "repeating-linear-gradient(90deg, #FFF 0 18px, transparent 18px 36px)" }} />
          </div>
        ))}
        {/* district labels */}
        <div style={{ position: "absolute", left: 4, top: "6.5%", fontFamily: pixFont, fontSize: 7, opacity: 0.55, zIndex: 2 }}>🌾 FARMS</div>
        <div style={{ position: "absolute", left: 4, top: "33%", fontFamily: pixFont, fontSize: 7, opacity: 0.55, zIndex: 2 }}>🏭 DEPOTS</div>
        <div style={{ position: "absolute", left: 4, top: "53.5%", fontFamily: pixFont, fontSize: 7, opacity: 0.55, zIndex: 2 }}>🛒 MAIN ST</div>
        <div style={{ position: "absolute", left: 4, top: "76%", fontFamily: pixFont, fontSize: 7, opacity: 0.55, zIndex: 2 }}>🏠 HOMES</div>

        {/* trees + dog */}
        <span className="sway" style={{ position: "absolute", right: 5, top: "22%", fontSize: 26, zIndex: 3 }}>🌳</span>
        <span className="sway" style={{ position: "absolute", right: 8, top: "66%", fontSize: 26, zIndex: 3 }}>🌳</span>
        <span className="patrol" style={{ position: "absolute", top: "72%", fontSize: 18, zIndex: 5 }}>🐕</span>

        {/* buildings */}
        {players.map((p) => <Building key={p.id} p={p} mine={p.id === studentId} step={step} />)}

        {/* ripple pulses at movers */}
        {pulses.map((c, i) => <PulseRing key={`${c.source}-${i}`} x={BUILDING_POS[c.source].x} y={BUILDING_POS[c.source].y} color={P.red} />)}

        {/* trucks + vans running the actual trades */}
        {trucks.map((t, i) => (
          <Mover key={`tk-${lr.round}-${i}`} from={BUILDING_POS[t.from]} to={BUILDING_POS[t.to]} emoji="🚚" label={`${t.qty}📦 $${t.price}`} />
        ))}
        {vans.map((t, i) => (
          <Mover key={`vn-${lr.round}-${i}`} from={BUILDING_POS[t.from]} to={BUILDING_POS[t.to]} emoji={t.bad ? "🚐🤢" : "🚐"} label={`${t.qty}📦`} size={19} />
        ))}

        {/* townsfolk — home, or clustered at the shop they actually bought from */}
        {folk.map((f, i) => {
          const idx = folkIndex(f.id);
          const trip = tripByFolk[f.id];
          const bought = trip?.to;
          const pos = bought ? shopSpot(trip.to, idx) : homePos(idx);
          const sad = trip && !trip.to && trip.reason === "pricedOut";
          const hungry = trip && !trip.to && trip.reason === "empty";
          return (
            <div key={f.id} className="walk" style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)", zIndex: 6, textAlign: "center" }}>
              <span className={bought ? "step" : "bob"} style={{ display: "inline-block", fontSize: 19, filter: sad ? "grayscale(1)" : "none", opacity: sad ? 0.55 : 1 }}>{f.emoji}</span>
              {sad && <span style={{ position: "absolute", left: "58%", top: -8, fontSize: 11 }}>💸</span>}
              {hungry && <span style={{ position: "absolute", left: "58%", top: -8, fontSize: 11 }}>❓</span>}
              {bought && trip.bad && <span key={`b${lr?.round}`} className="pop" style={{ position: "absolute", left: "58%", top: -8, fontSize: 11 }}>🤢</span>}
            </div>
          );
        })}

        {/* speech bubbles from real cascade entries */}
        {bubbles.map((b, i) => <Bubble key={i} x={b.x} y={b.y} text={b.text} />)}

        {/* playback caption */}
        {step > 0 && (
          <div style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", background: P.lemon, border: `3px solid ${P.ink}`, boxShadow: `2px 2px 0 ${P.ink}`, padding: "3px 8px", fontFamily: pixFont, fontSize: 8, zIndex: 12, whiteSpace: "nowrap" }}>
            {step === 1 && `📣 ROUND ${lr.round}: prices move…`}
            {step === 2 && "🚚 farms ship to depots…"}
            {step === 3 && "🚐 depots supply main street…"}
            {step === 4 && "🚶 the town goes shopping"}
          </div>
        )}
      </div>

      {/* town mood — two numbers a student can read at a glance */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Tag bg={P.greenSoft}>🛍️ {trips.filter((t) => t.to).length} purchases last round</Tag>
        <Tag bg={(metrics?.pricedOut ?? 0) >= 8 ? P.red : P.white}>😤 {metrics?.pricedOut ?? 0} townsfolk found it too expensive</Tag>
      </div>
    </div>
  );
}
