// A4 — Round view. Three panels in decision order: Goal → Market → You → Action.
// One decision per screen. Mobile-first single column. (PRD-personA.md §4.1)
import { useEffect, useMemo, useState } from "react";
import { S, C, F } from "./ui.js";

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
  if (!state?.roundStartedAt) return null;
  const left = Math.max(0, Math.ceil((state.roundStartedAt + state.roundSeconds * 1000 - now) / 1000));
  return left;
}

function Stat({ label, value, color }) {
  return (
    <div style={S.row}>
      <span style={F.label}>{label}</span>
      <span style={{ ...F.data, fontSize: 22, color: color ?? C.ink }}>{value}</span>
    </div>
  );
}

export default function Game({ state, studentId }) {
  const self = state.growers.find((g) => g.id === studentId) ?? state.growers[0];
  const rival = state.growers.find((g) => g.id !== studentId);
  const secondsLeft = useCountdown(state);

  // command flow
  const [text, setText] = useState("");
  const [step, setStep] = useState("idle"); // idle | thinking | clarify | proposed | confirmed
  const [proposed, setProposed] = useState(null);
  const [question, setQuestion] = useState(null);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState(null);

  // Reset the command box whenever a new round opens.
  useEffect(() => {
    setText(""); setStep("idle"); setProposed(null); setQuestion(null); setWhy(""); setErr(null);
  }, [state.round]);

  const bigMove = proposed && Math.abs(Number(proposed.price) - self.price) > 1;

  async function send() {
    if (!text.trim()) return;
    setStep("thinking"); setErr(null);
    try {
      const res = await fetch("/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, text: text.trim() }),
      });
      const data = await res.json();
      if (data.clarifyingQuestion) { setQuestion(data.clarifyingQuestion); setStep("clarify"); }
      else if (data.action) { setProposed(data.action); setStep("proposed"); }
      else { setErr("The delegate could not read that — try rephrasing."); setStep("idle"); }
    } catch {
      setErr("Network hiccup — try again."); setStep("idle");
    }
  }

  async function confirm() {
    if (bigMove && !why.trim()) return;
    const intent = why.trim() ? `${text.trim()} — why: ${why.trim()}` : text.trim();
    try {
      await fetch("/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, action: proposed, intent }),
      });
      setStep("confirmed");
    } catch {
      setErr("Could not lock in — try again.");
    }
  }

  const spoiling = (self.inventory ?? []).filter((b) => SPOIL_AFTER - b.age <= 2);
  const totalCrates = (self.inventory ?? []).reduce((s, b) => s + b.crates, 0);

  return (
    <div>
      {/* header */}
      <div style={{ ...S.row, marginBottom: 12 }}>
        <span style={{ ...F.label, fontSize: 13 }}>Round {state.round} / 12</span>
        {secondsLeft != null && (
          <span style={{ ...F.data, fontSize: 18, color: secondsLeft <= 5 ? C.red : C.sub }}>⏱ {secondsLeft}s</span>
        )}
      </div>

      {/* 1. GOAL — why you're here (motivates, never graded) */}
      <div style={{ ...S.card, borderColor: C.green }}>
        <span style={F.label}>🎯 Your goal</span>
        <div style={{ ...F.data, fontSize: 20, color: C.green, marginTop: 4 }}>{GOAL_LABEL[self.goal] ?? self.goal}</div>
      </div>

      {/* 2. MARKET — the context to decide in */}
      <div style={S.card}>
        <span style={F.label}>Market</span>
        <Stat label="Rival price" value={rival ? `$${rival.price}` : "—"} />
        <Stat label="Total demand last round" value={state.market.totalDemand ?? "—"} />
        <Stat label="Average price" value={state.market.avgPrice != null ? `$${state.market.avgPrice}` : "—"} />
        {state.market.news && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: C.amberBg, border: `2px solid ${C.amber}`, color: C.amber, fontWeight: 800, fontSize: 17, textAlign: "center" }}>
            ⚠ {state.market.news}
          </div>
        )}
      </div>

      {/* 3. YOU — what you have to work with */}
      <div style={S.card}>
        <span style={F.label}>You — {self.name}</span>
        <Stat label="Cash" value={`$${self.cash}`} color={self.cash < 80 ? C.red : C.ink} />
        <Stat label="Unit cost" value={`$${self.unitCost}`} color={self.unitCost > 2 ? C.amber : C.ink} />
        <Stat label="Inventory" value={`${totalCrates} crates`} />
        {spoiling.length > 0 && (
          <div style={{ ...F.body, color: C.amber, fontSize: 13, marginTop: 4 }}>
            {spoiling.map((b, i) => (
              <span key={i} style={{ marginRight: 10 }}>
                {b.crates} crates · spoil in {Math.max(0, SPOIL_AFTER - b.age)}r
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 4. ACTION — the one decision */}
      <div style={S.card}>
        <span style={F.label}>What do we do this round?</span>
        {step === "confirmed" ? (
          <div style={{ ...F.body, color: C.green, fontWeight: 700, padding: "8px 0" }}>
            ✓ Locked in: price ${proposed.price}, produce {proposed.produce}. Waiting for the round to resolve…
          </div>
        ) : (
          <>
            <textarea
              style={{ ...S.input, minHeight: 64, marginTop: 8, resize: "vertical" }}
              placeholder='e.g. "raise to $7, demand can take it"'
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={step === "thinking"}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              {[
                ["Raise $1", `raise price to $${self.price + 1}`],
                ["Undercut B", rival ? `undercut B to $${(rival.price - 0.5).toFixed(2)}` : "undercut the rival slightly"],
                ["Hold", `hold at $${self.price}`],
                ["Produce +10", "produce 10 more crates"],
              ].map(([label, fill]) => (
                <button key={label} style={S.chip} onClick={() => setText(fill)}>{label}</button>
              ))}
            </div>

            {step === "clarify" && (
              <div style={{ padding: 12, background: C.accentBg, border: `1px solid ${C.accentLine}`, borderRadius: 10, marginBottom: 10 }}>
                <b>Your delegate asks:</b> {question}
                <div style={{ ...F.label, marginTop: 4 }}>Answer in the box above, then send again.</div>
              </div>
            )}

            {step === "proposed" && proposed && (
              <div style={{ padding: 12, background: "#f4fbf6", border: `1px solid ${C.green}`, borderRadius: 10, marginBottom: 10 }}>
                <b>Proposed:</b> price <b>${proposed.price}</b> · produce <b>{proposed.produce}</b>
                {bigMove && (
                  <input
                    style={{ ...S.input, marginTop: 8 }}
                    placeholder="Big move — one line: why?"
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                  />
                )}
              </div>
            )}

            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}

            {step === "proposed" ? (
              <button style={{ ...S.primary, opacity: bigMove && !why.trim() ? 0.5 : 1 }} onClick={confirm}>
                Confirm →
              </button>
            ) : (
              <button style={S.primary} onClick={send} disabled={step === "thinking" || !text.trim()}>
                {step === "thinking" ? "Your delegate is thinking…" : "Send →"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
