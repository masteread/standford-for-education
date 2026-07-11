// Interactive "what happens if…" panel. Scrub the price (or accept the delegate's
// proposal) and see the projected effect on the WHOLE ecosystem live — town
// demand, your buyers vs the rival's, sales, and margin after frost/tax — then
// lock the move in. This is the interactive bridge between a decision and its
// consequence; the town crowd mirrors the same numbers as you scrub.
import { useState } from "react";
import { P, BORDER, SHADOW_SM, pixFont, bodyFont, Btn, Bar } from "./pixel.js";
import { project } from "./market-preview.js";

function Delta({ now, was }) {
  if (was == null) return null;
  const d = now - was;
  if (d === 0) return <span style={{ fontFamily: bodyFont, fontSize: 14, opacity: 0.6 }}> (=)</span>;
  return <span style={{ fontFamily: bodyFont, fontSize: 14, color: d > 0 ? P.green : P.red }}> ({d > 0 ? "+" : ""}{d})</span>;
}

export default function MarketPreview({ self, rival, state, pending, setPending, confirmed, onConfirmed }) {
  const [why, setWhy] = useState("");
  const price = pending?.price ?? self.price;
  const produce = pending?.produce ?? (self.produced || 20);
  const inventory = (self.inventory ?? []).reduce((s, b) => s + b.crates, 0);
  const rivalPrice = rival?.price ?? price;

  const proj = project({ myPrice: price, rivalPrice, inventory, produce, unitCost: self.unitCost, salesTax: state.salesTax ?? 0 });
  const bigMove = Math.abs(price - self.price) > 1;
  const set = (patch) => setPending({ price, produce, ...pending, ...patch });

  async function confirm() {
    if (confirmed || (bigMove && !why.trim())) return;
    const intent = (pending?.intent ?? `set price to $${price}, produce ${produce}`) + (why.trim() ? ` — why: ${why.trim()}` : "");
    try {
      await fetch("/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: self.id, action: { price, produce }, intent }) });
      onConfirmed?.();
    } catch { /* poll reconciles */ }
  }

  if (confirmed) {
    return (
      <div style={{ border: BORDER, background: P.greenSoft, boxShadow: SHADOW_SM, padding: 12, marginBottom: 14 }}>
        <div style={{ fontFamily: pixFont, fontSize: 10 }}>✓ Locked in — ${price}, {produce} crates</div>
        <div style={{ fontFamily: bodyFont, fontSize: 16, marginTop: 4 }} className="bob">Watch the town react when the round resolves…</div>
      </div>
    );
  }

  return (
    <div style={{ border: BORDER, background: P.white, boxShadow: SHADOW_SM, padding: 12, marginBottom: 14 }}>
      <div style={{ fontFamily: pixFont, fontSize: 10, marginBottom: 8 }}>🔮 MARKET PREVIEW — drag to explore</div>

      {/* price + produce sliders */}
      <label style={{ fontFamily: pixFont, fontSize: 8 }}>PRICE ${price.toFixed(2)}</label>
      <input type="range" min="1" max="15" step="0.5" value={price} onChange={(e) => set({ price: Number(e.target.value) })} style={{ width: "100%" }} />
      <label style={{ fontFamily: pixFont, fontSize: 8 }}>PRODUCE {produce} crates</label>
      <input type="range" min="0" max="100" step="5" value={produce} onChange={(e) => set({ produce: Number(e.target.value) })} style={{ width: "100%" }} />

      {/* whole-ecosystem readout */}
      <div style={{ background: P.cream, border: `3px solid ${P.ink}`, padding: 8, margin: "8px 0", fontFamily: bodyFont, fontSize: 16, lineHeight: 1.5 }}>
        <div>🏘️ Town demand <b>{proj.D}</b><Delta now={proj.D} was={state.market.totalDemand} /></div>
        <div>🍋 You draw <b>~{proj.myBuyers}</b> buyers<Delta now={proj.myBuyers} was={self.sold} /> · rival <b>~{proj.rivalBuyers}</b></div>
        <div style={{ margin: "4px 0" }}>
          <Bar frac={proj.D ? proj.myBuyers / (proj.myBuyers + proj.rivalBuyers || 1) : 0.5} color={P.lemon} height={12} />
          <span style={{ fontSize: 13, opacity: 0.7 }}>your share of the crowd</span>
        </div>
        <div>💰 Sell <b>{proj.sold}</b>{proj.soldOut ? " (sold out!)" : ""} → revenue <b>${proj.revenue}</b>{proj.tax ? ` (−$${proj.tax} tax)` : ""}</div>
        <div>📈 Margin after ${proj.cost} costs: <b style={{ color: proj.margin >= 0 ? P.green : P.red }}>${proj.margin}</b></div>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>…if {rival ? rival.name : "the rival"} holds ${rivalPrice}</div>
      </div>

      {bigMove && (
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Big move — one line: why?" style={{ width: "100%", padding: 8, fontSize: 16, marginBottom: 8 }} />
      )}
      <Btn tone="green" size={11} onClick={confirm} disabled={bigMove && !why.trim()} style={{ width: "100%" }}>✓ LOCK IN THIS MOVE</Btn>
    </div>
  );
}
