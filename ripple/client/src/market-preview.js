// Client-side projection of the engine's market math, so the town can show the
// LIVE effect of a pending move on the whole ecosystem BEFORE the round resolves.
// Mirrors server/market.js exactly (D = 140 - 10*avg; share shift = clamp(0.2*gap)).
// Assumption surfaced in the UI: "if the rival holds their last price".

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function project({ myPrice, rivalPrice, inventory = 0, produce = 0, unitCost = 2, salesTax = 0 }) {
  const avg = (Number(myPrice) + Number(rivalPrice)) / 2;
  const D = Math.max(0, Math.round(140 - 10 * avg));
  const gap = rivalPrice - myPrice; // >0 → I'm cheaper
  const shift = clamp(0.2 * gap, -0.5, 0.5);
  const myShare = 0.5 + shift;
  const myBuyers = Math.max(0, Math.round(D * myShare));
  const rivalBuyers = Math.max(0, Math.round(D * (1 - myShare)));
  const avail = inventory + Number(produce);
  const sold = Math.min(myBuyers, avail);
  const gross = sold * myPrice;
  const tax = salesTax * sold;
  const cost = Number(produce) * unitCost;
  return {
    D, myShare, myBuyers, rivalBuyers,
    sold, avail, revenue: Math.round(gross - tax), tax: Math.round(tax),
    margin: Math.round(gross - tax - cost), cost: Math.round(cost),
    soldOut: myBuyers > avail,
  };
}
