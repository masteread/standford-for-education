// A5 — Cascade visualization: the demo weapon. A styled, clickable chained list
// grouped by round (NOT a graph). Entries that involve you are highlighted;
// teaching moments (elasticity, spoilage, shock, panic) are color-coded.
// (PRD-personA.md §4.2)
import { useEffect, useRef } from "react";
import { C, T } from "./ui.js";

const KIND_COLOR = {
  elasticity: C.red, spoilage: C.red, panic: C.red,
  shock: C.frost, sellout: C.lemon, switch: C.muted, aging: C.muted, price: C.ink,
};

function involvesMe(e, id) {
  return e.affected === id || String(e.cause ?? "").startsWith(id) || e.affected === "all";
}

function Entry({ e, mine }) {
  const color = KIND_COLOR[e.kind] ?? C.ink;
  const loud = e.kind === "elasticity" || e.kind === "shock";
  return (
    <div style={{ display: "flex", gap: 11, padding: "7px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: mine ? C.green : "#fff", border: `2px solid ${mine ? C.green : C.faint}` }} />
        <span style={{ flex: 1, width: 2, background: C.line, marginTop: 2 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 2 }}>
        <div style={{ ...T.body, fontSize: 14.5, fontWeight: mine ? 700 : 500 }}>{e.cause}</div>
        <div style={{ ...T.body, fontSize: 13.5, color, fontWeight: loud ? 700 : 500, marginTop: 1 }}>
          {e.kind === "elasticity" ? "⚡ " : "↳ "}{e.effect}
        </div>
      </div>
    </div>
  );
}

export default function Cascade({ cascade, studentId, replayRound, onReplayRound }) {
  const refs = useRef({});
  useEffect(() => {
    if (replayRound != null && refs.current[replayRound]) {
      refs.current[replayRound].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [replayRound]);

  if (!cascade || cascade.length === 0) {
    return <p style={{ ...T.body, color: C.muted }}>No consequences yet — make a move and watch it ripple.</p>;
  }

  const byRound = {};
  for (const e of cascade) (byRound[e.round] ??= []).push(e);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a);

  return (
    <div>
      {rounds.map((round) => {
        const entries = byRound[round];
        const hasFrost = entries.some((e) => e.kind === "shock");
        const active = replayRound === round;
        return (
          <div
            key={round}
            ref={(el) => (refs.current[round] = el)}
            onClick={() => onReplayRound?.(round)}
            className="fade-in"
            style={{
              border: `1px solid ${active ? C.accentLine : C.line}`,
              background: active ? C.accentBg : C.surface,
              borderRadius: 14, padding: "13px 15px", marginBottom: 9, cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span style={{ ...T.label }}>Round {round}</span>
              {hasFrost && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.frost, background: C.frostSoft, padding: "2px 7px", borderRadius: 999 }}>❄ FROST</span>}
            </div>
            {entries.map((e, i) => <Entry key={i} e={e} mine={involvesMe(e, studentId)} />)}
          </div>
        );
      })}
    </div>
  );
}
