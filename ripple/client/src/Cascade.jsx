// Cascade / Town Crier list — a styled, clickable chained trace grouped by round
// (NOT a graph). Entries that involve you are highlighted; teaching moments
// (elasticity, spoilage, shock, tax, cartel, quality) are color-coded. Used on
// the report screen for evidence replay.
import { useEffect, useRef } from "react";
import { P, BORDER, SHADOW_SM, pixFont, bodyFont, Tag } from "./pixel.js";

const KIND_COLOR = {
  elasticity: P.red, spoilage: P.red, panic: P.red, quality: P.red,
  shock: P.sky, tax: P.sky, cartel: P.lemon, sellout: P.lemon, switch: P.green, aging: P.ink, price: P.ink,
};
const KIND_ICON = { elasticity: "⚡", shock: "❄️", tax: "📜", quality: "🕵️", cartel: "🤝", spoilage: "🟤", sellout: "🔥", switch: "🚶", panic: "📉" };
const involvesMe = (e, id) => e.affected === id || String(e.cause ?? "").startsWith(id) || e.affected === "all";

export default function CascadeList({ cascade, studentId, replayRound, onReplayRound }) {
  const refs = useRef({});
  useEffect(() => {
    if (replayRound != null && refs.current[replayRound]) refs.current[replayRound].scrollIntoView({ behavior: "smooth", block: "center" });
  }, [replayRound]);

  if (!cascade || cascade.length === 0) {
    return <div style={{ fontFamily: bodyFont, fontSize: 17, color: P.ink, opacity: 0.7 }}>No consequences yet — make a move and watch it ripple.</div>;
  }
  const byRound = {};
  for (const e of cascade) (byRound[e.round] ??= []).push(e);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a);

  return (
    <div>
      {rounds.map((round) => {
        const entries = byRound[round];
        const active = replayRound === round;
        return (
          <div
            key={round}
            ref={(el) => (refs.current[round] = el)}
            onClick={() => onReplayRound?.(round)}
            style={{ border: BORDER, boxShadow: SHADOW_SM, background: active ? P.lemonSoft : P.paper, padding: 10, marginBottom: 8, cursor: "pointer" }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontFamily: pixFont, fontSize: 9 }}>📯 Round {round}</span>
              {entries.some((e) => e.kind === "shock") && <Tag bg={P.sky} color="#fff">❄️ FROST</Tag>}
              {entries.some((e) => e.kind === "tax") && <Tag bg={P.lemon}>📜 TAX</Tag>}
              {entries.some((e) => e.kind === "cartel") && <Tag bg={P.green}>🤝 CARTEL</Tag>}
            </div>
            {entries.map((e, i) => {
              const mine = involvesMe(e, studentId);
              return (
                <div key={i} style={{ padding: "3px 0", background: mine ? "#fff" : "transparent" }}>
                  <div style={{ fontFamily: bodyFont, fontSize: 16, fontWeight: mine ? 700 : 400 }}>{e.cause}</div>
                  <div style={{ fontFamily: bodyFont, fontSize: 15, color: KIND_COLOR[e.kind] ?? P.ink }}>
                    {KIND_ICON[e.kind] ?? "↳"} {e.effect}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
