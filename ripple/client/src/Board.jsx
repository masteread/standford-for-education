// Professor / projection view (experimental). Not a player screen — no join.
// Each grower is shown as an individual business (P&L card), ranked in a live
// leaderboard, with the market header + FROST control + the live cascade trace.
// Landscape-first, high contrast, big type for a projected classroom screen.
// Open at:  http://<host>:3001/?view=board
import { useEffect, useState } from "react";
import Cascade from "./Cascade.jsx";
import { C, T, SHADOW } from "./ui.js";

const GOAL_LABEL = {
  max_profit: "Max profit",
  max_market_share: "Max market share",
  survive_shock_cash_80: "Survive frost · cash > $80",
  zero_spoilage: "Zero spoilage",
};

const crates = (inv) => (inv ?? []).reduce((s, b) => s + b.crates, 0);
const netWorth = (g) => Math.round(g.cash + crates(g.inventory) * g.price);

function Header({ s, onFrost }) {
  const frost = Boolean(s.market?.news);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 16, height: 16, borderRadius: 999, background: C.lemon, boxShadow: `0 0 0 5px ${C.lemonSoft}` }} />
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Ripple</span>
          <span style={{ fontSize: 18, color: C.muted, fontWeight: 600 }}>Lemon Wars · Class view</span>
        </div>
        <button
          onClick={onFrost}
          style={{ padding: "12px 20px", borderRadius: 12, fontSize: 16, fontWeight: 800, background: frost ? C.frostSoft : C.frost, color: frost ? C.frost : "#fff", border: `2px solid ${C.frost}` }}
        >
          ❄ {frost ? "Frost active" : "Inject frost"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 28, marginTop: 14, flexWrap: "wrap" }}>
        {[
          ["Round", `${s.round} / 12`],
          ["Phase", s.phase],
          ["Total demand", s.market?.totalDemand ?? "—"],
          ["Avg price", s.market?.avgPrice != null ? `$${s.market.avgPrice}` : "—"],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ ...T.label }}>{l}</div>
            <div className="tnum" style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>{v}</div>
          </div>
        ))}
      </div>

      {frost && (
        <div className="frost-shimmer fade-in" style={{ marginTop: 14, background: C.frost, color: "#fff", borderRadius: 14, padding: "14px 18px", fontWeight: 800, fontSize: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 26 }}>❄</span> {s.market.news}
        </div>
      )}
    </div>
  );
}

function Leaderboard({ growers, skill }) {
  const ranked = [...growers].sort((a, b) => netWorth(b) - netWorth(a));
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 20, boxShadow: SHADOW }}>
      <div style={{ ...T.label }}>Leaderboard · net worth</div>
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12 }}>cash + inventory value — business standing, not the grade</div>
      {ranked.map((g, i) => (
        <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
          <span style={{ width: 30, fontSize: 22, fontWeight: 800, color: i === 0 ? C.lemon : C.faint }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 20, fontWeight: 700 }}>{g.name}</span>
          <span className="tnum" style={{ fontSize: 24, fontWeight: 800, color: i === 0 ? C.green : C.ink }}>${netWorth(g)}</span>
        </div>
      ))}
      {skill && skill.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `2px solid ${C.line}` }}>
          <div style={{ ...T.label }}>Decision quality (graded)</div>
          {skill.slice(0, 6).map((r, i) => (
            <div key={r.studentId ?? i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 15 }}>
              <span>{r.name ?? r.studentId}</span>
              <span className="tnum" style={{ fontWeight: 700 }}>{r.decisionQuality ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BusinessCard({ g }) {
  const inv = crates(g.inventory);
  const spoiling = (g.inventory ?? []).filter((b) => 3 - b.age <= 2 && b.crates > 0);
  const spoilSoon = spoiling.reduce((s, b) => s + b.crates, 0);
  const pct = Math.round((g.goalProgress ?? 0) * 100);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderTop: `4px solid ${C.lemon}`, borderRadius: 16, padding: 18, boxShadow: SHADOW }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{g.name}</span>
        <span className="tnum" style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>${g.price}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        {[
          ["Cash", `$${g.cash}`, g.cash < 80 ? C.red : C.green],
          ["Unit cost", `$${g.unitCost}`, g.unitCost > 2 ? C.frost : C.ink],
          ["Inventory", `${inv}`, C.ink],
          ["Sold last", `${g.sold}`, C.ink],
        ].map(([l, v, col]) => (
          <div key={l}>
            <div style={{ ...T.label, letterSpacing: 0.4 }}>{l}</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 800, color: col }}>{v}</div>
          </div>
        ))}
      </div>
      {spoilSoon > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: C.red, background: C.redSoft, padding: "5px 10px", borderRadius: 999, display: "inline-block" }}>
          {spoilSoon} crates spoiling soon
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", ...T.label }}>
          <span>Goal · {GOAL_LABEL[g.goal] ?? g.goal}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: C.line, marginTop: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.lemon, borderRadius: 999, transition: "width .4s ease" }} />
        </div>
      </div>
    </div>
  );
}

export default function Board() {
  const [s, setS] = useState(null);
  const [skill, setSkill] = useState([]);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch("/state/admin");
        const data = await r.json();
        if (!stop) setS(data);
      } catch { /* keep last */ }
    };
    poll();
    const iv = setInterval(poll, 1500);
    return () => { stop = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch("/admin/leaderboard");
        const data = await r.json();
        if (!stop && Array.isArray(data)) setSkill(data);
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(iv); };
  }, []);

  const frost = () => fetch("/admin/shock", { method: "POST" });

  if (!s) return <div style={{ minHeight: "100vh", background: C.paper, padding: 32, fontSize: 18, color: C.muted }}>Connecting to the market…</div>;

  const growers = s.growers ?? [];
  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 28px 60px" }}>
        <Header s={s} onFrost={frost} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(320px, 1.1fr)", gap: 20, alignItems: "start" }}>
          {/* Left: leaderboard + business cards */}
          <div>
            <Leaderboard growers={growers} skill={skill} />
            <div style={{ ...T.label, margin: "22px 0 10px" }}>Businesses</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {growers.map((g) => <BusinessCard key={g.id} g={g} />)}
            </div>
          </div>

          {/* Right: live cascade trace */}
          <div>
            <div style={{ ...T.label, marginBottom: 10 }}>Live cascade — consequences rippling through the market</div>
            <Cascade cascade={s.cascade ?? []} studentId={null} />
          </div>
        </div>
      </div>
    </div>
  );
}
