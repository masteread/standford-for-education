// Student report — THREE separate scores, kept apart on purpose:
//   🎯 goal achievement (motivation) · 🧠 decision quality (the grade, radar +
//   percentile bands vs cohort) · 🦋 ecosystem impact (engine counterfactuals).
// Plus per-task ratings, detected biases, and evidence rounds that replay into
// the Town Crier. Radar is hand-rolled SVG (no chart lib).
import { useEffect, useState } from "react";
import { P, BORDER, pixFont, bodyFont, Panel, PixLabel, Tag, GOAL_LABEL, ROLE_META } from "./pixel.js";
import CascadeList from "./Cascade.jsx";

const DIMS = [
  { id: "equilibrium_reasoning", label: "Equilibrium" },
  { id: "strategic_anticipation", label: "Anticipation" },
  { id: "information_updating", label: "Info Updating" },
  { id: "risk_management", label: "Risk Mgmt" },
];
const TASKS = [
  { id: "free_play", label: "Free Play", emoji: "🍋" },
  { id: "frost_response", label: "Frost", emoji: "❄️" },
  { id: "tax_response", label: "Tax", emoji: "📜" },
  { id: "quality_choice", label: "Quality", emoji: "🕵️" },
  { id: "cartel_reasoning", label: "Cartel", emoji: "🤝" },
];
const BIAS_FRAME = {
  anchoring: "🧊 Frozen in place — never repriced after the shock",
  naive_cooperation: "🐑 Too trusting — held the cartel while peers defected",
  overordering: "🎲 Overordered — stacked up spoilage risk",
  overconfidence: "🎲 Overproduced — stacked up spoilage risk",
  "sunk-cost": "⚓ Sunk-cost — held losing stock too long",
};
const scoreColor = (s) => (s >= 7 ? P.green : s >= 4 ? P.lemon : P.red);

