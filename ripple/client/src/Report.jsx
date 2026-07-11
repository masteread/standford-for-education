// B5 — Student report: skill radar (Recharts) + percentile bands + evidence
// rounds linking into A's cascade replay + goal achievement shown SEPARATELY
// from decision quality (the gap is the diagnostic).
// <ScoreTable> below is the no-Recharts fallback — swap it in if the chart fights us.
import { useEffect, useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

const DIMENSION_LABELS = {
  equilibrium_reasoning: "Equilibrium",
  strategic_anticipation: "Anticipation",
  information_updating: "Info updating",
  risk_management: "Risk mgmt",
};

const styles = {
  wrap: { maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" },
  gap: { background: "#fff8e1", border: "1px solid #e0c15a", borderRadius: 8, padding: 12, margin: "12px 0" },
  dim: { margin: "10px 0", paddingBottom: 8, borderBottom: "1px solid #eee" },
  evidence: {
    display: "inline-block",
    margin: "0 4px",
    padding: "2px 10px",
    borderRadius: 12,
    background: "#eef",
    border: "1px solid #99c",
    cursor: "pointer",
    fontSize: 13,
  },
};

function gapSentence(model) {
  const quality = Math.round(
    Object.values(model.percentiles ?? {}).reduce((s, p) => s + p, 0) /
      Math.max(1, Object.keys(model.percentiles ?? {}).length)
  );
  const achieved = model.goalProgress == null ? null : Math.round(model.goalProgress * 100);
  if (achieved == null) return `Decision quality: ${quality}th percentile.`;
  const gap =
    achieved >= 60 && quality < 40
      ? "High achievement on low decision quality — the market was kind to you (lucky)."
      : achieved < 40 && quality >= 60
        ? "Low achievement despite high decision quality — good thinking in a hard role."
        : "Achievement and decision quality broadly agree.";
  return `Goal achieved: ${achieved}% · Decision quality: ${quality}th percentile. ${gap}`;
}

/** Fallback renderer if Recharts misbehaves on stage. */
export function ScoreTable({ model }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th align="left">Skill</th>
          <th>Score</th>
          <th>Percentile</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(model.scores ?? {}).map(([dim, d]) => (
          <tr key={dim} style={{ borderTop: "1px solid #ddd" }}>
            <td>{DIMENSION_LABELS[dim] ?? dim}</td>
            <td align="center">{d.score}/10</td>
            <td align="center">{model.percentiles?.[dim]}th</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Report({ studentId, onReplayRound }) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/report/${studentId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`report not ready (${res.status})`);
        return res.json();
      })
      .then((data) => !cancelled && setModel(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) return <div style={styles.wrap}>Report: {error}</div>;
  if (!model) return <div style={styles.wrap}>Grading your decisions…</div>;

  const radarData = Object.entries(model.scores ?? {}).map(([dim, d]) => ({
    dimension: DIMENSION_LABELS[dim] ?? dim,
    score: d.score,
    percentile: model.percentiles?.[dim] ?? 50,
  }));

  return (
    <div style={styles.wrap}>
      <h2>Skill radar — {model.name ?? studentId}</h2>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <RadarChart data={radarData} outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" />
            <PolarRadiusAxis domain={[0, 10]} tickCount={6} />
            <Radar name="score" dataKey="score" stroke="#1a7f37" fill="#1a7f37" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.gap}>{gapSentence(model)}</div>
      {model.goal_progress_comment && <p>{model.goal_progress_comment}</p>}

      {Object.entries(model.scores ?? {}).map(([dim, d]) => (
        <div key={dim} style={styles.dim}>
          <strong>{DIMENSION_LABELS[dim] ?? dim}</strong> — {d.score}/10, {model.percentiles?.[dim]}th
          percentile
          <div>{d.comment}</div>
          <div>
            evidence:
            {(d.evidence_rounds ?? []).map((round) => (
              <button key={round} style={styles.evidence} onClick={() => onReplayRound?.(round)}>
                R{round}
              </button>
            ))}
          </div>
        </div>
      ))}

      {(model.detected_biases ?? []).length > 0 && (
        <div>
          <strong>Detected biases:</strong>{" "}
          {model.detected_biases.map((b) => `${b.bias} (R${b.rounds.join(", R")})`).join("; ")}
        </div>
      )}
    </div>
  );
}
