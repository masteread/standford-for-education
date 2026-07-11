// App shell — the join → play → report state machine (Person A owns the scaffold).
// Wires Person B's Join + Report with Person A's Game + Cascade.
import { useEffect, useState } from "react";
import Join from "./Join.jsx";
import Report from "./Report.jsx";
import Game from "./Game.jsx";
import Cascade from "./Cascade.jsx";
import { S, C, F } from "./ui.js";

const isAdmin = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin");

function AdminBar() {
  const [msg, setMsg] = useState("");
  const call = async (path) => {
    const res = await fetch(path, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(`${path} → ${JSON.stringify(data)}`);
  };
  return (
    <div style={{ ...S.wrap, paddingTop: 8, paddingBottom: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...S.chip, background: C.amberBg, borderColor: C.amber, color: C.amber, fontWeight: 700 }} onClick={() => call("/admin/shock")}>
          ❄ Inject FROST
        </button>
        <button style={S.chip} onClick={() => call("/admin/seed")}>Seed cohort</button>
        <button style={S.chip} onClick={() => call("/admin/reset")}>Reset</button>
      </div>
      {msg && <div style={{ ...F.label, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

export default function App() {
  const [studentId, setStudentId] = useState(null);
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState("join"); // join | play | report
  const [replayRound, setReplayRound] = useState(null);

  // Poll the world every 2s while playing.
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
      } catch {
        /* keep last state; poll again */
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [studentId, phase]);

  if (phase === "join") {
    return (
      <>
        {isAdmin && <AdminBar />}
        <Join onJoined={(d) => { setStudentId(d.studentId); setPhase("play"); }} />
      </>
    );
  }

  if (phase === "report") {
    return (
      <div style={S.wrap}>
        {isAdmin && <AdminBar />}
        <Report studentId={studentId} onReplayRound={(r) => setReplayRound(r)} />
        <h3 style={{ marginTop: 24 }}>Cascade — the story of your decisions</h3>
        <Cascade cascade={state?.cascade ?? []} studentId={studentId} replayRound={replayRound} onReplayRound={setReplayRound} />
      </div>
    );
  }

  // phase === "play"
  return (
    <div style={S.wrap}>
      {isAdmin && <AdminBar />}
      {!state ? (
        <p style={F.body}>Connecting to the market…</p>
      ) : (
        <>
          <Game state={state} studentId={studentId} />
          <h3 style={{ marginTop: 20, marginBottom: 8 }}>What your decisions set off</h3>
          <Cascade cascade={state.cascade ?? []} studentId={studentId} replayRound={replayRound} onReplayRound={setReplayRound} />
        </>
      )}
    </div>
  );
}
