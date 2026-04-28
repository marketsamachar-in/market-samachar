/**
 * CHARTGUESSR — Guess the Stock from an unlabeled price chart.
 * 30 rounds/day max. +20 correct, −5 wrong, streak bonuses at 5/10/20.
 */

import React, { useEffect, useState, type CSSProperties } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Coins, Flame, RefreshCw, Check, X } from "lucide-react";

/* ─── Tokens ─── */
const BG     = "#07070e";
const CARD   = "#0d0d1e";
const BORDER = "#1e1e2e";
const GREEN  = "#00ff88";
const RED    = "#ff4466";
const TEXT   = "#e8eaf0";
const MUTED  = "#888899";
const DIM    = "#444455";
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface Point { t: number; c: number; }
interface Round {
  ok: boolean;
  roundId?: string;
  points?:  Point[];
  choices?: string[];
  streak?:  number;
  playsToday?: number;
  dailyLimit?: number;
  reason?:   string;
  message?:  string;
  error?:    string;
}
interface AnswerResult {
  ok: boolean;
  wasCorrect: boolean;
  correctSymbol: string;
  coinsDelta:    number;
  bonusReason:   string | null;
  streak:        number;
  balance:       number;
  playsToday:    number;
  dailyLimit:    number;
}
interface Props { authToken?: string; }

