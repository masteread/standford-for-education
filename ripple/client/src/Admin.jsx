// Admin control room (/admin, no auth) — big pixel buttons for the stage, plus a
// live seat map of the whole ecosystem (who's human, who's NPC, cash, goal).
import { useEffect, useState } from "react";
import { P, BORDER, pixFont, bodyFont, Panel, PixLabel, Btn, Tag, ROLE_META } from "./pixel.js";

const EVENTS = [
  { id: "frost", label: "❄️ Frost (farms)" },
  { id: "tax", label: "📜 Retail Tax" },
  { id: "shady_supplier", label: "🕵️ Shady Supplier" },
  { id: "cartel", label: "🤝 Cartels (all tiers)" },
];

export default function Admin() {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");

  function refresh() {
    fetch("/admin/state").then((r) => r.json()).then(setStatus).catch(() => {});
  }
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 2000);
    return () => clearInterval(iv);
  }, []);

  async function post(path, body) {
    try {
      await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      setMsg(`${path} ✓`);
      setTimeout(() => setMsg(""), 2000);
      refresh();
    } catch { setMsg(`${path} ✗`); }
  }

  const bigBtn = { width: "100%", marginBottom: 10, padding: "16px 12px" };
  const seats = status?.seats ?? [];
  const humans = seats.filter((s) => s.isHuman).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 28 }}>🎛️</span>
        <div style={{ fontFamily: pixFont, fontSize: 16 }}>Lemonville — Admin</div>
        {msg && <Tag bg={P.green}>{msg}</Tag>}
      </div>

      {status && (
        <Panel bg={P.lemonSoft}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tag>Round {status.round}/{status.totalRounds}</Tag>
            <Tag bg={status.phase === "done" ? P.red : P.green}>{status.phase}</Tag>
            <Tag bg={status.started ? P.green : P.white}>{status.started ? "started" : "not started"}</Tag>
            <Tag bg={P.white}>humans {humans}/11</Tag>
            <Tag bg={P.white}>fired: {(status.firedEvents ?? []).join(", ") || "none"}</Tag>
            <Tag bg={status.seeded ? P.green : P.white}>{status.seeded ? "cohort seeded" : "no seed cohort"}</Tag>
            {status.metrics && <Tag bg={P.skySoft}>welfare ${status.metrics.welfare}</Tag>}
            {status.metrics && <Tag bg={(status.metrics.pricedOut ?? 0) >= 8 ? P.red : P.white}>😤 {status.metrics.pricedOut}</Tag>}
          </div>
        </Panel>
      )}

      {/* the whole ecosystem, one seat per row */}
      <Panel style={{ overflowX: "auto" }}>
        <PixLabel size={9} style={{ marginBottom: 8 }}>SEAT MAP — the class IS the economy</PixLabel>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <thead>
            <tr>{["Seat", "Who", "Price", "Stock", "Cash", "Profit", "Goal"].map((h) => (
              <th key={h} style={{ fontFamily: pixFont, fontSize: 8, padding: "6px 4px", borderBottom: BORDER, textAlign: "left" }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {seats.map((s) => (
              <tr key={s.id} style={{ background: s.isHuman ? P.lemonSoft : "transparent" }}>
                <td style={{ fontFamily: pixFont, fontSize: 9, padding: "5px 4px", whiteSpace: "nowrap" }}>{ROLE_META[s.role]?.emoji} {s.id}</td>
                <td style={{ fontFamily: bodyFont, fontSize: 16, padding: "5px 4px", whiteSpace: "nowrap" }}>{s.isHuman ? `🧑 ${s.name}` : "🤖 NPC"}</td>
                <td style={{ fontFamily: bodyFont, fontSize: 16 }}>${s.price}</td>
                <td style={{ fontFamily: bodyFont, fontSize: 16 }}>{s.stock}</td>
                <td style={{ fontFamily: bodyFont, fontSize: 16 }}>${s.cash}</td>
                <td style={{ fontFamily: bodyFont, fontSize: 16, color: s.profit >= 0 ? P.green : P.red }}>{s.profit >= 0 ? "+" : ""}${s.profit}</td>
                <td style={{ fontFamily: bodyFont, fontSize: 14 }}>{s.isHuman ? `${s.goal} ${Math.round((s.goalProgress ?? 0) * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <Panel>
          <PixLabel size={9} style={{ marginBottom: 10 }}>GAME</PixLabel>
          <Btn tone="green" size={12} onClick={() => post("/admin/start")} style={bigBtn}>▶ START</Btn>
          <Btn tone="sky" size={12} onClick={() => post("/admin/resolve")} style={bigBtn}>⏭ FORCE RESOLVE</Btn>
        </Panel>
        <Panel>
          <PixLabel size={9} style={{ marginBottom: 10 }}>INJECT EVENT</PixLabel>
          {EVENTS.map((e) => (
            <Btn key={e.id} tone="lemon" size={11} onClick={() => post("/admin/event", { id: e.id })} style={bigBtn}>{e.label}</Btn>
          ))}
        </Panel>
        <Panel>
          <PixLabel size={9} style={{ marginBottom: 10 }}>DEMO</PixLabel>
          <Btn tone="lemon" size={12} onClick={() => window.open("/live", "_blank")} style={bigBtn}>📺 LIVE VIEW (projector)</Btn>
          <Btn tone="sky" size={12} onClick={() => post("/admin/seed")} style={bigBtn}>👥 SEED COHORT</Btn>
          <Btn size={12} onClick={() => { window.location.href = "/professor"; }} style={bigBtn}>🎓 PROFESSOR VIEW</Btn>
          <Btn tone="red" size={12} onClick={() => post("/admin/reset")} style={bigBtn}>♻ RESET</Btn>
        </Panel>
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.7, marginTop: 10 }}>
        Players join at <b>{typeof window !== "undefined" ? window.location.origin : ""}/</b> · this page is <b>/admin</b> · class view is <b>/professor</b> · empty seats play themselves (NPCs)
      </div>
    </div>
  );
}
