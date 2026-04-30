/**
 * DALAL STREET T20 — Cricket-themed chart-reading reaction game.
 *
 *   36 balls per match.  Each ball: tap UP or DOWN within 1.8s.
 *   Correct + fast → 6 / 4 / 2 / 1 runs.  Wrong or timeout → wicket.
 *   Match ends at 36 balls or 10 wickets.
 *
 *   Anti-cheat: every tap is sent to the server, which is the sole authority
 *   on direction + scoring.  Client never knows correctDir until ball is played.
 */

import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AreaChart, Area, ResponsiveContainer, YAxis,
} from "recharts";
import { ChevronLeft, Trophy, Coins, Share2 } from "lucide-react";

/* ─── Tokens ─── */
const BG     = "#07070e";
const CARD   = "#0d0d1e";
const BORDER = "#1e1e2e";
const GREEN  = "#00ff88";
const RED    = "#ff4466";
const AMBER  = "#ff9f3b";
const GOLD   = "#ffcc44";
const BLUE   = "#3b9eff";
const TEXT   = "#e8eaf0";
const MUTED  = "#888899";
const DIM    = "#444455";
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

/* ─── Types from server ─── */
interface BallPack {
  ballNo: number;
  points: Array<{ t: number; c: number }>;
}
interface MatchStartResp {
  ok:            boolean;
  matchId:       number;
  ballsPerMatch: number;
  wicketsMax:    number;
  ballTimeoutMs: number;
  balls:         BallPack[];
  code?:         string;
  error?:        string;
}
interface BallResp {
  ok:           boolean;
  runs:         number;
  isWicket:     boolean;
  correctDir:   "UP" | "DOWN";
  userDir:      "UP" | "DOWN" | null;
  reactionMs:   number;
  totalRuns:    number;
  totalWickets: number;
  ballsBowled:  number;
  matchOver:    boolean;
  error?:       string;
}
interface EndResp {
  ok:             boolean;
  matchId:        number;
  runs:           number;
  wickets:        number;
  ballsBowled:    number;
  coinsAwarded:   number;
  bonusKind:      "CENTURY" | "DOUBLE_TON" | null;
  bonusCoins:     number;
  scoreboardLine: string;
  todayLeaderboard: Array<{ rank: number; name: string | null; runs: number; wickets: number; balls: number }>;
  userRankToday:  number | null;
  error?:         string;
}
interface StateResp {
  ok:           boolean;
  date:         string;
  playedToday:  number;
  dailyCap:     number;
  remaining:    number;
  careerBest:   number;
  top3:         Array<{ rank: number; name: string | null; runs: number; balls: number }>;
  config: {
    ballsPerMatch:  number;
    wicketsMax:     number;
    ballTimeoutMs:  number;
    coinsPerRun:    number;
    centuryBonus:   number;
    doubleTonBonus: number;
  };
}

interface Props { authToken?: string; onExit?: () => void; }

type Phase = "lobby" | "playing" | "ended" | "blocked";

