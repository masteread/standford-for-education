// RIGHT column — three tabs:
//  🗣 Delegate  : chat the player types plain-English strategy into; the delegate
//                 replies in-character, may ask ONE clarifying question, then
//                 confirms the queued action. Quick-action chips prefill the box.
//  📯 Town Crier: the cascade log as cute announcements, newest first, YOUR
//                 entries highlighted. Click an entry to replay that round.
//  ✉️ Messages  : NPC/event mail — cartel + shady-supplier offers with buttons.
import { useEffect, useRef, useState } from "react";
import { P, BORDER, SHADOW, SHADOW_SM, pixFont, bodyFont, Btn, Chip, Tag } from "./pixel.js";

const KIND_COLOR = {
  elasticity: P.red, spoilage: P.red, panic: P.red, quality: P.red,
  shock: P.sky, tax: P.sky, cartel: P.lemon, sellout: P.lemon, switch: P.green, aging: P.ink, price: P.ink,
};
const involvesMe = (e, id) => e.affected === id || String(e.cause ?? "").startsWith(id) || e.affected === "all";

export default function ChatPanel({ state, studentId, onReplayRound }) {
  const [tab, setTab] = useState("delegate");
  const offers = state.offers ?? [];
  return (
    <div style={{ border: BORDER, boxShadow: SHADOW, background: P.white, display: "flex", flexDirection: "column", height: "100%", minHeight: 420 }}>
      <div style={{ display: "flex", borderBottom: BORDER }}>
        {[["delegate", "🗣"], ["crier", "📯"], ["messages", "✉️"]].map(([id, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, fontFamily: pixFont, fontSize: 12, padding: "10px 4px", border: "none", borderRadius: 0,
              boxShadow: "none", background: tab === id ? P.lemon : P.white,
              borderRight: id !== "messages" ? BORDER : "none",
            }}
          >
            {icon}{id === "messages" && offers.length > 0 ? ` (${offers.length})` : ""}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "delegate" && <Delegate state={state} studentId={studentId} />}
        {tab === "crier" && <Crier state={state} studentId={studentId} onReplayRound={onReplayRound} />}
        {tab === "messages" && <Messages state={state} studentId={studentId} />}
      </div>
    </div>
  );
}

// ── Delegate chat ─────────────────────────────────────────────────────────────
function Delegate({ state, studentId }) {
  const self = state.growers.find((g) => g.id === studentId) ?? state.growers[0];
  const rival = state.growers.find((g) => g.id !== studentId);
  const [log, setLog] = useState([{ from: "delegate", text: "Hi! Tell me how to price our lemons this round. 🍋" }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState(null);
  const [why, setWhy] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const scroller = useRef(null);

  useEffect(() => { // new round → fresh decision
    setProposed(null); setWhy(""); setConfirmed(false);
    setLog((l) => [...l, { from: "crier", text: `— Round ${state.round} —` }]);
  }, [state.round]);
  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight); }, [log, proposed]);

  const bigMove = proposed && Math.abs(Number(proposed.price) - self.price) > 1;

  async function send() {
    if (!text.trim() || busy) return;
    const mine = text.trim();
    setLog((l) => [...l, { from: "you", text: mine }]);
    setText(""); setBusy(true); setProposed(null);
    try {
      const res = await fetch("/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, text: mine }) });
      const data = await res.json();
      if (data.clarifyingQuestion) setLog((l) => [...l, { from: "delegate", text: data.clarifyingQuestion }]);
      else if (data.action) { setProposed({ ...data.action, intent: mine }); setLog((l) => [...l, { from: "delegate", text: data.reply ?? `Price $${data.action.price}, produce ${data.action.produce}.` }]); }
      else setLog((l) => [...l, { from: "delegate", text: "I couldn't read that — try rephrasing?" }]);
    } catch { setLog((l) => [...l, { from: "delegate", text: "Network hiccup — try again." }]); }
    setBusy(false);
  }

  async function confirm() {
    if (!proposed || (bigMove && !why.trim())) return;
    const intent = why.trim() ? `${proposed.intent} — why: ${why.trim()}` : proposed.intent;
    try {
      await fetch("/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action: { price: proposed.price, produce: proposed.produce }, intent }) });
      setConfirmed(true);
      setLog((l) => [...l, { from: "delegate", text: `Locked in ✓ price $${proposed.price}, ${proposed.produce} crates.` }]);
      setProposed(null);
    } catch { setLog((l) => [...l, { from: "delegate", text: "Couldn't lock in — try again." }]); }
  }

  const chips = [
    ["Raise $1", `raise price to $${self.price + 1}`],
    ["Undercut 50¢", rival ? `undercut ${rival.name} to $${(rival.price - 0.5).toFixed(2)}` : "undercut the rival slightly"],
    ["Hold", `hold at $${self.price}`],
    ["Produce +10", "produce 10 more crates"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: 10, minHeight: 180 }}>
        {log.map((m, i) => <Msg key={i} m={m} />)}
        {proposed && (
          <div style={{ background: P.greenSoft, border: BORDER, boxShadow: SHADOW_SM, padding: 8, marginTop: 6 }}>
            <div style={{ fontFamily: pixFont, fontSize: 10 }}>Proposed: ${proposed.price} · produce {proposed.produce}</div>
            {bigMove && (
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Big move — one line: why?" style={{ width: "100%", padding: 7, marginTop: 6, fontSize: 16 }} />
            )}
            <Btn tone="green" size={10} onClick={confirm} disabled={bigMove && !why.trim()} style={{ width: "100%", marginTop: 6 }}>Confirm →</Btn>
          </div>
        )}
        {confirmed && <div style={{ fontFamily: pixFont, fontSize: 9, color: P.green, marginTop: 8 }}>Waiting for the round to resolve…</div>}
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
            placeholder='e.g. "undercut them but keep margin"'
            style={{ flex: 1, padding: 8, fontSize: 16 }}
            disabled={busy}
          />
          <Btn tone="ink" size={10} onClick={send} disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</Btn>
        </div>
      </div>
    </div>
  );
}

function Msg({ m }) {
  if (m.from === "crier") return <div style={{ textAlign: "center", fontFamily: pixFont, fontSize: 8, color: P.ink, opacity: 0.5, margin: "8px 0" }}>{m.text}</div>;
  const you = m.from === "you";
  return (
    <div style={{ display: "flex", justifyContent: you ? "flex-end" : "flex-start", marginBottom: 6 }}>
      <div style={{ maxWidth: "85%", background: you ? P.sky : P.lemonSoft, color: you ? "#fff" : P.ink, border: BORDER, boxShadow: SHADOW_SM, padding: "6px 8px", fontFamily: bodyFont, fontSize: 17 }}>
        {!you && <span style={{ marginRight: 4 }}>🤖</span>}{m.text}
      </div>
    </div>
  );
}

// ── Town Crier (cascade) ──────────────────────────────────────────────────────
function Crier({ state, studentId, onReplayRound }) {
  const cascade = state.cascade ?? [];
  if (!cascade.length) return <Empty text="No news yet — make a move and watch it ripple through town." />;
  const byRound = {};
  for (const e of cascade) (byRound[e.round] ??= []).push(e);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => b - a);
  return (
    <div style={{ overflowY: "auto", height: "100%", padding: 8 }}>
      {rounds.map((round) => (
        <div key={round} onClick={() => onReplayRound?.(round)} style={{ border: BORDER, boxShadow: SHADOW_SM, background: P.paper, padding: 8, marginBottom: 8, cursor: "pointer" }}>
          <div style={{ fontFamily: pixFont, fontSize: 9, marginBottom: 4 }}>📯 Round {round}</div>
          {byRound[round].map((e, i) => {
            const mine = involvesMe(e, studentId);
            return (
              <div key={i} style={{ padding: "3px 0", background: mine ? P.lemonSoft : "transparent" }}>
                <div style={{ fontFamily: bodyFont, fontSize: 16, fontWeight: mine ? 700 : 400 }}>{e.cause}</div>
                <div style={{ fontFamily: bodyFont, fontSize: 15, color: KIND_COLOR[e.kind] ?? P.ink }}>↳ {e.effect}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Messages / mailbox ────────────────────────────────────────────────────────
function Messages({ state, studentId }) {
  const [resolved, setResolved] = useState({});
  const offers = (state.offers ?? []).filter((o) => !resolved[o.offerId]);

  async function respond(offerId, accept) {
    setResolved((r) => ({ ...r, [offerId]: accept ? "accepted" : "refused" }));
    try {
      await fetch("/offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, offerId, accept }) });
    } catch { /* poll will reconcile */ }
  }

  const history = Object.entries(resolved);
  if (!offers.length && !history.length) return <Empty text="No mail yet. Strangers and rivals will write when the plot thickens…" />;
  return (
    <div style={{ overflowY: "auto", height: "100%", padding: 10 }}>
      {offers.map((o) => (
        <div key={o.offerId} className="fade-in" style={{ border: BORDER, boxShadow: SHADOW, background: P.lemonSoft, padding: 10, marginBottom: 10 }}>
          <div style={{ fontFamily: pixFont, fontSize: 10, marginBottom: 6 }}>{o.emoji} {o.title}</div>
          <div style={{ fontFamily: bodyFont, fontSize: 17, marginBottom: 8 }}>{o.body}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn tone="green" size={9} onClick={() => respond(o.offerId, true)} style={{ flex: 1 }}>{o.type === "cartel_offer" ? "🤝 Accept" : "🛒 Buy"}</Btn>
            <Btn tone="red" size={9} onClick={() => respond(o.offerId, false)} style={{ flex: 1 }}>❌ Refuse</Btn>
          </div>
        </div>
      ))}
      {history.map(([id, choice]) => (
        <div key={id} style={{ border: BORDER, boxShadow: SHADOW_SM, background: P.white, padding: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: bodyFont, fontSize: 16 }}>You {choice} this offer. <Tag bg={choice === "accepted" ? P.green : P.red}>{choice}</Tag></div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ padding: 16, fontFamily: bodyFont, fontSize: 17, color: P.ink, opacity: 0.7, textAlign: "center" }}>{text}</div>;
}
