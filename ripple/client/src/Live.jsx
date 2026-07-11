// /live — the PROJECTOR screen. Built for the demo's AHA moment: the whole town
// animating on the wall while the class plays from their phones.
//   • before START: a giant QR + the seats filling up live
//   • during play : the big animated town (trucks, walking folk, ripple pulses),
//     round timer, "moves locked" counter, the WHAT-JUST-HAPPENED butterfly feed
//     with real business names, and a live profit ranking
//   • when an event fires: full-width takeover banner (❄️ 📜 🕵️ 🤝)
//   • game over  : final standings + "reports are on your phones"
// Spectator-only: polls /state/admin, never plays.
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { P, BORDER, SHADOW, pixFont, bodyFont, Panel, PixLabel, Tag, Bar, ROLE_META } from "./pixel.js";
import Town from "./Town.jsx";

function useLive() {
  const [state, setState] = useState(null);
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => {
    fetch("/config").then((r) => r.json()).then((d) => setJoinUrl(d.joinUrl ?? "")).catch(() => {});
    let off = false;
    const tick = async () => {
      try {
        const r = await fetch("/state/admin");
        const d = await r.json();
        if (!off) setState(d);
      } catch { /* keep last */ }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => { off = true; clearInterval(iv); };
  }, []);
  return { state, joinUrl };
}

function useCountdown(state) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);
  if (!state?.roundStartedAt) return { left: null, frac: 1 };
  const total = (state.roundSeconds ?? 35) * 1000;
  const remain = Math.max(0, state.roundStartedAt + total - now);
  return { left: Math.ceil(remain / 1000), frac: remain / total };
}

/** Giant lobby: QR + seats filling live. */
function Lobby({ state, joinUrl }) {
  const humans = state.players.filter((p) => p.isHuman);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center", minHeight: "70vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: pixFont, fontSize: 22, marginBottom: 16, lineHeight: 1.6 }}>📱 SCAN TO TAKE A SEAT</div>
        <div style={{ background: "#fff", border: BORDER, boxShadow: SHADOW, padding: 18, display: "inline-block" }}>
          <QRCode value={joinUrl || (typeof window !== "undefined" ? window.location.origin : "")} size={300} fgColor={P.ink} />
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 24, marginTop: 14 }}>{joinUrl}</div>
        <div style={{ fontFamily: bodyFont, fontSize: 18, opacity: 0.7 }}>same wi-fi · up to 11 players · empty seats play themselves</div>
      </div>
      <div>
        <PixLabel size={13} style={{ marginBottom: 14 }}>THE TOWN IS HIRING… {humans.length}/11</PixLabel>
        {state.players.map((p) => (
          <div key={p.id} className={p.isHuman ? "pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 10, border: BORDER, background: p.isHuman ? P.lemon : P.white, boxShadow: `3px 3px 0 ${P.ink}`, padding: "8px 12px", marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{ROLE_META[p.role]?.emoji}</span>
            <span style={{ fontFamily: pixFont, fontSize: 11, flex: 1 }}>{p.name}</span>
            <span style={{ fontFamily: bodyFont, fontSize: 18 }}>{p.isHuman ? "🧑 taken!" : "🤖 npc"}</span>
          </div>
        ))}
        <div style={{ fontFamily: bodyFont, fontSize: 18, opacity: 0.75, marginTop: 6 }}>Professor: press ▶ START on /admin when everyone's seated.</div>
      </div>
    </div>
  );
}

/** The butterfly feed — who moved, who felt it. The demo's core story. */
function SummaryFeed({ state }) {
  const lines = (state.lastResolution?.summary ?? []).slice(0, 4);
  return (
    <Panel bg={P.paper} style={{ margin: 0 }}>
      <PixLabel size={10} style={{ marginBottom: 8 }}>🦋 ROUND {state.lastResolution?.round ?? "—"}: WHO MOVED → WHO FELT IT</PixLabel>
      {lines.length === 0 && <div style={{ fontFamily: bodyFont, fontSize: 19, opacity: 0.7 }}>Waiting for the first moves…</div>}
      {lines.map((l) => (
        <div key={l.id} style={{ padding: "7px 0", borderBottom: `2px dotted ${P.ink}22` }}>
          <div style={{ fontFamily: bodyFont, fontSize: 20, fontWeight: 700 }}>{l.headline}</div>
          {l.effects.length > 0 && <div style={{ fontFamily: bodyFont, fontSize: 18 }}>→ {l.effects.join(" · ")}</div>}
          {l.pricedOutDelta > 0 && <div style={{ fontFamily: bodyFont, fontSize: 17, color: P.red }}>→ {l.pricedOutDelta} townsfolk priced out 😤</div>}
        </div>
      ))}
    </Panel>
  );
}

