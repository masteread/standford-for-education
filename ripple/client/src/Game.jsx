// A4 — Round view. Three panels in decision order: Goal → Market → You → Action.
// One decision per screen, mobile-first. (PRD-personA.md §4.1)
import { useEffect, useState } from "react";
import { C, T, Card, Label, Stat, Button, Chip, Wordmark } from "./ui.js";

const GOAL_LABEL = {
  max_profit: "Maximize profit over 12 rounds",
  max_market_share: "Capture the biggest market share",
  survive_shock_cash_80: "Survive the frost with cash > $80",
  zero_spoilage: "End with zero spoiled crates",
};
const SPOIL_AFTER = 3;

function useCountdown(state) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);
  if (!state?.roundStartedAt) return { left: null, frac: 0 };
  const total = state.roundSeconds * 1000;
  const remain = Math.max(0, state.roundStartedAt + total - now);
  return { left: Math.ceil(remain / 1000), frac: remain / total };
}

export default function Game({ state, studentId }) {
  const self = state.growers.find((g) => g.id === studentId) ?? state.growers[0];
  const rival = state.growers.find((g) => g.id !== studentId);
  const { left, frac } = useCountdown(state);

  const [text, setText] = useState("");
  const [step, setStep] = useState("idle"); // idle | thinking | clarify | proposed | confirmed
  const [proposed, setProposed] = useState(null);
  const [question, setQuestion] = useState(null);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    setText(""); setStep("idle"); setProposed(null); setQuestion(null); setWhy(""); setErr(null);
  }, [state.round]);

  const bigMove = proposed && Math.abs(Number(proposed.price) - self.price) > 1;

  async function send() {
    if (!text.trim()) return;
    setStep("thinking"); setErr(null);
    try {
      const res = await fetch("/intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, text: text.trim() }),
      });
      const data = await res.json();
      if (data.clarifyingQuestion) { setQuestion(data.clarifyingQuestion); setStep("clarify"); }
      else if (data.action) { setProposed(data.action); setStep("proposed"); }
      else { setErr("Your delegate couldn't read that — try rephrasing."); setStep("idle"); }
    } catch { setErr("Network hiccup — try again."); setStep("idle"); }
  }

  async function confirm() {
    if (bigMove && !why.trim()) return;
    const intent = why.trim() ? `${text.trim()} — why: ${why.trim()}` : text.trim();
    try {
      await fetch("/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, action: proposed, intent }),
      });
      setStep("confirmed");
    } catch { setErr("Could not lock in — try again."); }
  }

  const spoiling = (self.inventory ?? []).filter((b) => SPOIL_AFTER - b.age <= 2);
  const totalCrates = (self.inventory ?? []).reduce((s, b) => s + b.crates, 0);
  const frost = Boolean(state.market.news);

  return (
    <div>
      <Wordmark sub="Lemon Wars" />

      {/* Header: round + countdown bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...T.label, fontSize: 12 }}>Round {state.round} <span style={{ color: C.faint }}>/ 12</span></span>
        {left != null && (
          <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: left <= 5 ? C.red : C.muted }}>{left}s</span>
        )}
      </div>
      <div style={{ height: 4, borderRadius: 999, background: C.line, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.round((left != null ? frac : 1) * 100)}%`, background: left <= 5 ? C.red : C.lemon, borderRadius: 999, transition: "width .25s linear" }} />
      </div>

      {/* FROST — the climax. Icy, loud, interrupts. */}
      {frost && (
        <div className="frost-shimmer fade-in" style={{
          background: C.frost, color: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 16, boxShadow: `0 10px 24px -12px ${C.frost}`,
        }}>
          <span style={{ fontSize: 22 }}>❄</span> {state.market.news}
        </div>
      )}

      {/* 1. GOAL */}
      <Card accent={C.lemon}>
        <Label color={C.lemon}>Your goal</Label>
        <div style={{ ...T.data, fontSize: 19, marginTop: 6, lineHeight: 1.25 }}>{GOAL_LABEL[self.goal] ?? self.goal}</div>
      </Card>

      {/* 2. MARKET */}
      <Card>
        <Label>Market</Label>
        <Stat label="Rival price" value={rival ? `$${rival.price}` : "—"} />
        <Stat label="Demand last round" value={state.market.totalDemand ?? "—"} />
        <Stat label="Average price" value={state.market.avgPrice != null ? `$${state.market.avgPrice}` : "—"} />
      </Card>

      {/* 3. YOU */}
      <Card>
        <Label>You · {self.name}</Label>
        <Stat label="Cash" value={`$${self.cash}`} color={self.cash < 80 ? C.red : C.green} />
        <Stat label="Unit cost" value={`$${self.unitCost}`} color={self.unitCost > 2 ? C.frost : C.ink} hint={self.unitCost > 2 ? "doubled by frost" : null} />
        <Stat label="Inventory" value={`${totalCrates}`} hint="crates" />
        {spoiling.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {spoiling.map((b, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 700, color: C.red, background: C.redSoft, padding: "4px 9px", borderRadius: 999 }}>
                {b.crates} crates · spoil in {Math.max(0, SPOIL_AFTER - b.age)}r
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* 4. ACTION */}
      <Card>
        <Label>What do we do this round?</Label>
        {step === "confirmed" ? (
          <div className="fade-in" style={{ marginTop: 10, padding: 14, background: C.greenSoft, borderRadius: 12, color: C.green, fontWeight: 700 }}>
            ✓ Locked in — price ${proposed.price}, produce {proposed.produce}.
            <div style={{ fontWeight: 500, fontSize: 13, marginTop: 2, color: C.muted }}>Waiting for the round to resolve…</div>
          </div>
        ) : (
          <>
            <textarea
              style={{ width: "100%", minHeight: 62, marginTop: 10, padding: 12, fontSize: 15.5, borderRadius: 12, border: `1px solid ${C.line}`, resize: "vertical", color: C.ink }}
              placeholder={'e.g. "raise to $7, demand can take it"'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={step === "thinking"}
            />
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "10px 0" }}>
              {[
                ["Raise $1", `raise price to $${self.price + 1}`],
                ["Undercut B", rival ? `undercut B to $${(rival.price - 0.5).toFixed(2)}` : "undercut the rival slightly"],
                ["Hold", `hold at $${self.price}`],
                ["Produce +10", "produce 10 more crates"],
              ].map(([label, fill]) => <Chip key={label} onClick={() => setText(fill)}>{label}</Chip>)}
            </div>

            {step === "clarify" && (
              <div className="fade-in" style={{ padding: 13, background: C.accentBg, border: `1px solid ${C.accentLine}`, borderRadius: 12, marginBottom: 10, fontSize: 14.5 }}>
                <b>Your delegate asks:</b> {question}
                <div style={{ ...T.label, marginTop: 5 }}>Answer above, then send again</div>
              </div>
            )}

            {step === "proposed" && proposed && (
              <div className="fade-in" style={{ padding: 13, background: C.greenSoft, border: `1px solid ${C.green}22`, borderRadius: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 14.5 }}>Proposed — price <b>${proposed.price}</b> · produce <b>{proposed.produce}</b></span>
                {bigMove && (
                  <input
                    style={{ width: "100%", marginTop: 9, padding: 11, fontSize: 14.5, borderRadius: 10, border: `1px solid ${C.line}` }}
                    placeholder="Big move — one line: why?"
                    value={why} onChange={(e) => setWhy(e.target.value)}
                  />
                )}
              </div>
            )}

            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}

            {step === "proposed"
              ? <Button tone="green" onClick={confirm} disabled={bigMove && !why.trim()}>Confirm →</Button>
              : <Button tone="ink" onClick={send} disabled={step === "thinking" || !text.trim()}>{step === "thinking" ? "Your delegate is thinking…" : "Send →"}</Button>}
          </>
        )}
      </Card>
    </div>
  );
}
