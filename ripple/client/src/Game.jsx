// Round view — designed for NON-TECHNICAL students. One clear job per moment:
//   1. a status bar always says WHAT TO DO NOW ("set your price", "locked in…")
//   2. the MOVE PANEL is the hero: big +/- steppers, plain words, one big button
//   3. pending offers (shady supplier, cartel) surface as a big card up front,
//      never buried in a tab
//   4. everything else (stats, ripples, chat) is trimmed to what a student can
//      absorb in five seconds; the professor keeps the dense views.
import { useEffect, useRef, useState } from "react";
import { P, BORDER, pixFont, bodyFont, Panel, PixLabel, Bar, Banner, Wordmark, GOAL_LABEL, ROLE_META, Btn } from "./pixel.js";
import Town from "./Town.jsx";
import ChatPanel from "./ChatPanel.jsx";

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

// Plain-language labels per role — no jargon.
const MOVE_WORDS = {
  farmer: { price: "Price per crate", qty: "Crates to grow", hint: (s) => `Growing costs $${s.unitCost} per crate.` },
  wholesaler: { price: "Your resale price", qty: "Crates to buy from farms", hint: () => null },
  grocer: { price: "Your shelf price", qty: "Crates to order", hint: () => null },
  restaurant: { price: "Price of one meal", qty: "Crates to order", hint: () => "1 crate = 4 meals." },
};

/** Big-button number stepper (phone-friendly; no typing needed). */
function Stepper({ label, value, onChange, min, max, step = 1, prefix = "" }) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 100) / 100));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 100) / 100));
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontFamily: pixFont, fontSize: 8, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <button onClick={dec} style={{ fontFamily: pixFont, fontSize: 16, width: 46, background: P.white }}>−</button>
        <div style={{ flex: 1, border: BORDER, background: P.white, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: pixFont, fontSize: 15, minHeight: 44 }}>
          {prefix}{value}
        </div>
        <button onClick={inc} style={{ fontFamily: pixFont, fontSize: 16, width: 46, background: P.white }}>+</button>
      </div>
    </div>
  );
}

/** Pending offers (shady supplier / cartel) — a big decision card, front and center. */
function OfferCard({ state, studentId }) {
  const [answered, setAnswered] = useState({});
  const offers = (state.offers ?? []).filter((o) => !answered[o.offerId]);
  if (!offers.length) return null;
  const o = offers[0];
  async function respond(accept) {
    setAnswered((a) => ({ ...a, [o.offerId]: true }));
    try {
      await fetch("/offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, offerId: o.offerId, accept }) });
    } catch { /* poll reconciles */ }
  }
  return (
    <Panel bg={P.lemonSoft} className="pop" style={{ borderWidth: 4 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 30 }}>{o.emoji}</span>
        <PixLabel size={11}>{o.title}</PixLabel>
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 18, marginBottom: 10 }}>{o.body}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn tone="green" size={11} onClick={() => respond(true)} style={{ flex: 1, padding: "14px 8px" }}>
          {o.type === "cartel_offer" ? "🤝 Join them" : "🛒 Buy the crates"}
        </Btn>
        <Btn tone="red" size={11} onClick={() => respond(false)} style={{ flex: 1, padding: "14px 8px" }}>❌ No thanks</Btn>
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 14, opacity: 0.7, marginTop: 6 }}>This choice counts toward your grade — decide like an economist.</div>
    </Panel>
  );
}

