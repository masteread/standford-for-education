// Join flow — name entry → POST /join → pixel role card with the GOAL in big type.
// QR code points other players/judges at the join URL. Mobile-first.
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { P, BORDER, SHADOW, pixFont, bodyFont, Panel, PixLabel, Btn, Wordmark, GOAL_LABEL } from "./pixel.js";

export default function Join({ onJoined }) {
  const [name, setName] = useState("");
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Ask the server for the LAN/public URL so the QR works from other phones,
  // not just localhost. Falls back to the current origin.
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
    return (
      <div>
        <Wordmark />
        <Panel bg={P.lemon}>
          <PixLabel size={12}>{card.title ?? `Stand ${player.studentId}`}</PixLabel>
          <div style={{ marginTop: 10 }}>
            {(card.lines ?? []).map((line) => <div key={line} style={{ fontFamily: bodyFont, fontSize: 18, marginBottom: 4 }}>• {line}</div>)}
          </div>
        </Panel>
        <Panel bg={P.greenSoft}>
          <PixLabel size={9} color={P.green}>🎯 YOUR GOAL</PixLabel>
          <div style={{ fontFamily: pixFont, fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>{GOAL_LABEL[card.goal] ?? card.goalText ?? card.goal}</div>
        </Panel>
        {player.castingReason && <div style={{ fontFamily: bodyFont, fontSize: 15, opacity: 0.7, textAlign: "center" }}>casting: {player.castingReason}</div>}
        <div style={{ fontFamily: pixFont, fontSize: 10, textAlign: "center", marginTop: 16 }} className="bob">Waiting for the market to open… 🍋</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <div style={{ fontSize: 56 }} className="bob">🍋</div>
        <div style={{ fontFamily: pixFont, fontSize: 26, margin: "10px 0" }}>LEMONVILLE</div>
        <div style={{ fontFamily: bodyFont, fontSize: 19, opacity: 0.8 }}>Run a lemon stand. Outsmart the market. Get graded on how you think.</div>
      </div>
      <Panel style={{ marginTop: 20 }}>
        <form onSubmit={join}>
          <input style={{ width: "100%", padding: 12, fontSize: 22 }} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Btn tone="green" size={14} onClick={join} disabled={busy || !name.trim()} style={{ width: "100%", marginTop: 12 }}>{busy ? "Joining…" : "▶ JOIN THE MARKET"}</Btn>
        </form>
        {error && <div style={{ fontFamily: bodyFont, fontSize: 17, color: P.red, marginTop: 8 }}>{error}</div>}
      </Panel>
      <Panel style={{ textAlign: "center" }}>
        <PixLabel size={9} style={{ marginBottom: 10 }}>SCAN TO JOIN FROM YOUR PHONE</PixLabel>
        <div style={{ background: "#fff", border: BORDER, padding: 10, display: "inline-block" }}>
          <QRCode value={joinUrl} size={150} fgColor={P.ink} />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 16, marginTop: 10, opacity: 0.8 }}>or type: <b>{joinUrl}</b></div>
        <div style={{ fontFamily: bodyFont, fontSize: 14, opacity: 0.6 }}>(must be on the same wi-fi)</div>
      </Panel>
    </div>
  );
}
