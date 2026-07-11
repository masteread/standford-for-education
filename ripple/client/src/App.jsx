// App shell — the join → play → report state machine (Person A owns the scaffold).
// Wires Person B's Join + Report with Person A's Game + Cascade.
import { useEffect, useState } from "react";
import Join from "./Join.jsx";
import Report from "./Report.jsx";
import Game from "./Game.jsx";
import Cascade from "./Cascade.jsx";
import { Screen, Wordmark, C, T } from "./ui.js";

const isAdmin = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin");

function AdminBar() {
  const [msg, setMsg] = useState("");
  const call = async (path) => {
    const res = await fetch(path, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(`${path.replace("/admin/", "")} ✓`);
    setTimeout(() => setMsg(""), 2500);
  };
  const btn = (bg, color, border) => ({ padding: "8px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: bg, color, border: `1px solid ${border}` });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.line}` }}>
      <span style={{ ...T.label, fontSize: 10 }}>Admin</span>
      <button style={btn(C.frostSoft, C.frost, C.frost)} onClick={() => call("/admin/shock")}>❄ Inject frost</button>
      <button style={btn("#fff", C.ink, C.line)} onClick={() => call("/admin/seed")}>Seed cohort</button>
      <button style={btn("#fff", C.ink, C.line)} onClick={() => call("/admin/reset")}>Reset</button>
      {msg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{msg}</span>}
    </div>
  );
}

export default function App() {
  const [studentId, setStudentId] = useState(null);
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState("join");
  const [replayRound, setReplayRound] = useState(null);

  useEffect(() => {
    if (!studentId || phase === "join") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/state/${studentId}`);
        const data = await res.json();
        if (cancelled) return;
        setState(data);
        if (data.phase === "done") setPhase("report");
      } catch { /* keep last state */ }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [studentId, phase]);

  if (phase === "join") {
    return (
      <Screen>
        {isAdmin && <AdminBar />}
        <Join onJoined={(d) => { setStudentId(d.studentId); setPhase("play"); }} />
      </Screen>
    );
  }

  if (phase === "report") {
    return (
      <Screen>
        {isAdmin && <AdminBar />}
        <Report studentId={studentId} onReplayRound={setReplayRound} />
        <h3 style={{ ...T.label, fontSize: 12, marginTop: 26, marginBottom: 10 }}>The story of your decisions</h3>
        <Cascade cascade={state?.cascade ?? []} studentId={studentId} replayRound={replayRound} onReplayRound={setReplayRound} />
      </Screen>
    );
  }

  return (
    <Screen>
      {isAdmin && <AdminBar />}
      {!state ? (
        <p style={{ ...T.body, color: C.muted }}>Connecting to the market…</p>
      ) : (
        <>
          <Game state={state} studentId={studentId} />
          <h3 style={{ ...T.label, fontSize: 12, marginTop: 22, marginBottom: 10 }}>What your decisions set off</h3>
          <Cascade cascade={state.cascade ?? []} studentId={studentId} replayRound={replayRound} onReplayRound={setReplayRound} />
        </>
      )}
    </Screen>
  );
}