/** THE hero: set two numbers, press one button. Lives inside the tabbed card. */
function MovePanel({ state, self, pending, setPending, confirmed, setConfirmed }) {
  const tier = (state.scenario?.tiers ?? []).find((t) => t.role === self.role) ?? { priceBounds: { min: 1, max: 25 }, qtyBounds: { min: 0, max: 40 } };
  const words = MOVE_WORDS[self.role] ?? MOVE_WORDS.farmer;
  const [proj, setProj] = useState(null);
  const debounce = useRef(null);
  const act = pending ?? { price: self.price, qty: self.lastAction?.qty ?? self.qty };

  // context the student actually needs, in one line
  const rivals = state.players.filter((p) => p.role === self.role && p.id !== self.id);
  const cheapestRival = rivals.length ? Math.min(...rivals.map((p) => p.price)) : null;
  const suppliers = state.players.filter((p) => (self.role === "wholesaler" ? p.role === "farmer" : p.role === "wholesaler"));
  const cheapestSupply = self.role !== "farmer" && suppliers.length ? Math.min(...suppliers.map((p) => p.price)) : null;

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
      await fetch("/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: self.id, action: { price: act.price, qty: act.qty }, intent: pending?.intent ?? `price $${act.price}, qty ${act.qty}` }) });
      setConfirmed(true);
    } catch { /* poll reconciles */ }
  }

  const set = (patch) => { setConfirmed(false); setPending({ ...act, ...patch }); };
  const hint = words.hint(self);

  return (
    <div style={{ background: confirmed ? P.greenSoft : P.white, padding: 14 }}>
      <PixLabel size={10} style={{ marginBottom: 10 }}>👉 YOUR MOVE THIS ROUND</PixLabel>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <Stepper label={words.price} value={act.price} min={tier.priceBounds.min} max={tier.priceBounds.max} step={0.5} prefix="$" onChange={(v) => set({ price: v })} />
        <Stepper label={words.qty} value={act.qty} min={0} max={tier.qtyBounds.max} step={1} onChange={(v) => set({ qty: v })} />
      </div>
      {/* one line of context, not a dashboard */}
      <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.85, marginBottom: 10 }}>
        {cheapestRival != null && <>Cheapest competitor: <b>${cheapestRival}</b>. </>}
        {cheapestSupply != null && <>You buy from suppliers at <b>${cheapestSupply}</b>. </>}
        {hint}
      </div>
      {proj && !confirmed && (
        <div className="fade-in" style={{ fontFamily: bodyFont, fontSize: 17, marginBottom: 10, background: P.paper, border: `2px dashed ${P.ink}55`, padding: "6px 8px" }}>
          🔮 With this move you'd make about{" "}
          <b style={{ color: proj.you.profitRound >= 0 ? P.green : P.red }}>{proj.you.profitRound >= 0 ? "+" : ""}${proj.you.profitRound}</b> this round
          {proj.you.shortfall > 0 && <span style={{ color: P.red }}> · ⚠️ suppliers can only deliver part of that order</span>}
        </div>
      )}
      <Btn tone={confirmed ? "green" : "lemon"} size={13} onClick={confirm} disabled={state.phase !== "collecting" || !state.started || confirmed} style={{ width: "100%", padding: "16px 10px" }}>
        {!state.started ? "⏸ WAITING FOR THE PROFESSOR" : confirmed ? "✓ DONE — WATCH THE TOWN" : "✅ CONFIRM MY MOVE"}
      </Btn>
      {!confirmed && <div style={{ fontFamily: bodyFont, fontSize: 14, opacity: 0.65, marginTop: 6, textAlign: "center" }}>If time runs out, you repeat last round's move.</div>}
    </div>
  );
}

/** Four numbers a student can absorb in five seconds. */
function MiniStats({ self }) {
  const stock = (self.inventory ?? []).reduce((s, b) => s + b.units, 0);
  const spoilingSoon = (self.inventory ?? []).filter((b) => b.age >= 2).reduce((s, b) => s + b.units, 0);
  const tile = (emoji, label, value, color) => (
    <div style={{ border: BORDER, background: P.white, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 16 }}>{emoji}</div>
      <div style={{ fontFamily: pixFont, fontSize: 11, color: color ?? P.ink, margin: "3px 0" }}>{value}</div>
      <div style={{ fontFamily: pixFont, fontSize: 6, opacity: 0.7 }}>{label}</div>
    </div>
  );
  return (
    <Panel bg={ROLE_META[self.role]?.tint ?? P.white}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {tile("💰", "CASH", `$${self.cash}`, self.cash < 40 ? P.red : P.ink)}
        {tile("📦", "STOCK", Math.round(stock * 10) / 10)}
        {tile("📈", "LAST ROUND", `${self.profitRound >= 0 ? "+" : ""}$${self.profitRound}`, self.profitRound >= 0 ? P.green : P.red)}
        {tile("🏆", "TOTAL PROFIT", `${self.profitCumulative >= 0 ? "+" : ""}$${self.profitCumulative}`, self.profitCumulative >= 0 ? P.green : P.red)}
      </div>
      {spoilingSoon > 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 15, color: P.red, marginTop: 8 }}>⚠️ {Math.round(spoilingSoon)} of your crates spoil soon — sell them!</div>
      )}
      <div style={{ borderTop: `2px dotted ${P.ink}44`, marginTop: 10, paddingTop: 8 }}>
        <div style={{ fontFamily: pixFont, fontSize: 8, marginBottom: 5 }}>🎯 {GOAL_LABEL[self.goal] ?? self.goal}</div>
        <Bar frac={self.goalProgress ?? 0} color={P.green} height={12} />
      </div>
    </Panel>
  );
}

const nameOf = (state, id) => state.players.find((p) => p.id === id)?.name ?? id;