const DalalStreetT20: React.FC<Props> = ({ authToken, onExit }) => {
  const [phase,     setPhase]     = useState<Phase>("lobby");
  const [stateData, setStateData] = useState<StateResp | null>(null);
  const [match,     setMatch]     = useState<MatchStartResp | null>(null);
  const [endResult, setEndResult] = useState<EndResp | null>(null);
  const [err,       setErr]       = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);

  const headers = (): HeadersInit => authToken
    ? { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }
    : { "Content-Type": "application/json" };

  // Load lobby state on mount
  const loadState = async () => {
    if (!authToken) return;
    try {
      const r = await fetch("/api/t20/state", { headers: headers() });
      const data = await r.json() as StateResp;
      setStateData(data);
    } catch {
      setErr("Network error");
    }
  };
  useEffect(() => { loadState(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authToken]);

  const startMatch = async () => {
    if (!authToken || loading) return;
    setLoading(true); setErr(null); setEndResult(null);
    try {
      const r = await fetch("/api/t20/start", { method: "POST", headers: headers() });
      const data = await r.json() as MatchStartResp;
      if (!data.ok) {
        if (data.code === "daily_cap") { setPhase("blocked"); }
        setErr(data.error || "Couldn't start match");
        return;
      }
      setMatch(data);
      setPhase("playing");
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  };

  const goLobby = () => { setPhase("lobby"); setMatch(null); setEndResult(null); loadState(); };

  /* ─── Sign-in gate ─── */
  if (!authToken) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: TEXT, ...SANS }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏏</div>
        <h2 style={{ ...MONO, fontSize: 18, color: GREEN, letterSpacing: "0.06em" }}>DALAL STREET T20</h2>
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
          36 balls. Cricket-style scoring. Earn coins by reading charts fast.<br/>
          Sign in to play.
        </p>
      </div>
    );
  }

  /* ─── Render by phase ─── */
  if (phase === "blocked" || (stateData && stateData.remaining === 0 && phase === "lobby")) {
    return <BlockedView state={stateData} onExit={onExit} />;
  }
  if (phase === "lobby") {
    return <Lobby
      state={stateData}
      err={err}
      loading={loading}
      onStart={startMatch}
      onExit={onExit}
    />;
  }
  if (phase === "playing" && match) {
    return <MatchPlayer
      match={match}
      authToken={authToken}
      onMatchEnd={(end) => { setEndResult(end); setPhase("ended"); }}
      onError={setErr}
    />;
  }
  if (phase === "ended" && endResult) {
    return <EndScreen result={endResult} onPlayAgain={goLobby} onExit={onExit} />;
  }
  return null;
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* LOBBY                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function Lobby({
  state, err, loading, onStart, onExit,
}: {
  state: StateResp | null;
  err: string | null;
  loading: boolean;
  onStart: () => void;
  onExit?: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, ...SANS, padding: "16px 16px 100px" }}>
      <TopBar onExit={onExit} />

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
        <div style={{ fontSize: 56, marginBottom: 6 }}>🏏</div>
        <h1 style={{ ...MONO, fontSize: 22, color: GREEN, letterSpacing: "0.08em", margin: 0, fontWeight: 700 }}>
          DALAL STREET T20
        </h1>
        <div style={{ ...MONO, fontSize: 11, color: MUTED, letterSpacing: "0.06em", marginTop: 6 }}>
          36 BALLS · 10 WICKETS · TAP UP OR DOWN
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <StatBox
          label="MATCHES TODAY"
          value={state ? `${state.playedToday} / ${state.dailyCap}` : "—"}
          color={state && state.remaining === 0 ? RED : GREEN}
        />
        <StatBox
          label="CAREER BEST"
          value={state ? `${state.careerBest}` : "—"}
          color={GOLD}
          suffix="runs"
        />
      </div>

      {/* Daily leaderboard preview */}
      {state && state.top3.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Trophy size={14} color={GOLD} />
            <span style={{ ...MONO, fontSize: 11, color: GOLD, letterSpacing: "0.06em" }}>
              TODAY'S LEADERBOARD
            </span>
          </div>
          {state.top3.map((r, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0", borderBottom: i < state.top3.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <span style={{ ...MONO, fontSize: 13, color: TEXT }}>
                <span style={{ color: GOLD, marginRight: 6 }}>{["🥇","🥈","🥉"][i] || `#${r.rank}`}</span>
                {r.name || "Anonymous"}
              </span>
              <span style={{ ...MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>
                {r.runs} <span style={{ color: DIM, fontSize: 10 }}>off {r.balls}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* How to play */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ ...MONO, fontSize: 11, color: DIM, letterSpacing: "0.06em", marginBottom: 8 }}>HOW TO PLAY</div>
        <Tip text="See an unlabelled chart, decide if next bar will be UP or DOWN" />
        <Tip text="<0.6s = SIX (6) · <1.0s = FOUR (4) · <1.5s = TWO · <1.8s = ONE" />
        <Tip text="Wrong tap or timeout = WICKET" />
        <Tip text="Match ends at 36 balls or 10 wickets" />
        <div style={{ ...MONO, fontSize: 10, color: GOLD, letterSpacing: "0.04em", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
          🏆 1 coin / run · Century: +200 · Double-ton: +500
        </div>
      </div>

      {/* Play button */}
      <button
        onClick={onStart}
        disabled={loading || !state || state.remaining === 0}
        style={{
          width: "100%", padding: "16px",
          background: state && state.remaining > 0 ? GREEN : "#1a1a2e",
          color:      state && state.remaining > 0 ? "#000"  : DIM,
          border: "none", borderRadius: 10,
          ...MONO, fontSize: 16, fontWeight: 700, letterSpacing: "0.1em",
          cursor: loading || !state || state.remaining === 0 ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "LOADING…"
          : state && state.remaining === 0 ? "DAILY CAP REACHED"
          : "▶ PLAY MATCH"}
      </button>

      {err && (
        <div style={{
          marginTop: 12, padding: "10px 12px", background: "rgba(255,68,102,0.08)",
          border: `1px solid ${RED}30`, borderRadius: 6, color: RED, ...MONO, fontSize: 12,
        }}>{err}</div>
      )}

      <Disclaimer />
    </div>
  );
}

function StatBox({ label, value, color, suffix }: { label: string; value: string; color: string; suffix?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ ...MONO, fontSize: 20, color, fontWeight: 700, marginTop: 4 }}>
        {value}
        {suffix && <span style={{ ...MONO, fontSize: 10, color: DIM, fontWeight: 400, marginLeft: 4 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
      <span style={{ color: GREEN, ...MONO, fontSize: 10, flexShrink: 0, marginTop: 1 }}>▸</span>
      <span style={{ ...SANS, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* MATCH PLAYER                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function MatchPlayer({
  match, authToken, onMatchEnd, onError,
}: {
  match: MatchStartResp;
  authToken: string;
  onMatchEnd: (e: EndResp) => void;
  onError: (m: string) => void;
}) {
  const [ballIdx,  setBallIdx]  = useState(0);
  const [runs,     setRuns]     = useState(0);
  const [wickets,  setWickets]  = useState(0);
  const [showResult, setShowResult] = useState<{
    runs: number; isWicket: boolean; correctDir: "UP"|"DOWN";
  } | null>(null);
  const [tapDisabled, setTapDisabled] = useState(false);
  const [now, setNow] = useState(0);

  // ms remaining for current ball; null = no ball active
  const [ballStartMs, setBallStartMs] = useState<number | null>(null);

  const headers = (): HeadersInit => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  });

  const currentBall = match.balls[ballIdx];

  // Start ball timer when a new ball mounts
  useEffect(() => {
    if (!currentBall || showResult || tapDisabled) return;
    setBallStartMs(performance.now());
    const tick = setInterval(() => setNow((n) => n + 1), 50);
    return () => clearInterval(tick);
  }, [ballIdx, currentBall, showResult, tapDisabled]);

  // Auto-timeout
  useEffect(() => {
    if (ballStartMs == null || tapDisabled || showResult) return;
    const elapsed = performance.now() - ballStartMs;
    if (elapsed >= match.ballTimeoutMs) {
      handleTap(null, match.ballTimeoutMs);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [now, ballStartMs, tapDisabled, showResult]);

  const handleTap = async (dir: "UP" | "DOWN" | null, forcedMs?: number) => {
    if (tapDisabled || !currentBall || ballStartMs == null) return;
    setTapDisabled(true);
    const reactionMs = forcedMs ?? Math.round(performance.now() - ballStartMs);

    try {
      const r = await fetch("/api/t20/ball", {
        method: "POST", headers: headers(),
        body: JSON.stringify({
          matchId: match.matchId,
          ballNo:  currentBall.ballNo,
          userDir: dir,
          reactionMs,
        }),
      });
      const data = await r.json() as BallResp;
      if (!data.ok) { onError(data.error || "Ball error"); return; }

      setShowResult({ runs: data.runs, isWicket: data.isWicket, correctDir: data.correctDir });
      setRuns(data.totalRuns);
      setWickets(data.totalWickets);

      // Brief reveal then advance
      setTimeout(async () => {
        if (data.matchOver) {
          // End match
          try {
            const er = await fetch("/api/t20/end", {
              method: "POST", headers: headers(),
              body: JSON.stringify({ matchId: match.matchId }),
            });
            const ed = await er.json() as EndResp;
            if (!ed.ok) { onError(ed.error || "End error"); return; }
            onMatchEnd(ed);
          } catch { onError("Network error"); }
        } else {
          setShowResult(null);
          setBallIdx((i) => i + 1);
          setTapDisabled(false);
        }
      }, 900);
    } catch {
      onError("Network error");
      setTapDisabled(false);
    }
  };

  if (!currentBall) return null;

  const elapsed = ballStartMs ? performance.now() - ballStartMs : 0;
  const remainPct = Math.max(0, Math.min(1, 1 - elapsed / match.ballTimeoutMs));
  const overNum   = Math.floor(ballIdx / 6);
  const ballInOver = (ballIdx % 6) + 1;

  return (
    <div style={{
      minHeight: "100vh", background: BG, color: TEXT, ...SANS,
      padding: "10px 14px 30px", display: "flex", flexDirection: "column",
    }}>

      {/* Scoreboard */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: "10px 12px", marginBottom: 8,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center",
      }}>
        <ScoreCell label="RUNS" value={String(runs)} color={GREEN} large />
        <ScoreCell label="WICKETS" value={`${wickets} / ${match.wicketsMax}`} color={wickets > 6 ? RED : TEXT} />
        <ScoreCell label="OVER" value={`${overNum}.${ballInOver}`} color={MUTED} />
      </div>

      {/* Wicket dots */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, justifyContent: "center" }}>
        {Array.from({ length: match.wicketsMax }).map((_, i) => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: "50%",
            background: i < wickets ? RED : "#1a1a2e",
            boxShadow: i < wickets ? `0 0 4px ${RED}` : "none",
            transition: "all 0.3s",
          }}/>
        ))}
      </div>

      {/* Chart canvas */}
      <div style={{
        flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: 8, marginBottom: 12, position: "relative", minHeight: 220,
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ ...MONO, fontSize: 10, color: DIM, letterSpacing: "0.08em", marginBottom: 4 }}>
          BALL {currentBall.ballNo} · NEXT BAR — UP OR DOWN?
        </div>
        <div style={{ flex: 1, position: "relative", minHeight: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentBall.points}>
              <defs>
                <linearGradient id="t20-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={GREEN} stopOpacity={0.4}/>
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis
                hide
                domain={[
                  (dataMin: number) => dataMin - Math.max(1, dataMin * 0.005),
                  (dataMax: number) => dataMax + Math.max(1, dataMax * 0.005),
                ]}
              />
              <Area
                type="monotone" dataKey="c" stroke={GREEN} strokeWidth={2}
                fill="url(#t20-grad)" isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Result overlay */}
        {showResult && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(7,7,14,0.92)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            borderRadius: 10,
            animation: showResult.isWicket ? "t20-shake 0.4s" : "t20-flash 0.4s",
          }}>
            <div style={{
              ...MONO,
              fontSize: showResult.isWicket ? 36 : showResult.runs >= 4 ? 56 : 40,
              color: showResult.isWicket ? RED : showResult.runs === 6 ? GOLD : showResult.runs >= 4 ? AMBER : GREEN,
              fontWeight: 700, letterSpacing: "0.04em",
            }}>
              {showResult.isWicket ? "OUT!"
                : showResult.runs === 6 ? "SIX! 🚀"
                : showResult.runs === 4 ? "FOUR! 🏏"
                : showResult.runs === 2 ? "2 runs"
                : "1 run"}
            </div>
            <div style={{ ...MONO, fontSize: 11, color: MUTED, marginTop: 8, letterSpacing: "0.08em" }}>
              ANSWER: {showResult.correctDir === "UP" ? "▲ UP" : "▼ DOWN"}
            </div>
          </div>
        )}
      </div>

      {/* Countdown bar */}
      <div style={{
        height: 4, background: "#1a1a2e", borderRadius: 2, marginBottom: 10, overflow: "hidden",
      }}>
        <div style={{
          width: `${remainPct * 100}%`, height: "100%",
          background: remainPct > 0.66 ? GREEN : remainPct > 0.33 ? AMBER : RED,
          transition: "width 0.05s linear",
        }}/>
      </div>

      {/* Tap buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <TapBtn label="UP" arrow="▲" color={GREEN} onClick={() => handleTap("UP")} disabled={tapDisabled} />
        <TapBtn label="DOWN" arrow="▼" color={RED}  onClick={() => handleTap("DOWN")} disabled={tapDisabled} />
      </div>

      <style>{`
        @keyframes t20-flash {
          0% { background: rgba(0,255,136,0.4); }
          100% { background: rgba(7,7,14,0.92); }
        }
        @keyframes t20-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); background: rgba(255,68,102,0.3); }
          75% { transform: translateX(6px); background: rgba(255,68,102,0.3); }
        }
      `}</style>
    </div>
  );
}

function ScoreCell({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...MONO, fontSize: 8, color: DIM, letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ ...MONO, fontSize: large ? 22 : 16, color, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function TapBtn({ label, arrow, color, onClick, disabled }: {
  label: string; arrow: string; color: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#0d0d1e" : `${color}18`,
        border: `2px solid ${disabled ? BORDER : color}`,
        color: disabled ? DIM : color,
        borderRadius: 10, padding: "20px 0",
        ...MONO, fontSize: 18, fontWeight: 700, letterSpacing: "0.1em",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.1s",
      }}
    >
      {arrow} {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* END SCREEN                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function EndScreen({
  result, onPlayAgain, onExit,
}: {
  result: EndResp;
  onPlayAgain: () => void;
  onExit?: () => void;
}) {
  const isCentury    = result.bonusKind === "CENTURY" || result.bonusKind === "DOUBLE_TON";
  const isDoubleTon  = result.bonusKind === "DOUBLE_TON";
  const allOut       = result.wickets >= 10;

  const headline = isDoubleTon ? "🚀 DOUBLE TON!"
                  : isCentury  ? "💯 CENTURY!"
                  : allOut     ? "🏏 ALL OUT"
                  : result.runs >= 50 ? "🏏 GOOD INNINGS"
                  : "🏏 INNINGS OVER";

  const headColor = isCentury ? GOLD : allOut ? RED : GREEN;

  const handleShare = async () => {
    const text = `I scored ${result.scoreboardLine} on Dalal Street T20 🏏\nMarket Samachar`;
    if (navigator.share) {
      try { await navigator.share({ title: "Dalal Street T20", text }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); } catch {}
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, ...SANS, padding: "16px 16px 100px" }}>
      <TopBar onExit={onExit} />

      {/* Hero scoreboard */}
      <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
        <div style={{ ...MONO, fontSize: 14, color: headColor, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>
          {headline}
        </div>
        <div style={{ ...MONO, fontSize: 64, color: GREEN, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
          {result.runs}{!allOut && <span style={{ fontSize: 32, color: GOLD }}>*</span>}
        </div>
        <div style={{ ...MONO, fontSize: 13, color: MUTED, letterSpacing: "0.06em" }}>
          OFF {result.ballsBowled} BALLS · {result.wickets}/10 WICKETS
        </div>
        {result.ballsBowled > 0 && (
          <div style={{ ...MONO, fontSize: 11, color: DIM, marginTop: 4 }}>
            STRIKE RATE {((result.runs / result.ballsBowled) * 100).toFixed(1)}
          </div>
        )}
      </div>

      {/* Coin payout */}
      <div style={{
        background: CARD, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: "14px 16px",
        marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ ...MONO, fontSize: 10, color: DIM, letterSpacing: "0.08em" }}>COINS EARNED</div>
          <div style={{ ...MONO, fontSize: 24, color: GOLD, fontWeight: 700, marginTop: 4 }}>
            +{result.coinsAwarded.toLocaleString("en-IN")}
          </div>
          {result.bonusKind && (
            <div style={{ ...MONO, fontSize: 10, color: AMBER, marginTop: 4 }}>
              {result.bonusKind === "DOUBLE_TON" ? "Double-ton bonus" : "Century bonus"}: +{result.bonusCoins}
            </div>
          )}
        </div>
        <Coins size={32} color={GOLD} />
      </div>

      {/* Today's leaderboard with user rank */}
      {result.todayLeaderboard.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ ...MONO, fontSize: 11, color: GOLD, letterSpacing: "0.06em" }}>TODAY'S LEADERBOARD</span>
            {result.userRankToday && (
              <span style={{ ...MONO, fontSize: 11, color: GREEN }}>YOU #{result.userRankToday}</span>
            )}
          </div>
          {result.todayLeaderboard.slice(0, 5).map((r, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0", borderBottom: i < Math.min(result.todayLeaderboard.length, 5) - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <span style={{ ...MONO, fontSize: 12, color: TEXT }}>
                <span style={{ color: GOLD, marginRight: 6 }}>{["🥇","🥈","🥉"][i] || `#${r.rank}`}</span>
                {r.name || "Anonymous"}
              </span>
              <span style={{ ...MONO, fontSize: 12, color: GREEN, fontWeight: 700 }}>
                {r.runs} <span style={{ color: DIM, fontSize: 10 }}>off {r.balls}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <button onClick={handleShare} style={{
          background: "transparent", border: `1.5px solid ${BLUE}`, color: BLUE,
          padding: "12px", borderRadius: 8, ...MONO, fontSize: 13, fontWeight: 700,
          letterSpacing: "0.06em", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <Share2 size={14} /> SHARE
        </button>
        <button onClick={onPlayAgain} style={{
          background: GREEN, border: "none", color: "#000",
          padding: "12px", borderRadius: 8, ...MONO, fontSize: 13, fontWeight: 700,
          letterSpacing: "0.06em", cursor: "pointer",
        }}>
          ▶ NEXT MATCH
        </button>
      </div>

      <Disclaimer />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* BLOCKED (daily cap reached)                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

function BlockedView({ state, onExit }: { state: StateResp | null; onExit?: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, ...SANS, padding: "16px 16px 100px" }}>
      <TopBar onExit={onExit} />
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛌</div>
        <h2 style={{ ...MONO, fontSize: 16, color: AMBER, letterSpacing: "0.06em", marginBottom: 8 }}>
          DAILY CAP REACHED
        </h2>
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
          You've played all {state?.dailyCap ?? 5} matches today.<br/>
          Career best: <span style={{ ...MONO, color: GOLD, fontWeight: 700 }}>{state?.careerBest ?? 0} runs</span>.<br/>
          Come back tomorrow for fresh innings.
        </p>
      </div>
      <Disclaimer />
    </div>
  );
}

/* ─── Shared shells ─── */

function TopBar({ onExit }: { onExit?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
      {onExit && (
        <button
          onClick={onExit}
          style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: "6px 8px 6px 0", display: "flex", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft size={16} />
          <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.06em" }}>BACK</span>
        </button>
      )}
    </div>
  );
}

function Disclaimer() {
  return (
    <div style={{
      marginTop: 24, padding: "10px 12px",
      background: "rgba(59,158,255,0.05)", border: `1px solid ${BLUE}20`, borderRadius: 6,
    }}>
      <div style={{ ...MONO, fontSize: 9, color: BLUE, letterSpacing: "0.08em", marginBottom: 4 }}>
        ℹ️ FOR ENTERTAINMENT ONLY · NOT INVESTMENT ADVICE
      </div>
      <div style={{ ...SANS, fontSize: 10, color: DIM, lineHeight: 1.5 }}>
        Dalal Street T20 is a virtual coin reaction game using historical chart data.
        Past performance is not indicative of future results. Investment in securities markets
        are subject to market risks; read all related documents carefully before investing.
      </div>
    </div>
  );
}

export default DalalStreetT20;
