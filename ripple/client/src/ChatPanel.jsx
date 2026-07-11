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
  elasticity: P.red, spoilage: P.red, quality: P.red, pricedout: P.red, shortage: P.red,
  shock: P.sky, tax: P.sky, cartel: P.lemon, sellout: P.lemon, switch: P.green, price: P.ink,
};
const involvesMe = (e, id) => e.affected === id || e.source === id || e.affected === "all";

export default function ChatPanel({ state, studentId, onReplayRound, onPropose }) {
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
        {tab === "delegate" && <Delegate state={state} studentId={studentId} onPropose={onPropose} />}
        {tab === "crier" && <Crier state={state} studentId={studentId} onReplayRound={onReplayRound} />}
        {tab === "messages" && <Messages state={state} studentId={studentId} />}
      </div>
    </div>
  );
}

// ── Delegate chat ─────────────────────────────────────────────────────────────
const ROLE_HELLO = {
  farmer: "Hi boss! Tell me what to charge the depots and how much to grow. 🍋",
  wholesaler: "Hi boss! Tell me our ask price and how many crates to pull from the farms. 🚛",
  grocer: "Hi boss! Tell me our shelf price and how much to order from the depots. 🛒",
  restaurant: "Hi chef! Tell me our meal price and how many crates to order. 👨‍🍳",
};

function Delegate({ state, studentId, onPropose }) {
  const self = state.players.find((g) => g.id === studentId) ?? state.players[0];
  const peers = state.players.filter((g) => g.role === self.role && g.id !== studentId);
  const cheapestPeer = peers.length ? peers.reduce((a, c) => (c.price < a.price ? c : a)) : null;
  const [log, setLog] = useState([{ from: "delegate", text: ROLE_HELLO[self.role] ?? ROLE_HELLO.farmer }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => { // new round → note it in the chat
    setLog((l) => [...l, { from: "crier", text: `— Round ${state.round} —` }]);
  }, [state.round]);
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
        setLog((l) => [...l, { from: "delegate", text: `${data.reply ?? `Price $${data.action.price}, qty ${data.action.qty}.`} → check the 🔮 preview below the town, then lock it in.` }]);
      } else setLog((l) => [...l, { from: "delegate", text: "I couldn't read that — try rephrasing?" }]);
    } catch { setLog((l) => [...l, { from: "delegate", text: "Network hiccup — try again." }]); }
    setBusy(false);
  }

  const qtyWord = self.role === "farmer" ? "grow" : "order";
  const chips = [
    ["Raise 50¢", `raise price to $${(self.price + 0.5).toFixed(2)}`],
    ["Undercut 25¢", cheapestPeer ? `undercut ${cheapestPeer.id} to $${(cheapestPeer.price - 0.25).toFixed(2)}` : "undercut my competitors slightly"],
    ["Hold", `hold at $${self.price}`],
    [qtyWord === "grow" ? "Grow +5" : "Order +5", `${qtyWord} 5 more`],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: 10, minHeight: 180 }}>
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
