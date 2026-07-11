// Round view — three columns (stack on mobile):
//   LEFT   Your business: role-specific dashboard, aging crates, goal progress
//   CENTER The town (animated cascade) + timer + event banner + move panel
//   RIGHT  Chat (Delegate / Town Crier / Messages) + YOUR RIPPLES card
import { useEffect, useRef, useState } from "react";
import { P, BORDER, pixFont, bodyFont, Panel, PixLabel, Stat, Bar, Tag, Banner, Wordmark, GOAL_LABEL, ROLE_META, Btn } from "./pixel.js";
import Town from "./Town.jsx";
import ChatPanel from "./ChatPanel.jsx";

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
  const total = (state.roundSeconds ?? 35) * 1000;
  const remain = Math.max(0, state.roundStartedAt + total - now);
  return { left: Math.ceil(remain / 1000), frac: remain / total };
}

function RoleDash({ self, state }) {
  const meta = ROLE_META[self.role];
  const batches = [...(self.inventory ?? [])].sort((a, b) => b.age - a.age);
  const stock = batches.reduce((s, b) => s + b.units, 0);
  const suppliers = (state.players ?? []).filter((p) => (self.role === "wholesaler" ? p.role === "farmer" : p.role === "wholesaler"));
  const cheapestSupply = suppliers.length ? Math.min(...suppliers.map((p) => p.price)) : null;
  return (
    <Panel bg={meta.tint}>
      <PixLabel size={11} style={{ marginBottom: 8 }}>{meta.emoji} {meta.label.toUpperCase()} {self.id}</PixLabel>
      <Stat label="Cash" value={`$${self.cash}`} color={self.cash < 40 ? P.red : P.ink} />
      <Stat label="Last round" value={`${self.profitRound >= 0 ? "+" : ""}$${self.profitRound}`} color={self.profitRound >= 0 ? P.green : P.red} hint="profit" />
      <Stat label="Total profit" value={`${self.profitCumulative >= 0 ? "+" : ""}$${self.profitCumulative}`} />
      {self.role === "farmer" && <Stat label="Grow cost" value={`$${self.unitCost}/crate`} color={self.unitCost > 2 ? P.sky : P.ink} hint={self.unitCost > 2 ? "doubled by frost ❄️" : null} />}
      {self.role !== "farmer" && cheapestSupply != null && <Stat label="Cheapest supplier" value={`$${cheapestSupply}`} hint={self.role === "wholesaler" ? "farm ask" : "depot ask"} />}
      {self.role === "restaurant" && <Stat label="Meals served" value={self.mealsServed} hint="1 crate = 4 meals" />}
      {(state.salesTax ?? 0) > 0 && (self.role === "grocer" || self.role === "restaurant") && <Stat label="Retail tax" value={`$${state.salesTax}/sale`} color={P.red} hint="you remit 📜" />}
      <Stat label="Stock" value={`${Math.round(stock * 10) / 10}`} hint="crates (spoil after 3r)" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {batches.map((b, i) => (
          <div key={i} style={{ border: BORDER, background: P.white, padding: "3px 5px", fontFamily: bodyFont, fontSize: 14 }}>
            <span style={{ fontSize: 16 }}>{crateEmoji(b.age)}</span> ×{Math.round(b.units * 10) / 10}
            <span style={{ display: "block", fontFamily: pixFont, fontSize: 7, color: b.age >= 2 ? P.red : P.ink }}>spoil {Math.max(0, 3 - b.age)}r</span>
          </div>
        ))}
        {batches.length === 0 && <span style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.6 }}>shelves empty…</span>}
      </div>
      {self.shortfall > 0 && <div style={{ fontFamily: bodyFont, fontSize: 15, color: P.red }}>📦 {self.shortfall} ordered crates never arrived (suppliers ran dry)</div>}
      <div style={{ borderTop: BORDER, paddingTop: 8, marginTop: 4 }}>
        <PixLabel size={9}>🎯 GOAL</PixLabel>
        <div style={{ fontFamily: pixFont, fontSize: 10, margin: "6px 0 8px", lineHeight: 1.6 }}>{GOAL_LABEL[self.goal] ?? self.goal}</div>
        <Bar frac={self.goalProgress ?? 0} color={P.green} />
        <div style={{ fontFamily: bodyFont, fontSize: 14, marginTop: 3 }}>{Math.round((self.goalProgress ?? 0) * 100)}% there (motivation — not your grade)</div>
      </div>
    </Panel>
  );
}

