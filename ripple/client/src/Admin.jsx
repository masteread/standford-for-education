// Admin control room (/admin, no auth) — big pixel buttons for the stage. Start,
// force-resolve, inject any event early, add an NPC, seed a fake cohort, reset.
import { useEffect, useState } from "react";
import { P, BORDER, SHADOW, pixFont, bodyFont, Panel, PixLabel, Btn, Tag } from "./pixel.js";

const EVENTS = [
  { id: "frost", label: "❄️ Frost" },
  { id: "tax", label: "📜 Tax" },
  { id: "shady_supplier", label: "🕵️ Shady Supplier" },
  { id: "cartel", label: "🤝 Cartel" },
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
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      setMsg(`${path} ✓`);
      setTimeout(() => setMsg(""), 2000);
      refresh();
      return d;
    } catch { setMsg(`${path} ✗`); }
  }

  const bigBtn = { width: "100%", marginBottom: 10, padding: "16px 12px" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 28 }}>🎛️</span>
        <div style={{ fontFamily: pixFont, fontSize: 16 }}>Lemonville — Admin</div>
        {msg && <Tag bg={P.green} style={{ marginLeft: "auto" }}>{msg}</Tag>}
      </div>

      {status && (
        <Panel bg={P.lemonSoft}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tag>Round {status.round}/12</Tag>
            <Tag bg={status.phase === "done" ? P.red : P.green}>{status.phase}</Tag>
            <Tag bg={status.started ? P.green : P.white}>{status.started ? "started" : "not started"}</Tag>
            <Tag bg={P.white}>players {status.joinOrder?.length ?? 0}</Tag>
            <Tag bg={P.white}>fired: {(status.firedEvents ?? []).join(", ") || "none"}</Tag>
            <Tag bg={status.seeded ? P.green : P.white}>{status.seeded ? "cohort seeded" : "no cohort"}</Tag>
          </div>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <Panel>
          <PixLabel size={9} style={{ marginBottom: 10 }}>GAME</PixLabel>
          <Btn tone="green" size={12} onClick={() => post("/admin/start")} style={bigBtn}>▶ START</Btn>
          <Btn tone="sky" size={12} onClick={() => post("/admin/resolve")} style={bigBtn}>⏭ FORCE RESOLVE</Btn>
          <Btn size={12} onClick={() => post("/admin/npc")} style={bigBtn}>🤖 ADD NPC</Btn>
        </Panel>
        <Panel>
          <PixLabel size={9} style={{ marginBottom: 10 }}>INJECT EVENT</PixLabel>
          {EVENTS.map((e) => (
            <Btn key={e.id} tone="lemon" size={11} onClick={() => post("/admin/event", { id: e.id })} style={bigBtn}>{e.label}</Btn>
          ))}
        </Panel>
        <Panel>
          <PixLabel size={9} style={{ marginBottom: 10 }}>DEMO</PixLabel>
          <Btn tone="sky" size={12} onClick={() => post("/admin/seed")} style={bigBtn}>👥 SEED COHORT</Btn>
          <Btn size={12} onClick={() => { window.location.href = "/professor"; }} style={bigBtn}>🎓 PROFESSOR VIEW</Btn>
          <Btn tone="red" size={12} onClick={() => post("/admin/reset")} style={bigBtn}>♻ RESET</Btn>
        </Panel>
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.7, marginTop: 10 }}>
        Players join at <b>{typeof window !== "undefined" ? window.location.origin : ""}/</b> · this page is <b>/admin</b> · class view is <b>/professor</b>
      </div>
    </div>
  );
}
