// Professor dashboard (/professor, no auth for the demo). The pitch lands here:
// the class ranked by DECISION QUALITY first, with profit and butterfly impact
// beside it so the three visibly DIFFER. Per-task columns (sortable, overridable
// — AI proposes with evidence, professor disposes ✏️), clustered misconceptions,
// town-health charts (per-tier prices + welfare + priced-out, hand-rolled SVG),
// and a round-by-round cascade replay for lecture use.
import { useEffect, useState } from "react";
import { P, BORDER, SHADOW_SM, pixFont, bodyFont, Panel, PixLabel, Btn, Tag, ROLE_META, GOAL_LABEL } from "./pixel.js";

const TASKS = [
  { id: "free_play", label: "Free", emoji: "🍋", concept: "equilibrium discovery" },
  { id: "frost_response", label: "Frost", emoji: "❄️", concept: "supply-shock pass-through vs anchoring" },
  { id: "tax_response", label: "Tax", emoji: "📜", concept: "tax incidence" },
  { id: "quality_choice", label: "Quality", emoji: "🕵️", concept: "hidden quality / reputation" },
  { id: "cartel_reasoning", label: "Cartel", emoji: "🤝", concept: "collusion & defection" },
];
const scoreColor = (s) => (s >= 7 ? P.green : s >= 4 ? P.lemon : P.red);
const TIER_COLOR = { farmer: P.green, wholesaler: P.sky, grocer: "#D4A017", restaurant: P.red };

