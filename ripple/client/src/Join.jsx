// Join flow for non-technical students: type a name, press one button, get a
// friendly role card that explains the job in three short lines. The QR lets the
// rest of the class join from phones. Up to 11 humans — NPCs run empty seats.
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { P, BORDER, pixFont, bodyFont, Panel, PixLabel, Btn, Wordmark, GOAL_LABEL, ROLE_META } from "./pixel.js";

export default function Join({ onJoined, onEnter }) {
  const [name, setName] = useState("");
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [joinUrl, setJoinUrl] = useState(typeof window !== "undefined" ? window.location.origin + "/" : "https://lemonville.local/");
  useEffect(() => {
    fetch("/config").then((r) => r.json()).then((d) => d.joinUrl && setJoinUrl(d.joinUrl)).catch(() => {});
  }, []);

  async function join(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `join failed (${res.status})`);
      const data = await res.json();
      setPlayer(data);
      onJoined?.(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (player) {
    const card = player.roleCard ?? {};
    const meta = ROLE_META[player.role] ?? {};
    return (
      <div>
        <Wordmark />
        <Panel bg={P.greenSoft} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>{meta.emoji}</div>
          <PixLabel size={12} style={{ margin: "8px 0" }}>You run a {meta.label}!</PixLabel>
          <div style={{ fontFamily: bodyFont, fontSize: 18, opacity: 0.85 }}>{name || "you"} · seat {player.studentId}</div>
        </Panel>
        <Panel bg={P.lemon}>
          <PixLabel size={9} style={{ marginBottom: 8 }}>YOUR JOB, IN SHORT</PixLabel>
          {(card.lines ?? []).map((line) => <div key={line} style={{ fontFamily: bodyFont, fontSize: 18, marginBottom: 5 }}>• {line}</div>)}
        </Panel>
        <Panel bg={P.white}>
          <PixLabel size={9} color={P.green}>🎯 YOUR SECRET GOAL</PixLabel>
          <div style={{ fontFamily: pixFont, fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{GOAL_LABEL[card.goal] ?? card.goalText ?? card.goal}</div>
          <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.7, marginTop: 6 }}>Don't tell the others — chase it while you play.</div>
        </Panel>
        <Btn tone="green" size={14} onClick={() => onEnter?.()} style={{ width: "100%", padding: "18px 10px" }}>
          ▶ I'M READY — TAKE ME TO TOWN
        </Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <div style={{ fontSize: 56 }} className="bob">🍋</div>
        <div style={{ fontFamily: pixFont, fontSize: 26, margin: "10px 0" }}>LEMONVILLE</div>
        <div style={{ fontFamily: bodyFont, fontSize: 19, opacity: 0.85 }}>Run a business in a little lemon town — with your whole class.</div>
      </div>

      <Panel style={{ marginTop: 20 }}>
        <form onSubmit={join}>
          <input style={{ width: "100%", padding: 12, fontSize: 22 }} placeholder="Type your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Btn tone="green" size={14} onClick={join} disabled={busy || !name.trim()} style={{ width: "100%", marginTop: 12, padding: "16px 10px" }}>{busy ? "Joining…" : "▶ PLAY"}</Btn>
        </form>
        {error && <div style={{ fontFamily: bodyFont, fontSize: 17, color: P.red, marginTop: 8 }}>{error}</div>}
      </Panel>

      <Panel bg={P.lemonSoft}>
        <PixLabel size={9} style={{ marginBottom: 8 }}>HOW IT WORKS</PixLabel>
        <div style={{ fontFamily: bodyFont, fontSize: 18, lineHeight: 1.6 }}>
          <div>1️⃣ You get a business: a farm, a depot, a store or a café.</div>
          <div>2️⃣ Each round: pick a price and an amount, press CONFIRM.</div>
          <div>3️⃣ Watch the town react — your moves affect everyone else.</div>
        </div>
      </Panel>

      <Panel style={{ textAlign: "center" }}>
        <PixLabel size={9} style={{ marginBottom: 10 }}>CLASSMATES: SCAN TO JOIN (up to 11 players)</PixLabel>
        <div style={{ background: "#fff", border: BORDER, padding: 10, display: "inline-block" }}>
          <QRCode value={joinUrl} size={150} fgColor={P.ink} />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 16, marginTop: 10, opacity: 0.8 }}>or type: <b>{joinUrl}</b></div>
        <div style={{ fontFamily: bodyFont, fontSize: 14, opacity: 0.6 }}>(must be on the same wi-fi)</div>
      </Panel>
    </div>
  );
}