/** The move panel: price + qty with a live ecosystem preview (server-run engine). */
function MovePanel({ state, self, pending, setPending, confirmed, setConfirmed }) {
  const tier = (state.scenario?.tiers ?? []).find((t) => t.role === self.role) ?? { priceBounds: { min: 1, max: 25 }, qtyBounds: { min: 0, max: 40 } };
  const meta = ROLE_META[self.role];
  const [proj, setProj] = useState(null);
  const debounce = useRef(null);
  const act = pending ?? { price: self.price, qty: self.lastAction?.qty ?? self.qty };

  useEffect(() => {
    if (!pending || confirmed) { setProj(null); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch("/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: self.id, action: pending }) });
        setProj(await r.json());
      } catch { setProj(null); }
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [pending?.price, pending?.qty, confirmed]);

  async function confirm() {
    try {
      await fetch("/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: self.id, action: { price: act.price, qty: act.qty }, intent: pending?.intent ?? `price $${act.price}, ${meta.qtyWord} ${act.qty}` }) });
      setConfirmed(true);
    } catch { /* poll reconciles */ }
  }

  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const deltas = Object.entries(proj?.deltas ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);

  return (
    <Panel>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <PixLabel size={8}>{self.role === "restaurant" ? "MEAL PRICE" : "YOUR PRICE"} (${tier.priceBounds.min}–{tier.priceBounds.max})</PixLabel>
          <input type="number" step="0.5" min={tier.priceBounds.min} max={tier.priceBounds.max} value={act.price}
            onChange={(e) => { setConfirmed(false); setPending({ ...act, price: num(e.target.value, tier.priceBounds.min, tier.priceBounds.max) }); }}
            style={{ width: 90, padding: 8, fontSize: 20, marginTop: 4 }} disabled={state.phase !== "collecting"} />
        </div>
        <div>
          <PixLabel size={8}>{meta.qtyWord.toUpperCase()} (0–{tier.qtyBounds.max})</PixLabel>
          <input type="number" min={0} max={tier.qtyBounds.max} value={act.qty}
            onChange={(e) => { setConfirmed(false); setPending({ ...act, qty: num(e.target.value, 0, tier.qtyBounds.max) }); }}
            style={{ width: 80, padding: 8, fontSize: 20, marginTop: 4 }} disabled={state.phase !== "collecting"} />
        </div>
        <Btn tone={confirmed ? "green" : "lemon"} size={11} onClick={confirm} disabled={state.phase !== "collecting" || confirmed} style={{ flex: 1, minWidth: 130 }}>
          {confirmed ? "✓ LOCKED IN" : "▶ LOCK IT IN"}
        </Btn>
      </div>
      {proj && !confirmed && (
        <div className="fade-in" style={{ borderTop: `2px dotted ${P.ink}44`, marginTop: 10, paddingTop: 8 }}>
          <PixLabel size={8} style={{ marginBottom: 5 }}>🔮 IF EVERYONE ELSE HOLDS…</PixLabel>
          <div style={{ fontFamily: bodyFont, fontSize: 16, lineHeight: 1.5 }}>
            You'd {self.role === "restaurant" ? `serve ${proj.you.mealsRound} meals` : `sell ${proj.you.sold} crates`}
            {" → "}<b style={{ color: proj.you.profitRound >= 0 ? P.green : P.red }}>{proj.you.profitRound >= 0 ? "+" : ""}${proj.you.profitRound}</b>
            {" "}(vs {proj.baselineProfit >= 0 ? "+" : ""}${proj.baselineProfit} holding)
            {proj.you.shortfall > 0 && <span style={{ color: P.red }}> · {proj.you.shortfall} crates won't arrive</span>}
          </div>
          {deltas.length > 0 && (
            <div style={{ fontFamily: bodyFont, fontSize: 15, marginTop: 3 }}>
              🦋 ripples: {deltas.map(([id, d]) => <span key={id} style={{ marginRight: 8, color: d >= 0 ? P.green : P.red }}>{id} {d >= 0 ? "+" : ""}${d}</span>)}
              {proj.town.pricedOutDelta !== 0 && <span style={{ color: proj.town.pricedOutDelta > 0 ? P.red : P.green }}> · {Math.abs(proj.town.pricedOutDelta)} folk {proj.town.pricedOutDelta > 0 ? "priced out" : "priced back in"}</span>}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Your Ripples — the counterfactual attribution of your LAST move. */
function RippleCard({ state }) {
  const r = state.ripple;
  if (!r) return null;
  if (!r.moved) {
    return (
      <Panel bg={P.paper}>
        <PixLabel size={9}>🦋 YOUR RIPPLES</PixLabel>
        <div style={{ fontFamily: bodyFont, fontSize: 16, marginTop: 6 }}>You held steady last round — the town moved without you.</div>
      </Panel>
    );
  }
  const deltas = Object.entries(r.deltas).filter(([id, d]) => id !== state.you && Math.abs(d) >= 0.5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
  return (
    <Panel bg={P.lemonSoft}>
      <PixLabel size={9}>🦋 YOUR RIPPLES (last round)</PixLabel>
      <div style={{ fontFamily: bodyFont, fontSize: 16, margin: "6px 0" }}>
        Compared to a town where you held steady, your move changed town welfare by{" "}
        <b style={{ color: r.welfareDelta >= 0 ? P.green : P.red }}>{r.welfareDelta >= 0 ? "+" : ""}${r.welfareDelta}</b>
        {" "}and touched <b>{r.reach}</b> other {r.reach === 1 ? "business" : "businesses"}.
      </div>
      {deltas.map(([id, d]) => (
        <div key={id} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 16 }}>
          <span>{id}</span><b style={{ color: d >= 0 ? P.green : P.red }}>{d >= 0 ? "+" : ""}${d}</b>
        </div>
      ))}
      {r.pricedOutDelta !== 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 15, marginTop: 4, color: r.pricedOutDelta > 0 ? P.red : P.green }}>
          {Math.abs(r.pricedOutDelta)} townsfolk {r.pricedOutDelta > 0 ? "priced out 😤" : "priced back in 🙂"}
        </div>
      )}
    </Panel>
  );
}

export default function Game({ state, studentId, onReplayRound }) {
  const self = state.players.find((p) => p.id === studentId) ?? state.players[0];
  const { left, frac } = useCountdown(state);
  const wide = useWidth() >= 960;
  const [dismissed, setDismissed] = useState(null);
  const [pending, setPending] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setPending(null); setConfirmed(false); }, [state.round]);

  const banner = state.banner;
  const showBanner = banner && banner.round >= state.round - 1 && dismissed !== banner.id;
  const bannerBg = banner?.id === "frost" ? P.sky : banner?.id === "tax" ? P.lemon : banner?.id === "shady_supplier" ? P.redSoft : P.green;

  const timer = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontFamily: pixFont, fontSize: 11 }}>ROUND {state.round}/{state.totalRounds ?? 12}</span>
        <span style={{ fontFamily: pixFont, fontSize: 9 }}>{confirmed ? "✓ move locked" : "…deciding"}</span>
        <span style={{ fontFamily: pixFont, fontSize: 12, color: left <= 8 ? P.red : P.ink }}>⏳ {left != null ? `${left}s` : "—"}</span>
      </div>
      <Bar frac={left != null ? frac : 1} color={left <= 8 ? P.red : P.lemon} height={16} />
    </div>
  );

  const centerCol = (
    <div>
      {timer}
      {showBanner && <Banner emoji={banner.emoji} title={banner.title} sub={state.market?.news} bg={bannerBg} onClose={() => setDismissed(banner.id)} />}
      <Town state={state} studentId={studentId} />
      <MovePanel state={state} self={self} pending={pending} setPending={setPending} confirmed={confirmed} setConfirmed={setConfirmed} />
    </div>
  );
  const rightCol = (
    <div>
      <ChatPanel state={state} studentId={studentId} onReplayRound={onReplayRound} onPropose={(a) => { setConfirmed(false); setPending(a); }} />
      <div style={{ marginTop: 14 }}><RippleCard state={state} /></div>
    </div>
  );
  const leftCol = <RoleDash self={self} state={state} />;

  return (
    <div>
      <Wordmark sub={`${ROLE_META[self.role]?.emoji ?? ""} ${self.name}`} />
      {wide ? (
        <div style={{ display: "grid", gridTemplateColumns: "290px 1fr 330px", gap: 14, alignItems: "start" }}>
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
