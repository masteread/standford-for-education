// Bottom-of-screen helper panel, two tabs only (offers surface as a big card in
// Game.jsx, never buried here):
//  🗣 Helper   : type strategy in plain English; the AI helper fills in your move
//  📯 Town News: what happened each round, newest first, your items highlighted
import { useEffect, useRef, useState } from "react";
import { P, BORDER, SHADOW, SHADOW_SM, pixFont, bodyFont, Btn, Chip } from "./pixel.js";

const KIND_COLOR = {
  elasticity: P.red, spoilage: P.red, quality: P.red, pricedout: P.red, shortage: P.red,
  shock: P.sky, tax: P.sky, cartel: P.lemon, sellout: P.lemon, switch: P.green, price: P.ink,
};
const involvesMe = (e, id) => e.affected === id || e.source === id;

export default function ChatPanel({ state, studentId, onReplayRound, onPropose }) {
  const [tab, setTab] = useState("delegate");
  return (
    <div style={{ border: BORDER, boxShadow: SHADOW, background: P.white, display: "flex", flexDirection: "column", minHeight: 320, maxHeight: 420 }}>
      <div style={{ display: "flex", borderBottom: BORDER }}>
        {[["delegate", "🗣 Helper"], ["crier", "📯 Town news"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, fontFamily: pixFont, fontSize: 9, padding: "10px 4px", border: "none", borderRadius: 0,
              boxShadow: "none", background: tab === id ? P.lemon : P.white,
              borderRight: id === "delegate" ? BORDER : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "delegate" && <Delegate state={state} studentId={studentId} onPropose={onPropose} />}
        {tab === "crier" && <Crier state={state} studentId={studentId} onReplayRound={onReplayRound} />}
      </div>
    </div>
  );
}

// ── Helper chat ───────────────────────────────────────────────────────────────
const ROLE_HELLO = {
  farmer: "Hi boss! Tell me what to do in plain words — like “lower my price a little”. 🍋",
  wholesaler: "Hi boss! Tell me what to do in plain words — like “buy 10 more crates”. 🚛",
  grocer: "Hi boss! Tell me what to do in plain words — like “undercut the other stores”. 🛒",
  restaurant: "Hi chef! Tell me what to do in plain words — like “raise the meal price by $1”. 👨‍🍳",
};

function Delegate({ state, studentId, onPropose }) {
  const self = state.players.find((g) => g.id === studentId) ?? state.players[0];
  const peers = state.players.filter((g) => g.role === self.role && g.id !== studentId);
  const cheapestPeer = peers.length ? peers.reduce((a, c) => (c.price < a.price ? c : a)) : null;
  const [log, setLog] = useState([{ from: "delegate", text: ROLE_HELLO[self.role] ?? ROLE_HELLO.farmer }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight); }, [log]);

  async function send() {
    if (!text.trim() || busy) return;
    const mine = text.trim();
    setLog((l) => [...l, { from: "you", text: mine }]);
    setText(""); setBusy(true);
    try {
      const res = await fetch("/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, text: mine }) });
      const data = await res.json();
      if (data.clarifyingQuestion) setLog((l) => [...l, { from: "delegate", text: data.clarifyingQuestion }]);
      else if (data.action) {
        onPropose?.({ ...data.action, intent: mine });
        setLog((l) => [...l, { from: "delegate", text: `${data.reply ?? `Price $${data.action.price}, qty ${data.action.qty}.`} I filled in your move — press ✅ CONFIRM when ready.` }]);
      } else setLog((l) => [...l, { from: "delegate", text: "I couldn't read that — try rephrasing?" }]);
    } catch { setLog((l) => [...l, { from: "delegate", text: "Network hiccup — try again." }]); }
    setBusy(false);
  }

  const qtyWord = self.role === "farmer" ? "grow" : "order";
  const chips = [
    ["⬇ Price down", `cut price by 0.5`],
    ["⬆ Price up", `raise price to $${(self.price + 0.5).toFixed(2)}`],
    [cheapestPeer ? `Undercut ${cheapestPeer.name.split(" ")[0]}` : "Undercut", cheapestPeer ? `undercut ${cheapestPeer.name} to $${(cheapestPeer.price - 0.25).toFixed(2)}` : "undercut my competitors slightly"],
    ["📦 +5", `${qtyWord} 5 more`],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: 10, minHeight: 120 }}>
        {log.map((m, i) => <Msg key={i} m={m} />)}
      </div>
      <div style={{ borderTop: BORDER, padding: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
          {chips.map(([label, fill]) => <Chip key={label} onClick={() => setText(fill)}>{label}</Chip>)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder='say it in your own words…'
            style={{ flex: 1, padding: 8, fontSize: 16, minWidth: 0 }}
            disabled={busy}
          />
          <Btn tone="ink" size={10} onClick={send} disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</Btn>
        </div>
      </div>
    </div>
  );
}

function Msg({ m }) {
  const you = m.from === "you";
  return (
    <div style={{ display: "flex", justifyContent: you ? "flex-end" : "flex-start", marginBottom: 6 }}>
      <div style={{ maxWidth: "85%", background: you ? P.sky : P.lemonSoft, color: you ? "#fff" : P.ink, border: BORDER, boxShadow: SHADOW_SM, padding: "6px 8px", fontFamily: bodyFont, fontSize: 16 }}>
        {!you && <span style={{ marginRight: 4 }}>🤖</span>}{m.text}
      </div>
    </div>
  );
}

// ── Town news (cascade) ───────────────────────────────────────────────────────
function Crier({ state, studentId, onReplayRound }) {
  const cascade = state.cascade ?? [];
  if (!cascade.length) return <Empty text="No news yet — after the first round, everything that happens in town shows up here." />;
  const byRound = {};
  for (const e of cascade) (byRound[e.round] ??= []).push(e);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a).slice(0, 4); // recent only — this is a feed, not an archive
  return (
    <div style={{ overflowY: "auto", height: "100%", padding: 8 }}>
      {rounds.map((round) => (
        <div key={round} onClick={() => onReplayRound?.(round)} style={{ border: BORDER, boxShadow: SHADOW_SM, background: P.paper, padding: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: pixFont, fontSize: 9, marginBottom: 4 }}>📯 Round {round}</div>
          {byRound[round].filter((e) => involvesMe(e, studentId)).slice(0, 3).map((e, i) => (
            <div key={`m${i}`} style={{ padding: "3px 4px", background: P.lemonSoft, marginBottom: 2 }}>
              <div style={{ fontFamily: bodyFont, fontSize: 15, fontWeight: 700 }}>{e.cause}</div>
              <div style={{ fontFamily: bodyFont, fontSize: 14, color: KIND_COLOR[e.kind] ?? P.ink }}>↳ {e.effect}</div>
            </div>
          ))}
          {byRound[round].filter((e) => !involvesMe(e, studentId)).slice(0, 3).map((e, i) => (
            <div key={i} style={{ padding: "3px 0" }}>
              <div style={{ fontFamily: bodyFont, fontSize: 15 }}>{e.cause}</div>
              <div style={{ fontFamily: bodyFont, fontSize: 14, color: KIND_COLOR[e.kind] ?? P.ink }}>↳ {e.effect}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ padding: 16, fontFamily: bodyFont, fontSize: 17, color: P.ink, opacity: 0.7, textAlign: "center" }}>{text}</div>;
}