const Chartguessr: React.FC<Props> = ({ authToken }) => {
  const [round,  setRound]  = useState<Round | null>(null);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [err,    setErr]    = useState<string | null>(null);

  const headers = (): HeadersInit =>
    authToken ? { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }
              : { "Content-Type": "application/json" };

  const startRound = async () => {
    if (!authToken) return;
    setLoading(true); setErr(null); setResult(null);
    try {
      const r = await fetch("/api/chartguessr/round", { headers: headers() });
      const data = await r.json() as Round;
      setRound(data);
      if (!data.ok && data.reason !== "daily_limit") setErr(data.error ?? "Failed to start round");
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { startRound(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authToken]);

  const submit = async (choice: string) => {
    if (!round?.roundId || answering) return;
    setAnswering(true);
    try {
      const r = await fetch("/api/chartguessr/answer", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ roundId: round.roundId, choice }),
      });
      const data = await r.json() as AnswerResult;
      if (data.ok) setResult(data);
      else setErr((data as any).error ?? "Answer failed");
    } catch {
      setErr("Network error");
    } finally {
      setAnswering(false);
    }
  };

  if (!authToken) {
    return (
      <div style={pageWrap}>
        <h1 style={titleStyle}>📊 CHARTGUESSR</h1>
        <p style={subtitleStyle}>Sign in to play.</p>
      </div>
    );
  }

  // Daily limit hit
  if (round && !round.ok && round.reason === "daily_limit") {
    return (
      <div style={pageWrap}>
        <h1 style={titleStyle}>📊 CHARTGUESSR</h1>
        <div style={emptyCard}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
          <div style={{ ...MONO, color: TEXT, fontSize: 14, letterSpacing: "0.08em", marginBottom: 8 }}>
            DAILY LIMIT REACHED
          </div>
          <div style={{ ...SANS, color: MUTED, fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
            {round.message ?? "Come back tomorrow for more rounds!"}
          </div>
        </div>
      </div>
    );
  }

  const points  = round?.points ?? [];
  const choices = round?.choices ?? [];
  const up = points.length > 1 ? points[points.length - 1].c >= points[0].c : true;
  const lineCol = up ? GREEN : RED;

  return (
    <div style={pageWrap}>
      <style>{INJ_CSS}</style>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 14 }}>
        <h1 style={titleStyle}>📊 CHARTGUESSR</h1>
        <p style={subtitleStyle}>Which stock is this? +20 correct · −5 wrong · streak bonuses</p>
      </div>

      {/* Stats */}
      {round?.ok && (
        <div style={statsBar}>
          <div style={statChip}>
            <div style={statLabel}><Flame size={11} /> STREAK</div>
            <div style={{ ...statVal, color: (round.streak ?? 0) >= 3 ? "#ff9f3b" : TEXT }}>
              {(round.streak ?? 0) >= 3 ? "🔥" : ""} {round.streak ?? 0}
            </div>
          </div>
          <div style={statChip}>
            <div style={statLabel}>TODAY</div>
            <div style={statVal}>{round.playsToday ?? 0} / {round.dailyLimit ?? 30}</div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={chartWrap}>
        {loading && <div style={emptyState}>Loading chart…</div>}
        {!loading && err && <div style={{ ...emptyState, color: RED }}>{err}</div>}
        {!loading && !err && points.length < 2 && <div style={emptyState}>No chart data — try again</div>}
        {!loading && points.length >= 2 && (
          <>
            <div style={{ position: "absolute", top: 8, left: 12, ...MONO, color: DIM, fontSize: 9, letterSpacing: "0.08em" }}>
              30-DAY CHART · ANONYMOUS
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 22, right: 10, left: 0, bottom: 6 }}>
                <defs>
                  <linearGradient id="cg-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={lineCol} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={lineCol} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={BORDER} strokeDasharray="2 4" vertical={false} />
                {/* Hide axis values to keep it a "guess the stock" puzzle */}
                <XAxis dataKey="t" tick={false} axisLine={{ stroke: BORDER }} />
                <YAxis  tick={false} axisLine={false} tickLine={false} width={0} />
                <Area type="monotone" dataKey="c" stroke={lineCol} strokeWidth={1.6}
                      fill="url(#cg-fill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* 4 choice buttons OR result panel */}
      {!result ? (
        <div style={choiceGrid}>
          {choices.map((sym) => (
            <button
              key={sym} onClick={() => submit(sym)}
              disabled={answering || loading} className="cg-choice"
            >
              {sym}
            </button>
          ))}
        </div>
      ) : (
        <div className="cg-result" style={{
          ...resultPanel,
          borderColor: result.wasCorrect ? GREEN + "60" : RED + "60",
          background:  result.wasCorrect ? "rgba(0,255,136,0.06)" : "rgba(255,68,102,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {result.wasCorrect
              ? <Check size={20} color={GREEN} strokeWidth={3} />
              : <X size={20} color={RED} strokeWidth={3} />}
            <span style={{
              ...MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
              color: result.wasCorrect ? GREEN : RED,
            }}>
              {result.wasCorrect ? "CORRECT" : "WRONG"}
            </span>
            <span style={{ marginLeft: "auto", ...MONO, fontSize: 13, fontWeight: 700,
                           color: result.coinsDelta >= 0 ? GREEN : RED }}>
              {result.coinsDelta >= 0 ? "+" : ""}{result.coinsDelta} 🪙
            </span>
          </div>
          <div style={{ ...SANS, color: TEXT, fontSize: 13 }}>
            That was <span style={{ ...MONO, color: GREEN, fontWeight: 700 }}>${result.correctSymbol}</span>
          </div>
          {result.bonusReason && (
            <div style={{ ...MONO, color: "#ff9f3b", fontSize: 11, marginTop: 4, letterSpacing: "0.06em" }}>
              {result.bonusReason}
            </div>
          )}
          <button onClick={startRound} className="cg-next">
            <RefreshCw size={13} /> NEXT ROUND
          </button>
        </div>
      )}

      {/* Bottom balance */}
      {result && (
        <div style={{ textAlign: "center", color: MUTED, ...MONO, fontSize: 11, marginTop: 10, letterSpacing: "0.06em" }}>
          BALANCE · <span style={{ color: GREEN }}>{result.balance.toLocaleString("en-IN")} 🪙</span>
        </div>
      )}
    </div>
  );
};

/* ─── Styles ─── */
const pageWrap: CSSProperties = {
  minHeight: "calc(100vh - 112px)", padding: "16px 14px 80px",
  background: BG, ...SANS, maxWidth: 480, margin: "0 auto",
};
const titleStyle: CSSProperties = {
  ...MONO, color: TEXT, fontSize: 22, fontWeight: 700,
  letterSpacing: "0.1em", margin: 0,
};
const subtitleStyle: CSSProperties = {
  ...SANS, color: MUTED, fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 0,
};
const statsBar: CSSProperties = { display: "flex", gap: 8, marginBottom: 14 };
const statChip: CSSProperties = {
  flex: 1, background: CARD, border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: "8px 10px",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
};
const statLabel: CSSProperties = {
  color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.08em",
  display: "flex", alignItems: "center", gap: 4,
};
const statVal: CSSProperties = { color: TEXT, ...MONO, fontSize: 13, fontWeight: 600 };
const chartWrap: CSSProperties = {
  position: "relative", height: 240, background: CARD,
  border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 14, overflow: "hidden",
};
const emptyState: CSSProperties = {
  height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  ...MONO, color: DIM, fontSize: 11, letterSpacing: "0.08em",
};
const emptyCard: CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: "30px 20px", display: "flex", flexDirection: "column",
  alignItems: "center", marginTop: 24,
};
const choiceGrid: CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
};
const resultPanel: CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: 14, animation: "cg-pop 0.25s ease-out",
};

const INJ_CSS = `
.cg-choice {
  background: ${CARD}; border: 1px solid ${BORDER}; color: ${TEXT};
  font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
  padding: 16px 8px; border-radius: 10; cursor: pointer; transition: all 0.15s;
}
.cg-choice:not(:disabled):hover {
  border-color: ${GREEN}; color: ${GREEN}; background: rgba(0,255,136,0.05);
  transform: translateY(-1px);
}
.cg-choice:disabled { opacity: 0.45; cursor: not-allowed; }

.cg-next {
  margin-top: 12px; width: 100%; padding: 10px;
  background: rgba(0,255,136,0.08); border: 1px solid ${GREEN}40; color: ${GREEN};
  font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em;
  border-radius: 8; cursor: pointer; transition: all 0.15s;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.cg-next:hover { background: rgba(0,255,136,0.15); border-color: ${GREEN}; }

@keyframes cg-pop { from { transform: scale(0.97); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
`;

export default Chartguessr;