/** Live profit standings — humans starred, podium on top. */
function Standings({ state, final }) {
  const rows = [...state.players].sort((a, b) => (b.profitCumulative ?? 0) - (a.profitCumulative ?? 0));
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <Panel bg={P.lemonSoft} style={{ margin: 0 }}>
      <PixLabel size={10} style={{ marginBottom: 8 }}>{final ? "🏁 FINAL STANDINGS (PROFIT)" : "💰 LIVE STANDINGS (PROFIT)"}</PixLabel>
      {rows.slice(0, final ? 11 : 8).map((p, i) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: bodyFont, fontSize: 19, padding: "3px 0", background: p.isHuman ? "#fff" : "transparent" }}>
          <span style={{ width: 26, fontFamily: pixFont, fontSize: 10 }}>{medal[i] ?? `${i + 1}.`}</span>
          <span style={{ fontSize: 16 }}>{ROLE_META[p.role]?.emoji}</span>
          <span style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{p.name}{p.isHuman ? " ⭐" : ""}</span>
          <b style={{ color: (p.profitCumulative ?? 0) >= 0 ? P.green : P.red }}>{(p.profitCumulative ?? 0) >= 0 ? "+" : ""}${p.profitCumulative ?? 0}</b>
        </div>
      ))}
      {final && <div style={{ fontFamily: bodyFont, fontSize: 17, marginTop: 8, opacity: 0.8 }}>…but profit isn't the grade: skill reports are on your phones 📱</div>}
    </Panel>
  );
}

export default function Live() {
  const { state, joinUrl } = useLive();
  const { left, frac } = useCountdown(state);
  if (!state) return <div className="bob" style={{ fontFamily: pixFont, fontSize: 16, padding: 40 }}>🍋 Connecting to Lemonville…</div>;

  const humans = state.players.filter((p) => p.isHuman);
  const confirmed = (state.confirmed ?? []).length;
  const banner = state.banner;
  const bannerFresh = banner && banner.round >= state.round - 1;
  const done = state.phase === "done";
  const metrics = state.lastResolution?.metrics;

  return (
    <div style={{ maxWidth: 1560, margin: "0 auto" }}>
      {/* header: identity + round + timer, sized for the back row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 34 }} className="bob">🍋</span>
        <span style={{ fontFamily: pixFont, fontSize: 24 }}>LEMONVILLE</span>
        <Tag bg={P.lemon}>LIVE</Tag>
        {state.started && !done && (
          <>
            <span style={{ fontFamily: pixFont, fontSize: 18, marginLeft: "auto" }}>ROUND {Math.min(state.round, state.totalRounds)}/{state.totalRounds}</span>
            <span style={{ fontFamily: pixFont, fontSize: 20, color: left <= 8 ? P.red : P.ink }}>⏳ {left ?? "—"}s</span>
            <Tag bg={confirmed === humans.length && humans.length > 0 ? P.green : P.white}>✋ {confirmed}/{humans.length} moves locked</Tag>
          </>
        )}
        {done && <span style={{ fontFamily: pixFont, fontSize: 20, marginLeft: "auto" }}>🏁 GAME OVER</span>}
      </div>
      {state.started && !done && <Bar frac={left != null ? frac : 1} color={left <= 8 ? P.red : P.lemon} height={18} />}

      {/* event takeover — big enough to gasp at */}
      {bannerFresh && !done && (
        <div className="shake" style={{ background: banner.id === "frost" ? P.sky : banner.id === "tax" ? P.lemon : banner.id === "shady_supplier" ? P.redSoft : P.green, border: BORDER, boxShadow: SHADOW, padding: "14px 18px", margin: "12px 0", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 44 }}>{banner.emoji}</span>
          <div>
            <div style={{ fontFamily: pixFont, fontSize: 18 }}>{banner.title}</div>
            <div style={{ fontFamily: bodyFont, fontSize: 20, marginTop: 4 }}>{state.market?.news}</div>
          </div>
        </div>
      )}

      {!state.started && !done ? (
        <Lobby state={state} joinUrl={joinUrl} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16, alignItems: "start", marginTop: 12 }}>
          <div>
            <Town state={state} studentId={"__live__"} />
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <SummaryFeed state={state} />
            <Standings state={state} final={done} />
            {!done && metrics && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Tag bg={P.greenSoft}>🛍️ {(state.lastResolution?.folkTrips ?? []).filter((t) => t.to).length} purchases</Tag>
                <Tag bg={(metrics.pricedOut ?? 0) >= 8 ? P.red : P.white}>😤 {metrics.pricedOut} priced out</Tag>
                <Tag bg={P.skySoft}>town welfare ${metrics.welfare}</Tag>
              </div>
            )}
            {!done && humans.length < 11 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, border: BORDER, background: "#fff", boxShadow: `3px 3px 0 ${P.ink}`, padding: 10 }}>
                <QRCode value={joinUrl || ""} size={84} fgColor={P.ink} />
                <div style={{ fontFamily: bodyFont, fontSize: 17, lineHeight: 1.4 }}>
                  <b>Late? Scan to jump in.</b><br />{joinUrl}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
