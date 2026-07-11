// B3 — Join flow: name entry -> POST /join -> role card (GOAL in large type).
// Mobile-first single column; QR code points other players/judges at the join URL.
import { useState } from "react";
import QRCode from "react-qr-code";

const styles = {
  wrap: { maxWidth: 420, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" },
  input: { width: "100%", fontSize: 20, padding: 12, boxSizing: "border-box" },
  button: {
    width: "100%",
    fontSize: 20,
    padding: 14,
    marginTop: 12,
    background: "#1a7f37",
    color: "white",
    border: "none",
    borderRadius: 8,
  },
  card: { border: "2px solid #333", borderRadius: 12, padding: 16, marginTop: 16 },
  goal: { fontSize: 26, fontWeight: 800, marginTop: 12, lineHeight: 1.2 },
  reason: { fontSize: 12, color: "#666", marginTop: 8 },
  qrBox: { marginTop: 24, textAlign: "center" },
};

export default function Join({ onJoined }) {
  const [name, setName] = useState("");
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const joinUrl = typeof window !== "undefined" ? window.location.href : "https://ripple.local/join";

  async function join(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`join failed (${res.status})`);
      const data = await res.json();
      setPlayer(data);
      onJoined?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (player) {
    const card = player.roleCard ?? {};
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2>{card.title ?? `Grower ${player.studentId}`}</h2>
          {(card.lines ?? []).map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div style={styles.goal}>YOUR GOAL: {card.goalText ?? card.goal}</div>
          {player.castingReason && <div style={styles.reason}>casting: {player.castingReason}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <h1>Ripple — Lemon Wars</h1>
      <form onSubmit={join}>
        <input
          style={styles.input}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <button style={styles.button} disabled={busy || !name.trim()}>
          {busy ? "Joining…" : "Join the market"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <div style={styles.qrBox}>
        <QRCode value={joinUrl} size={160} />
        <p>Scan to join from your phone</p>
      </div>
    </div>
  );
}
