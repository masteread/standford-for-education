// Round view — three columns (stack on mobile):
//   LEFT  Your stand: cash, aging crates 🍋→🟠→🟤, unit cost, GOAL + progress
//   CENTER Town square (walking townsfolk) + round timer + event banner
//   RIGHT  Chat panel (Delegate / Town Crier / Messages)
import { useEffect, useState } from "react";
import { P, BORDER, SHADOW, pixFont, bodyFont, Panel, PixLabel, Stat, Bar, Tag, Banner, Wordmark, GOAL_LABEL } from "./pixel.js";
import Town from "./Town.jsx";
import ChatPanel from "./ChatPanel.jsx";
import MarketPreview from "./MarketPreview.jsx";

const SPOIL_AFTER = 3;
const crateEmoji = (age) => (age >= 3 ? "🟤" : age === 2 ? "🟠" : "🍋");

function useWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

function useCountdown(state) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);
  if (!state?.roundStartedAt) return { left: null, frac: 1 };
  const total = (state.roundSeconds ?? 20) * 1000;
  const remain = Math.max(0, state.roundStartedAt + total - now);
  return { left: Math.ceil(remain / 1000), frac: remain / total };
}

function YourStand({ self }) {
  const batches = [...(self.inventory ?? [])].sort((a, b) => b.age - a.age);
  const total = batches.reduce((s, b) => s + b.crates, 0);
  return (
    <Panel bg={P.lemonSoft}>
      <PixLabel size={11} style={{ marginBottom: 8 }}>🍋 YOUR STAND</PixLabel>
      <Stat label="Cash" value={`$${self.cash}`} color={self.cash < 80 ? P.red : P.ink} />
      <Stat label="Unit cost" value={`$${self.unitCost}`} color={self.unitCost > 2 ? P.sky : P.ink} hint={self.unitCost > 2 ? "doubled by frost" : null} />
      <Stat label="Inventory" value={`${total}`} hint="crates" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {batches.map((b, i) => (
          <div key={i} style={{ border: BORDER, background: P.white, padding: "3px 5px", fontFamily: bodyFont, fontSize: 15 }}>
            <span style={{ fontSize: 18 }}>{crateEmoji(b.age)}</span> ×{b.crates}
            <span style={{ display: "block", fontFamily: pixFont, fontSize: 7, color: b.age >= 2 ? P.red : P.ink }}>
              spoil {Math.max(0, SPOIL_AFTER - b.age)}r
            </span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: BORDER, paddingTop: 8, marginTop: 4 }}>
        <PixLabel size={9} color={P.ink}>🎯 GOAL</PixLabel>
        <div style={{ fontFamily: pixFont, fontSize: 11, margin: "6px 0 8px", lineHeight: 1.6 }}>{GOAL_LABEL[self.goal] ?? self.goal}</div>
        <Bar frac={self.goalProgress ?? 0} color={P.green} />
        <div style={{ fontFamily: bodyFont, fontSize: 15, marginTop: 3 }}>{Math.round((self.goalProgress ?? 0) * 100)}% there (motivation — not your grade)</div>
      </div>
    </Panel>
  );
}

export default function Game({ state, studentId, onReplayRound }) {
  const self = state.growers.find((g) => g.id === studentId) ?? state.growers[0];
  const rival = state.growers.find((g) => g.id !== studentId);
  const { left, frac } = useCountdown(state);
  const wide = useWidth() >= 900;
  const [dismissed, setDismissed] = useState(null);
  const [pending, setPending] = useState(null); // {price, produce, intent} — the move being explored
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setPending(null); setConfirmed(false); }, [state.round]);
  const previewActive = state.phase === "collecting" && !!pending && !confirmed;

  const banner = state.banner;
  const showBanner = banner && banner.round >= state.round - 1 && dismissed !== banner.id;
  const bannerBg = banner?.id === "frost" ? P.sky : banner?.id === "tax" ? P.lemon : banner?.id === "shady_supplier" ? P.redSoft : P.green;

  const timer = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontFamily: pixFont, fontSize: 11 }}>ROUND {state.round}/{state.totalRounds ?? 12}</span>
        <span style={{ fontFamily: pixFont, fontSize: 12, color: left <= 5 ? P.red : P.ink }}>⏳ {left != null ? `${left}s` : "—"}</span>
      </div>
      <Bar frac={left != null ? frac : 1} color={left <= 5 ? P.red : P.lemon} height={16} />
    </div>
  );

  const centerCol = (
    <div>
      {timer}
      {showBanner && <Banner emoji={banner.emoji} title={banner.title} sub={state.market.news} bg={bannerBg} onClose={() => setDismissed(banner.id)} />}
      <Town state={state} studentId={studentId} pending={pending} previewActive={previewActive} />
      <MarketPreview self={self} rival={rival} state={state} pending={pending} setPending={setPending} confirmed={confirmed} onConfirmed={() => setConfirmed(true)} />
    </div>
  );
  const rightCol = <ChatPanel state={state} studentId={studentId} onReplayRound={onReplayRound} onPropose={setPending} />;
  const leftCol = <YourStand self={self} />;

  return (
    <div>
      <Wordmark sub={self.name} />
      {wide ? (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 340px", gap: 14, alignItems: "start" }}>
          <div>{leftCol}</div>
          <div>{centerCol}</div>
          <div style={{ position: "sticky", top: 14 }}>{rightCol}</div>
        </div>
      ) : (
        <div>
          {centerCol}
          {leftCol}
          {rightCol}
        </div>
      )}
    </div>
  );
}