/** Plain-words recap: who moved last round, and which businesses felt it. */
function RoundSummary({ state }) {
  const lr = state.lastResolution;
  if (!lr) return null;
  const lines = (lr.summary ?? []).slice(0, 5);
  return (
    <Panel bg={P.paper}>
      <PixLabel size={9} style={{ marginBottom: 6 }}>📜 ROUND {lr.round} — WHAT JUST HAPPENED</PixLabel>
      {lines.length === 0 && <div style={{ fontFamily: bodyFont, fontSize: 16, opacity: 0.7 }}>A quiet round — everyone kept their prices and orders the same.</div>}
      {lines.map((l) => {
        const you = l.id === state.you;
        return (
          <div key={l.id} style={{ padding: "6px 0", borderBottom: `2px dotted ${P.ink}22`, background: you ? P.lemonSoft : "transparent" }}>
            <div style={{ fontFamily: bodyFont, fontSize: 17, fontWeight: you ? 700 : 400 }}>{l.headline}{you ? " ← you" : ""}</div>
            {l.effects.length > 0 && (
              <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.9 }}>→ felt by: {l.effects.join(" · ")}</div>
            )}
            {l.pricedOutDelta > 0 && (
              <div style={{ fontFamily: bodyFont, fontSize: 15, color: P.red }}>→ {l.pricedOutDelta} townsfolk stopped buying because of this</div>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

/** Your butterfly, in one sentence (tap for the numbers). */
function RippleLine({ state }) {
  const [open, setOpen] = useState(false);
  const r = state.ripple;
  if (!r || !r.moved) return null;
  const deltas = Object.entries(r.deltas).filter(([id, d]) => id !== state.you && Math.abs(d) >= 0.5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4);
  return (
    <Panel bg={P.skySoft} style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
      <div style={{ fontFamily: bodyFont, fontSize: 17 }}>
        🦋 Your last move touched <b>{r.reach}</b> other {r.reach === 1 ? "business" : "businesses"}
        {r.pricedOutDelta > 0 && <> and priced out <b>{r.pricedOutDelta}</b> townsfolk</>}. <span style={{ opacity: 0.6, fontSize: 14 }}>{open ? "▲" : "▼ tap"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {deltas.map(([id, d]) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 16 }}>
              <span>{nameOf(state, id)}</span><b style={{ color: d >= 0 ? P.green : P.red }}>{d >= 0 ? "+" : ""}${d}</b>
            </div>
          ))}
          <div style={{ fontFamily: bodyFont, fontSize: 14, opacity: 0.7, marginTop: 4 }}>Compared to a town where you had done nothing.</div>
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

  // The status bar always answers "what should I do right now?"
  const waiting = !state.started && state.phase === "collecting";
  const instruction = waiting
    ? "⏸ You're in! Waiting for the professor to start the game…"
    : state.phase !== "collecting"
      ? "🏁 Game over — your report is coming up"
      : confirmed
        ? "✓ Move locked in. Watch the town react!"
        : "👉 Set your price and amount, then CONFIRM";

  // Sticky header: wordmark + round number + timer stay pinned while scrolling,
  // so students always know when the next round hits. Negative margins bleed
  // over Screen's padding so scrolled content never peeks above it.
  const stickyHeader = (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: P.cream, margin: "-14px -12px 12px", padding: "10px 12px 10px", borderBottom: `4px solid ${P.ink}` }}>
      <Wordmark sub={`${ROLE_META[self.role]?.emoji ?? ""} ${self.name} — ${ROLE_META[self.role]?.label} ${self.id}`} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: pixFont, fontSize: 11 }}>ROUND {Math.min(state.round, state.totalRounds ?? 12)}/{state.totalRounds ?? 12}</span>
        <span style={{ fontFamily: pixFont, fontSize: 12, color: left <= 8 ? P.red : P.ink }}>⏳ {waiting ? "—" : left != null ? `${left}s` : "—"}</span>
      </div>
      <Bar frac={waiting ? 1 : left != null ? frac : 1} color={left <= 8 && !waiting ? P.red : P.lemon} height={14} />
    </div>
  );

  const instructionBar = (
    <div className={waiting ? "bob" : undefined} style={{ fontFamily: pixFont, fontSize: 9, marginBottom: 14, padding: "8px 10px", background: confirmed && !waiting ? P.greenSoft : P.lemonSoft, border: BORDER, lineHeight: 1.7 }}>
      {instruction}
    </div>
  );

  // My move + Helper + Town news share one tabbed card — no deep scrolling.
  const actionCard = (
    <ChatPanel
      state={state}
      studentId={studentId}
      onReplayRound={onReplayRound}
      onPropose={(a) => { setConfirmed(false); setPending(a); }}
      moveDone={confirmed}
      movePanel={<MovePanel state={state} self={self} pending={pending} setPending={setPending} confirmed={confirmed} setConfirmed={setConfirmed} />}
    />
  );

  const moveSide = (
    <div>
      <OfferCard state={state} studentId={studentId} />
      {actionCard}
      <MiniStats self={self} />
      <RippleLine state={state} />
    </div>
  );

  const townSide = (
    <div>
      {showBanner && <Banner emoji={banner.emoji} title={banner.title} sub={state.market?.news} bg={bannerBg} onClose={() => setDismissed(banner.id)} />}
      <Town state={state} studentId={studentId} />
      <RoundSummary state={state} />
    </div>
  );

  return (
    <div>
      {stickyHeader}
      {instructionBar}
      {wide ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "start" }}>
          <div>{townSide}</div>
          <div style={{ position: "sticky", top: 132 }}>{moveSide}</div>
        </div>
      ) : (
        <div>
          <OfferCard state={state} studentId={studentId} />
          {actionCard}
          {townSide}
          <MiniStats self={self} />
          <RippleLine state={state} />
        </div>
      )}
    </div>
  );
}
