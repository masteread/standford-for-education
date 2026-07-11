// Professor dashboard (/professor, no auth for the demo). The point of the whole
// project lands here: the class ranked by DECISION QUALITY first, profit second —
// side by side so judges see they differ. Per-task columns (sortable), clustered
// misconceptions per task, and per-cell professor overrides (AI proposes with
// evidence; professor disposes). Overridden cells show ✏️.
import { useEffect, useState } from "react";
import { P, BORDER, SHADOW, SHADOW_SM, pixFont, bodyFont, Panel, PixLabel, Btn, Tag } from "./pixel.js";

const TASKS = [
  { id: "free_play", label: "Free", emoji: "🍋", concept: "equilibrium discovery" },
  { id: "frost_response", label: "Frost", emoji: "❄️", concept: "cost anchoring" },
  { id: "tax_response", label: "Tax", emoji: "📜", concept: "tax incidence" },
  { id: "quality_choice", label: "Quality", emoji: "🕵️", concept: "hidden quality" },
  { id: "cartel_reasoning", label: "Cartel", emoji: "🤝", concept: "collusion & defection" },
];
const GOAL_SHORT = { max_profit: "profit", max_market_share: "share", survive_shock_cash_80: "survive", zero_spoilage: "no-spoil" };
const scoreColor = (s) => (s >= 7 ? P.green : s >= 4 ? P.lemon : P.red);