function Radar({ model }) {
  const size = 240, c = size / 2, R = 88;
  const pts = DIMS.map((d, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / DIMS.length;
    const score = model.scores?.[d.id]?.score ?? 0;
    const pct = (model.percentiles?.[d.id] ?? 50) / 100;
    return {
      ang,
      score: { x: c + Math.cos(ang) * R * (score / 10), y: c + Math.sin(ang) * R * (score / 10) },
      band: { x: c + Math.cos(ang) * R * pct, y: c + Math.sin(ang) * R * pct },
      axis: { x: c + Math.cos(ang) * R, y: c + Math.sin(ang) * R },
      label: { x: c + Math.cos(ang) * (R + 22), y: c + Math.sin(ang) * (R + 22) },
      d,
    };
  });
  const poly = (sel) => pts.map((p) => `${sel(p).x.toFixed(1)},${sel(p).y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`-30 -6 ${size + 60} ${size + 12}`} style={{ display: "block", margin: "0 auto", maxWidth: 320 }}>
      {[0.33, 0.66, 1].map((r) => (
        <polygon key={r} points={pts.map((p) => `${c + Math.cos(p.ang) * R * r},${c + Math.sin(p.ang) * R * r}`).join(" ")} fill="none" stroke={P.ink} strokeOpacity="0.18" strokeWidth="2" />
      ))}
      {pts.map((p, i) => <line key={i} x1={c} y1={c} x2={p.axis.x} y2={p.axis.y} stroke={P.ink} strokeOpacity="0.18" strokeWidth="2" />)}
      <polygon points={poly((p) => p.band)} fill={P.sky} fillOpacity="0.18" stroke={P.sky} strokeWidth="2" strokeDasharray="4 3" />
      <polygon points={poly((p) => p.score)} fill={P.lemon} fillOpacity="0.5" stroke={P.ink} strokeWidth="3" />
      {pts.map((p, i) => <circle key={i} cx={p.score.x} cy={p.score.y} r="4" fill={P.ink} />)}
      {pts.map((p, i) => (
        <text key={i} x={p.label.x} y={p.label.y} textAnchor="middle" dominantBaseline="middle" fontFamily='"Press Start 2P", monospace' fontSize="7" fill={P.ink}>{p.d.label}</text>
      ))}
    </svg>
  );
}

function ScoreTile({ emoji, label, value, sub, bg }) {
  return (
    <div style={{ flex: 1, minWidth: 100, border: BORDER, boxShadow: `3px 3px 0 ${P.ink}`, background: bg, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 20 }}>{emoji}</div>
      <div style={{ fontFamily: pixFont, fontSize: 16, margin: "4px 0" }}>{value}</div>
      <div style={{ fontFamily: pixFont, fontSize: 7 }}>{label}</div>
      {sub && <div style={{ fontFamily: bodyFont, fontSize: 13, marginTop: 2, opacity: 0.8 }}>{sub}</div>}
    </div>
  );
}

function gapSentence(model) {
  const q = model.qualityPercentile ?? 50;
  const achieved = model.goalProgress == null ? null : Math.round(model.goalProgress * 100);
  if (achieved == null) return `Decision quality: ${q}th percentile.`;
  const gap =
    achieved >= 60 && q < 40 ? "High achievement, low decision quality — the market was kind to you (lucky)."
    : achieved < 40 && q >= 60 ? "Low achievement despite high decision quality — good thinking in a hard seat."
    : "Achievement and decision quality broadly agree.";
  return `Goal achieved ${achieved}% · decision quality ${q}th percentile. ${gap}`;
}

export default function Report({ studentId, cascade, onReplayRound, replayRound }) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = false;
    fetch(`/report/${studentId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`report not ready (${r.status})`))))
      .then((d) => !off && setModel(d))
      .catch((e) => !off && setError(e.message));
    return () => { off = true; };
  }, [studentId]);

  if (error) return <Panel><PixLabel>Report</PixLabel><div style={{ fontFamily: bodyFont, fontSize: 17 }}>{error}</div></Panel>;
  if (!model) return <Panel bg={P.lemonSoft}><div style={{ fontFamily: pixFont, fontSize: 12 }} className="bob">🍋 Grading your decisions…</div></Panel>;

  const impact = model.impact;
  const meta = ROLE_META[model.role] ?? {};
  const topRipples = Object.entries(impact?.perPlayer ?? {}).filter(([, d]) => Math.abs(d) >= 1)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);

  return (
    <div>
      <Panel bg={P.lemonSoft}>
        <PixLabel size={13}>📊 {model.name ?? studentId}'s Report — {meta.emoji} {meta.label} {studentId}</PixLabel>
      </Panel>

      {/* THREE scores, side by side — deliberately separate */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <ScoreTile emoji="🎯" label="GOAL" value={`${Math.round((model.goalProgress ?? 0) * 100)}%`} sub={GOAL_LABEL[model.goal] ?? model.goal} bg={P.greenSoft} />
        <ScoreTile emoji="🧠" label="DECISION QUALITY" value={`${model.qualityPercentile}th`} sub={`${model.decisionQuality}/10 avg — this is the grade`} bg={P.lemonSoft} />
        <ScoreTile emoji="🦋" label="ECOSYSTEM IMPACT" value={`${(impact?.welfareDelta ?? 0) >= 0 ? "+" : ""}$${impact?.welfareDelta ?? 0}`} sub={`town welfare · ${model.impactPercentile}th pct`} bg={P.skySoft} />
      </div>

      <Panel>
        <Radar model={model} />
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 4 }}>
          <Tag bg={P.lemon}>🟨 your score</Tag>
          <Tag bg={P.sky} color="#fff">╌ class rank</Tag>
        </div>
      </Panel>

      <Panel>
        <PixLabel size={10} style={{ marginBottom: 8 }}>PER-TASK CONCEPTS</PixLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {TASKS.map((t) => {
            const r = model.task_ratings?.[t.id];
            const s = r?.score ?? 0;
            return (
              <div key={t.id} title={r?.comment} style={{ flex: 1, textAlign: "center", border: BORDER, background: scoreColor(s), padding: "6px 2px" }}>
                <div style={{ fontSize: 16 }}>{t.emoji}</div>
                <div style={{ fontFamily: pixFont, fontSize: 12 }}>{s}</div>
                <div style={{ fontFamily: pixFont, fontSize: 6, marginTop: 2 }}>{t.label}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Butterfly ledger: who your moves actually touched */}
      <Panel bg={P.skySoft}>
        <PixLabel size={9} color={P.sky}>🦋 YOUR BUTTERFLY LEDGER</PixLabel>
        <div style={{ fontFamily: bodyFont, fontSize: 17, margin: "6px 0" }}>
          Across {impact?.moves ?? 0} moves, versus a town where you always held: welfare{" "}
          <b style={{ color: (impact?.welfareDelta ?? 0) >= 0 ? P.green : P.red }}>{(impact?.welfareDelta ?? 0) >= 0 ? "+" : ""}${impact?.welfareDelta ?? 0}</b>,
          consumer surplus <b>{(impact?.consumerSurplusDelta ?? 0) >= 0 ? "+" : ""}${impact?.consumerSurplusDelta ?? 0}</b>,
          {" "}<b>{Math.abs(impact?.pricedOutDelta ?? 0)}</b> townsfolk {(impact?.pricedOutDelta ?? 0) > 0 ? "priced out" : "kept shopping"},
          widest single-round reach <b>{impact?.maxReach ?? 0}</b> businesses.
        </div>
        {topRipples.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {topRipples.map(([id, d]) => <Tag key={id} bg={d >= 0 ? P.greenSoft : P.redSoft}>{id} {d >= 0 ? "+" : ""}${d}</Tag>)}
          </div>
        )}
      </Panel>

      <Panel bg={P.greenSoft}>
        <PixLabel size={9} color={P.green}>ACHIEVEMENT ≠ GRADE</PixLabel>
        <div style={{ fontFamily: bodyFont, fontSize: 18, marginTop: 6 }}>{gapSentence(model)}</div>
      </Panel>

      {DIMS.map((d) => {
        const s = model.scores?.[d.id];
        if (!s) return null;
        return (
          <Panel key={d.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: pixFont, fontSize: 10 }}>{d.label}</span>
              <span style={{ fontFamily: pixFont, fontSize: 11, color: scoreColor(s.score) }}>{s.score}/10 · {model.percentiles?.[d.id]}th</span>
            </div>
            <div style={{ fontFamily: bodyFont, fontSize: 16, margin: "6px 0" }}>{s.comment}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(s.evidence_rounds ?? []).map((r) => (
                <button key={r} onClick={() => onReplayRound?.(r)} style={{ fontFamily: pixFont, fontSize: 8, padding: "4px 6px", background: P.white }}>R{r} ↻</button>
              ))}
            </div>
          </Panel>
        );
      })}

      {(model.detected_biases ?? []).length > 0 && (
        <Panel bg={P.redSoft}>
          <PixLabel size={9} color={P.red}>DETECTED BIASES</PixLabel>
          {model.detected_biases.map((b, i) => (
            <div key={i} style={{ fontFamily: bodyFont, fontSize: 17, marginTop: 6 }}>
              {BIAS_FRAME[b.bias] ?? `⚠️ ${b.bias}`} <span style={{ opacity: 0.7 }}>(R{(b.rounds ?? []).join(", R")})</span>
            </div>
          ))}
        </Panel>
      )}

      <PixLabel size={10} style={{ margin: "18px 0 8px" }}>📯 THE STORY OF YOUR DECISIONS</PixLabel>
      <CascadeList cascade={cascade ?? []} studentId={studentId} replayRound={replayRound} onReplayRound={onReplayRound} />
    </div>
  );
}
