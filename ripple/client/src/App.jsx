// App shell — tiny path router + the join → play → report state machine.
//   /            → play (join → game → report)
//   /professor   → class dashboard
//   /admin       → admin control room
import { useEffect, useState } from "react";
import Join from "./Join.jsx";
import Game from "./Game.jsx";
import Report from "./Report.jsx";
import Professor from "./Professor.jsx";
import Admin from "./Admin.jsx";
import { Screen } from "./pixel.js";

const path = typeof window !== "undefined" ? window.location.pathname : "/";

function Play() {
  const [studentId, setStudentId] = useState(null);
  const [state, setState] = useState(null);
  const [phase, setPhase] = useState("join");
  const [replayRound, setReplayRound] = useState(null);

  useEffect(() => {
    if (!studentId || phase === "join") return;
    let off = false;
    const tick = async () => {
      try {
        const res = await fetch(`/state/${studentId}`);
        const data = await res.json();
        if (off) return;
        setState(data);
        if (data.phase === "done") setPhase("report");
      } catch { /* keep last state */ }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => { off = true; clearInterval(iv); };
  }, [studentId, phase]);

  if (phase === "join") {
    return <Screen><Join onJoined={(d) => { setStudentId(d.studentId); setPhase("play"); }} /></Screen>;
  }
  if (phase === "report") {
    return (
      <Screen>
        <Report studentId={studentId} cascade={state?.cascade ?? []} replayRound={replayRound} onReplayRound={setReplayRound} />
      </Screen>
    );
  }
  return (
    <Screen wide>
      {!state ? (
        <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 12, padding: 20 }} className="bob">🍋 Connecting to the market…</div>
      ) : (
        <Game state={state} studentId={studentId} onReplayRound={setReplayRound} />
      )}
    </Screen>
  );
}

export default function App() {
  if (path.startsWith("/professor")) return <Screen wide><Professor /></Screen>;
  if (path.startsWith("/admin")) return <Screen wide><Admin /></Screen>;
  return <Play />;
}