export default function Professor() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("quality"); // 'quality' | 'profit' | taskId
  const [overrides, setOverrides] = useState({}); // `${taskId}:${sid}` -> score
  const [editing, setEditing] = useState(null); // {taskId, sid, score, note}

  function load() {
    fetch("/professor/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`load failed (${r.status})`))))
      .then((d) => {
        setData(d);
        const o = {};
        for (const rec of d.overrides ?? []) o[`${rec.taskId}:${rec.studentId}`] = rec.newScore;
        setOverrides(o);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  if (error) return <Panel><PixLabel>Professor</PixLabel><div style={{ fontFamily: bodyFont, fontSize: 17 }}>{error}</div></Panel>;
  if (!data) return <Panel bg={P.lemonSoft}><div className="bob" style={{ fontFamily: pixFont, fontSize: 12 }}>🍋 Grading the class…</div></Panel>;

  const taskScore = (m, tid) => overrides[`${tid}:${m.studentId}`] ?? m.task_ratings?.[tid]?.score ?? 0;
  const rows = Object.values(data.models);
  const byQuality = [...rows].sort((a, b) => (b.qualityPercentile ?? 0) - (a.qualityPercentile ?? 0));
  const byProfit = [...rows].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  const profitRank = Object.fromEntries(byProfit.map((m, i) => [m.studentId, i + 1]));

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "quality") return (b.qualityPercentile ?? 0) - (a.qualityPercentile ?? 0);
    if (sortKey === "profit") return (b.profit ?? 0) - (a.profit ?? 0);
    return taskScore(b, sortKey) - taskScore(a, sortKey);
  });

  async function saveOverride() {
    const { taskId, sid, score, note } = editing;
    const newScore = Math.max(0, Math.min(10, Number(score)));
    setOverrides((o) => ({ ...o, [`${taskId}:${sid}`]: newScore }));
    setEditing(null);
    try {
      await fetch("/professor/override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, studentId: sid, newScore, note }) });
    } catch { /* local state already reflects it */ }
  }

  const misconceptions = TASKS.map((t) => {
    const failed = rows.filter((m) => taskScore(m, t.id) < 5);
    return { ...t, failed };
  }).filter((t) => t.failed.length > 0);

  const th = (label, key) => (
    <th onClick={() => key && setSortKey(key)} style={{ fontFamily: pixFont, fontSize: 8, padding: "8px 4px", cursor: key ? "pointer" : "default", background: sortKey === key ? P.lemon : P.cream, borderBottom: BORDER, whiteSpace: "nowrap" }}>
      {label}{sortKey === key ? " ▾" : ""}
    </th>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 30 }}>🎓</span>
        <div style={{ fontFamily: pixFont, fontSize: 18 }}>Lemonville — Class Dashboard</div>
        <Btn size={9} onClick={load} style={{ marginLeft: "auto" }}>↻ Refresh</Btn>
      </div>

      {/* Two rankings side by side — the whole pitch in one glance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel bg={P.lemonSoft} style={{ margin: 0 }}>
          <PixLabel size={9} style={{ marginBottom: 8 }}>🏆 BY DECISION QUALITY</PixLabel>
          {byQuality.map((m, i) => (
            <div key={m.studentId} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 17, padding: "2px 0" }}>
              <span>{i + 1}. {m.name}</span><span>{m.qualityPercentile}th</span>
            </div>
          ))}
        </Panel>
        <Panel bg={P.skySoft} style={{ margin: 0 }}>
          <PixLabel size={9} color={P.sky} style={{ marginBottom: 8 }}>💰 BY PROFIT (≠ quality!)</PixLabel>
          {byProfit.map((m, i) => (
            <div key={m.studentId} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 17, padding: "2px 0" }}>
              <span>{i + 1}. {m.name}</span><span>${m.profit ?? 0}</span>
            </div>
          ))}
        </Panel>
      </div>

      {/* Grid: student | quality | 5 task cells | profit | goal */}
      <Panel style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
          <thead>
            <tr>
              {th("Student", null)}
              {th("Quality", "quality")}
              {TASKS.map((t) => <th key={t.id} onClick={() => setSortKey(t.id)} style={{ fontFamily: pixFont, fontSize: 8, padding: "8px 4px", cursor: "pointer", background: sortKey === t.id ? P.lemon : P.cream, borderBottom: BORDER }} title={t.concept}>{t.emoji}</th>)}
              {th("Profit", "profit")}
              {th("Goal", null)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.studentId}>
                <td style={{ fontFamily: bodyFont, fontSize: 17, padding: "6px 6px", borderBottom: `2px solid ${P.ink}22`, whiteSpace: "nowrap" }}>{m.name}</td>
                <td style={{ textAlign: "center", fontFamily: pixFont, fontSize: 10, borderBottom: `2px solid ${P.ink}22` }}>{m.qualityPercentile}th</td>
                {TASKS.map((t) => {
                  const s = taskScore(m, t.id);
                  const over = overrides[`${t.id}:${m.studentId}`] != null;
                  return (
                    <td key={t.id} onClick={() => setEditing({ taskId: t.id, sid: m.studentId, score: s, note: "" })}
                      title={m.task_ratings?.[t.id]?.comment}
                      style={{ textAlign: "center", background: scoreColor(s), border: `2px solid ${P.ink}`, fontFamily: pixFont, fontSize: 10, cursor: "pointer", padding: "6px 4px" }}>
                      {s}{over ? " ✏️" : ""}
                    </td>
                  );
                })}
                <td style={{ textAlign: "center", fontFamily: bodyFont, fontSize: 17, borderBottom: `2px solid ${P.ink}22` }}>${m.profit ?? 0}</td>
                <td style={{ textAlign: "center", borderBottom: `2px solid ${P.ink}22` }}>
                  <Tag bg={P.white}>{GOAL_SHORT[m.goal] ?? m.goal} {m.goalProgress != null ? `${Math.round(m.goalProgress * 100)}%` : ""}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.7, marginTop: 8 }}>Tap a task cell to override the AI's score. AI proposes with evidence; you dispose.</div>
      </Panel>

      {/* Clustered misconceptions */}
      <Panel bg={P.redSoft}>
        <PixLabel size={10} color={P.red} style={{ marginBottom: 8 }}>⚠️ CLUSTERED MISCONCEPTIONS</PixLabel>
        {misconceptions.length === 0 ? (
          <div style={{ fontFamily: bodyFont, fontSize: 17 }}>No task failed by the class. Sharp cohort. 🍋</div>
        ) : misconceptions.map((t) => (
          <div key={t.id} style={{ fontFamily: bodyFont, fontSize: 17, marginBottom: 6 }}>
            {t.emoji} <b>{t.failed.length} of {Object.keys(data.models).length}</b> struggled with <b>{t.concept}</b> ({t.label}) — {t.failed.map((m) => m.name).join(", ")}
          </div>
        ))}
      </Panel>

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: P.white, border: BORDER, boxShadow: SHADOW, padding: 16, width: 300 }}>
            <PixLabel size={10} style={{ marginBottom: 10 }}>Override — {TASKS.find((t) => t.id === editing.taskId)?.label} · {data.models[editing.sid]?.name}</PixLabel>
            <div style={{ fontFamily: bodyFont, fontSize: 16, marginBottom: 8 }}>AI: {data.models[editing.sid]?.task_ratings?.[editing.taskId]?.comment}</div>
            <label style={{ fontFamily: pixFont, fontSize: 9 }}>New score (0–10)</label>
            <input type="number" min="0" max="10" value={editing.score} onChange={(e) => setEditing({ ...editing, score: e.target.value })} style={{ width: "100%", padding: 8, fontSize: 18, margin: "6px 0" }} />
            <input placeholder="Note (why?)" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} style={{ width: "100%", padding: 8, fontSize: 16, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn tone="green" size={10} onClick={saveOverride} style={{ flex: 1 }}>Save ✏️</Btn>
              <Btn size={10} onClick={() => setEditing(null)} style={{ flex: 1 }}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
