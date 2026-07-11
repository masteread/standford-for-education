// A5 — Cascade visualization: the demo weapon. A styled, clickable chained list
// grouped by round (NOT a graph). Entries that involve you are highlighted;
// teaching moments (elasticity, spoilage, shock, panic) are color-coded.
// (PRD-personA.md §4.2)
import { useEffect, useRef } from "react";
import { C, F } from "./ui.js";

// Color a teaching moment by its kind.
const KIND_COLOR = {
  elasticity: C.red,
  spoilage: C.red,
  panic: C.red,
  shock: C.amber,
  sellout: C.amber,
  switch: C.sub,
  aging: C.sub,
  price: C.ink,
};

function involvesMe(entry, id) {
  return entry.affected === id || String(entry.cause ?? "").startsWith(id) || entry.affected === "all";
}

function Entry({ e, mine }) {
  const color = KIND_COLOR[e.kind] ?? C.ink;
  const loud = e.kind === "elasticity" || e.kind === "shock";
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0" }}>
      <span style={{ color: mine ? C.green : C.sub, fontSize: 14, marginTop: 2 }}>{mine ? "●" : "○"}</span>
      <div style={{ flex: 1 }}>
        <div style={{ ...F.body, fontSize: 15, fontWeight: mine ? 700 : 500 }}>{e.cause}</div>
        <div style={{ ...F.body, fontSize: 14, color, fontWeight: loud ? 700 : 400 }}>
          {e.kind === "elasticity" ? "⚡ " : ""}↳ {e.effect}
        </div>
      </div>
    </div>
  );
}

export default function Cascade({ cascade, studentId, replayRound, onReplayRound }) {
  const refs = useRef({});

  // When Report links to a round, scroll it into view and flash it.
  useEffect(() => {
    if (replayRound != null && refs.current[replayRound]) {
      refs.current[replayRound].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [replayRound]);

  if (!cascade || cascade.length === 0) {
    return <p style={{ ...F.body, color: C.sub }}>No consequences yet — make a move and watch it ripple.</p>;
  }

  // Group entries by round, newest round first.
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
            style={{
              border: `1px solid ${active ? C.accentLine : C.line}`,
              background: active ? C.accentBg : C.card,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              cursor: "pointer",
            }}
          >
            <div style={{ ...F.label, marginBottom: 6, display: "flex", gap: 8 }}>
              <span>Round {round}</span>
              {hasFrost && <span style={{ color: C.amber, fontWeight: 800 }}>⚠ FROST</span>}
            </div>
            {entries.map((e, i) => (
              <Entry key={i} e={e} mine={involvesMe(e, studentId)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