/** Hand-rolled SVG multi-line chart over rounds. series: [{label,color,values}] */
function LineChart({ series, height = 130, yLabel }) {
  const rounds = Math.max(...series.map((s) => s.values.length), 1);
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = Math.max(...all, 1), min = Math.min(...all, 0);
  const W = 320, H = height, padL = 26, padB = 16;
  const x = (i) => padL + (i * (W - padL - 6)) / Math.max(1, rounds - 1);
  const y = (v) => 6 + (H - padB - 12) * (1 - (v - min) / Math.max(1e-6, max - min));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <line x1={padL} y1={H - padB} x2={W - 4} y2={H - padB} stroke={P.ink} strokeWidth="2" />
      <line x1={padL} y1={6} x2={padL} y2={H - padB} stroke={P.ink} strokeWidth="2" />
      <text x={2} y={12} fontFamily='"Press Start 2P", monospace' fontSize="6" fill={P.ink}>{Math.round(max)}</text>
      <text x={2} y={H - padB} fontFamily='"Press Start 2P", monospace' fontSize="6" fill={P.ink}>{Math.round(min)}</text>
      {yLabel && <text x={padL + 4} y={H - 4} fontFamily='"Press Start 2P", monospace' fontSize="6" fill={P.ink} opacity="0.6">{yLabel}</text>}
      {series.map((s) => (
        <polyline key={s.label} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="3" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export default function Professor() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("quality");
  const [overrides, setOverrides] = useState({});
  const [editing, setEditing] = useState(null);
  const [replayRound, setReplayRound] = useState(null);

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
  const byImpact = [...rows].sort((a, b) => (b.impact?.welfareDelta ?? 0) - (a.impact?.welfareDelta ?? 0));

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "quality") return (b.qualityPercentile ?? 0) - (a.qualityPercentile ?? 0);
    if (sortKey === "profit") return (b.profit ?? 0) - (a.profit ?? 0);
    if (sortKey === "impact") return (b.impact?.welfareDelta ?? 0) - (a.impact?.welfareDelta ?? 0);
    if (sortKey === "role") return String(a.role).localeCompare(String(b.role));
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

  const misconceptions = TASKS.map((t) => ({ ...t, failed: rows.filter((m) => taskScore(m, t.id) < 5) })).filter((t) => t.failed.length >= 2);
  const history = data.history ?? [];
  const cascade = data.cascade ?? [];
  const cascadeRounds = [...new Set(cascade.map((c) => c.round))].sort((a, b) => a - b);

  const th = (label, key) => (
    <th key={label} onClick={() => key && setSortKey(key)} style={{ fontFamily: pixFont, fontSize: 8, padding: "8px 4px", cursor: key ? "pointer" : "default", background: sortKey === key ? P.lemon : P.cream, borderBottom: BORDER, whiteSpace: "nowrap" }}>
      {label}{sortKey === key ? " ▾" : ""}
    </th>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 30 }}>🎓</span>
        <div style={{ fontFamily: pixFont, fontSize: 16 }}>Lemonville — Class Dashboard</div>
        <Tag bg={P.white}>{rows.length} students</Tag>
        <Btn size={9} onClick={load} style={{ marginLeft: "auto" }}>↻ Refresh</Btn>
      </div>

      {/* THREE rankings side by side — quality ≠ profit ≠ impact */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Panel bg={P.lemonSoft} style={{ margin: 0 }}>
          <PixLabel size={9} style={{ marginBottom: 8 }}>🏆 BY DECISION QUALITY (the grade)</PixLabel>
          {byQuality.map((m, i) => (
            <div key={m.studentId} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 16, padding: "2px 0" }}>
              <span>{i + 1}. {ROLE_META[m.role]?.emoji} {m.name}</span><b>{m.qualityPercentile}th</b>
            </div>
          ))}
        </Panel>
        <Panel bg={P.skySoft} style={{ margin: 0 }}>
          <PixLabel size={9} color={P.sky} style={{ marginBottom: 8 }}>💰 BY PROFIT (≠ quality!)</PixLabel>
          {byProfit.map((m, i) => (
            <div key={m.studentId} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 16, padding: "2px 0" }}>
              <span>{i + 1}. {m.name}</span><span>${m.profit ?? 0}</span>
            </div>
          ))}
        </Panel>
        <Panel bg={P.greenSoft} style={{ margin: 0 }}>
          <PixLabel size={9} color={P.green} style={{ marginBottom: 8 }}>🦋 BY TOWN IMPACT (counterfactual)</PixLabel>
          {byImpact.map((m, i) => {
            const w = m.impact?.welfareDelta ?? 0;
            return (
              <div key={m.studentId} style={{ display: "flex", justifyContent: "space-between", fontFamily: bodyFont, fontSize: 16, padding: "2px 0" }}>
                <span>{i + 1}. {m.name}</span><b style={{ color: w >= 0 ? P.green : P.red }}>{w >= 0 ? "+" : ""}${w}</b>
              </div>
            );
          })}
        </Panel>
      </div>

      {/* Full grid: student | role | quality | tasks×5 | impact | profit | goal */}
      <Panel style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead>
            <tr>
              {th("Student", null)}
              {th("Role", "role")}
              {th("Quality", "quality")}
              {TASKS.map((t) => (
                <th key={t.id} onClick={() => setSortKey(t.id)} title={t.concept} style={{ fontFamily: pixFont, fontSize: 8, padding: "8px 4px", cursor: "pointer", background: sortKey === t.id ? P.lemon : P.cream, borderBottom: BORDER }}>{t.emoji}</th>
              ))}
              {th("🦋 Impact", "impact")}
              {th("Profit", "profit")}
              {th("Goal", null)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const w = m.impact?.welfareDelta ?? 0;
              return (
                <tr key={m.studentId} style={{ opacity: m.isSeed ? 0.85 : 1 }}>
                  <td style={{ fontFamily: bodyFont, fontSize: 17, padding: "6px 6px", borderBottom: `2px solid ${P.ink}22`, whiteSpace: "nowrap" }}>{m.name}</td>
                  <td style={{ textAlign: "center", fontFamily: bodyFont, fontSize: 15, borderBottom: `2px solid ${P.ink}22`, whiteSpace: "nowrap" }}>{ROLE_META[m.role]?.emoji} {m.role}</td>
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
                  <td style={{ textAlign: "center", fontFamily: pixFont, fontSize: 9, color: w >= 0 ? P.green : P.red, borderBottom: `2px solid ${P.ink}22`, whiteSpace: "nowrap" }}>{w >= 0 ? "+" : ""}${w}</td>
                  <td style={{ textAlign: "center", fontFamily: bodyFont, fontSize: 17, borderBottom: `2px solid ${P.ink}22` }}>${m.profit ?? 0}</td>
                  <td style={{ textAlign: "center", borderBottom: `2px solid ${P.ink}22` }}>
                    <Tag bg={P.white}>{(GOAL_LABEL[m.goal] ?? m.goal).split(" ").slice(0, 3).join(" ")} {m.goalProgress != null ? `· ${Math.round(m.goalProgress * 100)}%` : ""}</Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.7, marginTop: 8 }}>
          Tap a task cell to override the AI's score (AI proposes with evidence; you dispose). Sort by any column — "who failed the tax event?" is one click.
        </div>
      </Panel>

      {/* Town health — watch the frost spike travel down the chain with a lag */}
      {history.length >= 2 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
          <Panel style={{ margin: 0 }}>
            <PixLabel size={9} style={{ marginBottom: 6 }}>📈 AVG PRICE BY TIER (pass-through, lagged)</PixLabel>
            <LineChart yLabel="rounds →" series={[
              { label: "farm", color: TIER_COLOR.farmer, values: history.map((h) => h.avgPrice.farmer) },
              { label: "depot", color: TIER_COLOR.wholesaler, values: history.map((h) => h.avgPrice.wholesaler) },
              { label: "grocer", color: TIER_COLOR.grocer, values: history.map((h) => h.avgPrice.grocer) },
              { label: "café", color: TIER_COLOR.restaurant, values: history.map((h) => h.avgPrice.restaurant) },
            ]} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <Tag bg={P.greenSoft}>farm</Tag><Tag bg={P.skySoft}>depot</Tag><Tag bg={P.lemonSoft}>grocer</Tag><Tag bg={P.redSoft}>café</Tag>
            </div>
          </Panel>
          <Panel style={{ margin: 0 }}>
            <PixLabel size={9} style={{ marginBottom: 6 }}>🏥 TOWN WELFARE & PRICED-OUT FOLK</PixLabel>
            <LineChart yLabel="rounds →" series={[
              { label: "welfare", color: P.green, values: history.map((h) => h.welfare) },
              { label: "surplus", color: P.sky, values: history.map((h) => h.consumerSurplus) },
              { label: "pricedOut×10", color: P.red, values: history.map((h) => h.pricedOut * 10) },
            ]} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <Tag bg={P.greenSoft}>welfare</Tag><Tag bg={P.skySoft}>consumer surplus</Tag><Tag bg={P.redSoft}>priced-out ×10</Tag>
            </div>
          </Panel>
        </div>
      )}

      {/* Clustered misconceptions */}
      <Panel bg={P.redSoft}>
        <PixLabel size={10} color={P.red} style={{ marginBottom: 8 }}>⚠️ CLUSTERED MISCONCEPTIONS</PixLabel>
        {misconceptions.length === 0 ? (
          <div style={{ fontFamily: bodyFont, fontSize: 17 }}>No concept failed by 2+ students. Sharp cohort. 🍋</div>
        ) : misconceptions.map((t) => (
          <div key={t.id} style={{ fontFamily: bodyFont, fontSize: 17, marginBottom: 6 }}>
            {t.emoji} <b>{t.failed.length} of {rows.length}</b> struggled with <b>{t.concept}</b> — {t.failed.map((m) => m.name).join(", ")}
          </div>
        ))}
      </Panel>

      {/* Round replay for lecture: pick a round, read the cascade aloud */}
      {cascadeRounds.length > 0 && (
        <Panel>
          <PixLabel size={10} style={{ marginBottom: 8 }}>📯 ROUND REPLAY (lecture mode)</PixLabel>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {cascadeRounds.map((r) => (
              <button key={r} onClick={() => setReplayRound(replayRound === r ? null : r)} style={{ fontFamily: pixFont, fontSize: 9, padding: "6px 8px", background: replayRound === r ? P.lemon : P.white }}>R{r}</button>
            ))}
          </div>
          {replayRound != null && cascade.filter((c) => c.round === replayRound).map((c, i) => (
            <div key={i} style={{ borderLeft: `4px solid ${P.ink}`, paddingLeft: 8, marginBottom: 6 }}>
              <div style={{ fontFamily: bodyFont, fontSize: 17 }}>{c.cause}</div>
              <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.8 }}>↳ {c.effect}</div>
            </div>
          ))}
        </Panel>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: P.white, border: BORDER, boxShadow: SHADOW_SM, padding: 16, width: 300 }}>
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
