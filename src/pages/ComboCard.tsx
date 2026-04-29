/**
 * COMBO CARD — Daily 5-question prediction lottery.
 *
 *   Submit 5 picks before 09:30 IST.  Settles at 15:35 IST.
 *   Payout: 3/5 = 100 · 4/5 = 500 · 5/5 = 5,000 coins.
 */

import React, { useEffect, useState, type CSSProperties } from "react";
import { Coins, Lock, Check, X, Clock, Trophy, RefreshCw } from "lucide-react";

/* ─── Tokens ─── */
const BG     = "#07070e";
const CARD   = "#0d0d1e";
const BORDER = "#1e1e2e";
const GREEN  = "#00ff88";
const RED    = "#ff4466";
const AMBER  = "#ff9f3b";
const BLUE   = "#3b9eff";
const GOLD   = "#ffcc44";
const TEXT   = "#e8eaf0";
const MUTED  = "#888899";
const DIM    = "#444455";
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

/* ─── Types ─── */
type Direction = "UP" | "DOWN";
type Sector =
  | "AUTO" | "BANK" | "FMCG" | "IT" | "PHARMA" | "ENERGY" | "REALTY";

interface UserPick {
  pick_nifty:     Direction;
  pick_banknifty: Direction;
  pick_usdinr:    Direction;
  pick_gold:      Direction;
  pick_sector:    Sector;
  score:          number | null;
  coins_awarded:  number;
  submitted_at:   number;
  settled:        boolean;
}

interface CardState {
  ok:             boolean;
  date:           string;
  cutoffMs:       number;
  nowMs:          number;
  submissionOpen: boolean;
  reason?:        string;
  userPick:       UserPick | null;
  answers:        {
    nifty:     Direction | null;
    banknifty: Direction | null;
    usdinr:    Direction | null;
    gold:      Direction | null;
    sector:    Sector | null;
  } | null;
  payouts:        { x3: number; x4: number; x5: number };
  sectors:        Sector[];
}

interface Props { authToken?: string; }

/* ─── UI tokens ─── */
const SECTOR_LABEL: Record<Sector, string> = {
  AUTO:    "Auto",
  BANK:    "Bank",
  FMCG:    "FMCG",
  IT:      "IT",
  PHARMA:  "Pharma",
  ENERGY:  "Energy",
  REALTY:  "Realty",
};
const SECTOR_EMOJI: Record<Sector, string> = {
  AUTO: "🚗", BANK: "🏦", FMCG: "🛒", IT: "💻", PHARMA: "💊", ENERGY: "⚡", REALTY: "🏠",
};

const QUESTIONS: ReadonlyArray<{
  key: "pick_nifty" | "pick_banknifty" | "pick_usdinr" | "pick_gold";
  label: string;
  emoji: string;
}> = [
  { key: "pick_nifty",     label: "Nifty 50",  emoji: "📈" },
  { key: "pick_banknifty", label: "Bank Nifty", emoji: "🏦" },
  { key: "pick_usdinr",    label: "USD/INR",    emoji: "💱" },
  { key: "pick_gold",      label: "Gold",       emoji: "🥇" },
];

/* ─── Helpers ─── */
function fmtCutoff(ms: number): string {
  const d  = new Date(ms);
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h  = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${String(mm).padStart(2, "0")}m`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ComboCard: React.FC<Props> = ({ authToken }) => {
  const [state,    setState]    = useState<CardState | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [picks,    setPicks]    = useState<{
    pick_nifty?:     Direction;
    pick_banknifty?: Direction;
    pick_usdinr?:    Direction;
    pick_gold?:      Direction;
    pick_sector?:    Sector;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [err,        setErr]        = useState<string | null>(null);
  const [tick,       setTick]       = useState(0);

  const headers = (): HeadersInit =>
    authToken
      ? { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }
      : { "Content-Type": "application/json" };

  const load = async () => {
    if (!authToken) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/combo/today", { headers: headers() });
      const data = await r.json() as CardState;
      setState(data);
      if (!data.ok) setErr("Failed to load today's card");
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authToken]);

  // 1Hz countdown timer
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const allPicked =
    !!picks.pick_nifty && !!picks.pick_banknifty && !!picks.pick_usdinr &&
    !!picks.pick_gold  && !!picks.pick_sector;

  const submit = async () => {
    if (!authToken || !allPicked || submitting) return;
    setSubmitting(true); setErr(null);
    try {
      const r = await fetch("/api/combo/submit", {
        method: "POST", headers: headers(), body: JSON.stringify(picks),
      });
      const data = await r.json();
      if (!data.ok) {
        setErr(data.error || "Submission failed");
      } else {
        await load();
        setPicks({});
      }
    } catch {
      setErr("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Sign-in gate ─── */
  if (!authToken) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: TEXT, ...SANS }}>
        <div style={{ fontSize: 38, marginBottom: 12 }}>🎯</div>
        <h2 style={{ fontSize: 18, marginBottom: 6, ...MONO, letterSpacing: "0.04em" }}>COMBO CARD</h2>
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.5 }}>
          5 questions. One tap each. Settles at market close.
          <br />Sign in to play and earn coins.
        </p>
      </div>
    );
  }

  /* ─── Loading ─── */
  if (loading || !state) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: MUTED, ...MONO, fontSize: 12 }}>
        LOADING…
      </div>
    );
  }

  const cutoffStr   = fmtCutoff(state.cutoffMs);
  const msToCutoff  = state.cutoffMs - (state.nowMs + tick * 1000);
  const showCountdown = state.submissionOpen && msToCutoff > 0 && msToCutoff < 60 * 60 * 1000;

  /* ─── State A: User has submitted (settled or pending) ─── */
  if (state.userPick) {
    return <SubmittedView state={state} cutoffStr={cutoffStr} onRefresh={load} />;
  }

  /* ─── State B: Submission closed ─── */
  if (!state.submissionOpen) {
    return <ClosedView state={state} cutoffStr={cutoffStr} />;
  }

  /* ─── State C: Open — pick form ─── */
  return (
    <div style={{ padding: "16px 16px 100px", color: TEXT, ...SANS, maxWidth: 720, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 24 }}>🎯</span>
          <h1 style={{ ...MONO, fontSize: 16, letterSpacing: "0.06em", margin: 0, fontWeight: 700, color: GREEN }}>
            COMBO CARD
          </h1>
        </div>
        <div style={{ ...MONO, fontSize: 11, color: MUTED, letterSpacing: "0.04em" }}>
          ONE PLAY PER DAY · 5 QUESTIONS · SETTLES AT 15:35 IST
        </div>
      </div>

      {/* Countdown / cutoff banner */}
      <div style={{
        background: showCountdown ? "rgba(255,159,59,0.08)" : "rgba(0,255,136,0.05)",
        border: `1px solid ${showCountdown ? AMBER : GREEN}30`,
        borderRadius: 8, padding: "10px 12px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Clock size={16} color={showCountdown ? AMBER : GREEN} />
        <div style={{ flex: 1 }}>
          <div style={{ ...MONO, fontSize: 11, color: showCountdown ? AMBER : GREEN, letterSpacing: "0.06em" }}>
            {showCountdown ? "CUTOFF SOON" : "SUBMISSIONS OPEN"}
          </div>
          <div style={{ ...SANS, fontSize: 12, color: MUTED, marginTop: 2 }}>
            {showCountdown
              ? <>Submit by {cutoffStr} — <span style={{ ...MONO, color: AMBER, fontWeight: 700 }}>{fmtCountdown(msToCutoff)}</span> left</>
              : <>Submit anytime before {cutoffStr}</>}
          </div>
        </div>
      </div>

      {/* Payout legend */}
      <PayoutLegend payouts={state.payouts} />

      {/* 4 direction questions */}
      {QUESTIONS.map((q, idx) => (
        <DirectionQuestion
          key={q.key}
          index={idx + 1}
          label={q.label}
          emoji={q.emoji}
          value={picks[q.key]}
          onChange={(d) => setPicks((p) => ({ ...p, [q.key]: d }))}
        />
      ))}

      {/* Sector question */}
      <SectorQuestion
        index={5}
        sectors={state.sectors}
        value={picks.pick_sector}
        onChange={(s) => setPicks((p) => ({ ...p, pick_sector: s }))}
      />

      {/* Submit */}
      <button
        disabled={!allPicked || submitting}
        onClick={submit}
        style={{
          width: "100%", marginTop: 8, padding: "14px",
          background: allPicked ? GREEN : "#1a1a2e",
          color: allPicked ? "#000" : DIM, border: "none", borderRadius: 8,
          ...MONO, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em",
          cursor: allPicked && !submitting ? "pointer" : "not-allowed",
          transition: "all 0.15s",
        }}
      >
        {submitting ? "SUBMITTING…" : allPicked ? "🔒 LOCK IN PICKS" : `${5 - countPicks(picks)} MORE TO GO`}
      </button>

      {err && (
        <div style={{
          marginTop: 12, padding: "10px 12px", background: "rgba(255,68,102,0.08)",
          border: `1px solid ${RED}30`, borderRadius: 6, color: RED, ...MONO, fontSize: 12,
        }}>{err}</div>
      )}

      {/* Disclaimer */}
      <Disclaimer />
    </div>
  );
};

/* ─── Sub-components ─── */

function PayoutLegend({ payouts }: { payouts: { x3: number; x4: number; x5: number } }) {
  const cell = (label: string, coins: number, color: string) => (
    <div style={{
      flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6,
      padding: "8px 6px", textAlign: "center",
    }}>
      <div style={{ ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ ...MONO, fontSize: 14, color, fontWeight: 700, marginTop: 3 }}>
        {coins.toLocaleString("en-IN")}
      </div>
      <div style={{ ...MONO, fontSize: 8, color: DIM, marginTop: 1 }}>COINS</div>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {cell("3/5", payouts.x3, GREEN)}
      {cell("4/5", payouts.x4, AMBER)}
      {cell("5/5 🔥", payouts.x5, GOLD)}
    </div>
  );
}

function DirectionQuestion({
  index, label, emoji, value, onChange,
}: {
  index: number; label: string; emoji: string;
  value: Direction | undefined;
  onChange: (d: Direction) => void;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: "12px 14px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ ...MONO, fontSize: 11, color: DIM, fontWeight: 700 }}>Q{index}</span>
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span style={{ ...SANS, fontSize: 14, fontWeight: 600, color: TEXT }}>
          Will <span style={{ color: GREEN }}>{label}</span> close higher today?
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <DirBtn label="UP"   selected={value === "UP"}   onClick={() => onChange("UP")}   color={GREEN} />
        <DirBtn label="DOWN" selected={value === "DOWN"} onClick={() => onChange("DOWN")} color={RED}   />
      </div>
    </div>
  );
}

function DirBtn({
  label, selected, color, onClick,
}: { label: string; selected: boolean; color: string; onClick: () => void; }) {
  const arrow = label === "UP" ? "▲" : "▼";
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? `${color}18` : "transparent",
        border: `1.5px solid ${selected ? color : BORDER}`,
        color: selected ? color : MUTED,
        borderRadius: 6, padding: "10px 0",
        ...MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {arrow} {label}
    </button>
  );
}

function SectorQuestion({
  index, sectors, value, onChange,
}: {
  index: number; sectors: Sector[];
  value: Sector | undefined; onChange: (s: Sector) => void;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: "12px 14px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ ...MONO, fontSize: 11, color: DIM, fontWeight: 700 }}>Q{index}</span>
        <span style={{ fontSize: 16 }}>🏆</span>
        <span style={{ ...SANS, fontSize: 14, fontWeight: 600, color: TEXT }}>
          Which sector tops today?
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6 }}>
        {sectors.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              background: value === s ? `${GREEN}18` : "transparent",
              border: `1.5px solid ${value === s ? GREEN : BORDER}`,
              color: value === s ? GREEN : MUTED,
              borderRadius: 6, padding: "8px 4px",
              ...MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              cursor: "pointer", transition: "all 0.15s",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}
          >
            <span style={{ fontSize: 16 }}>{SECTOR_EMOJI[s]}</span>
            <span>{SECTOR_LABEL[s].toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function countPicks(p: Partial<{
  pick_nifty: Direction; pick_banknifty: Direction; pick_usdinr: Direction;
  pick_gold:  Direction; pick_sector:    Sector;
}>): number {
  return (p.pick_nifty?1:0) + (p.pick_banknifty?1:0) + (p.pick_usdinr?1:0) +
         (p.pick_gold?1:0)  + (p.pick_sector?1:0);
}

/* ─── Already-submitted view ─── */

function SubmittedView({
  state, cutoffStr, onRefresh,
}: {
  state: CardState; cutoffStr: string; onRefresh: () => void;
}) {
  const u  = state.userPick!;
  const a  = state.answers;
  const settled = u.settled && !!a;

  const rowDir = (
    label: string, emoji: string, pick: Direction, answer: Direction | null,
  ) => {
    const correct = answer != null && pick === answer;
    return (
      <Row
        label={label}
        emoji={emoji}
        pick={`${pick === "UP" ? "▲" : "▼"} ${pick}`}
        answer={answer == null ? null : `${answer === "UP" ? "▲" : "▼"} ${answer}`}
        correct={settled ? correct : null}
      />
    );
  };

  const score = u.score;
  const coins = u.coins_awarded;

  return (
    <div style={{ padding: "16px 16px 100px", color: TEXT, ...SANS, maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>{settled ? (score === 5 ? "🏆" : score! >= 3 ? "✅" : "🎯") : "🔒"}</span>
          <h1 style={{ ...MONO, fontSize: 16, letterSpacing: "0.06em", margin: 0, fontWeight: 700, color: GREEN }}>
            COMBO CARD
          </h1>
          <button
            onClick={onRefresh}
            style={{
              marginLeft: "auto", background: "none", border: `1px solid ${BORDER}`,
              color: MUTED, borderRadius: 4, padding: "5px 8px", cursor: "pointer",
            }}
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <div style={{ ...MONO, fontSize: 11, color: MUTED, marginTop: 4, letterSpacing: "0.04em" }}>
          {state.date} · LOCKED IN AT {fmtCutoff(u.submitted_at)}
        </div>
      </div>

      {/* Score panel */}
      <div style={{
        background: CARD, border: `1px solid ${settled ? GREEN : BORDER}`,
        borderRadius: 10, padding: "16px 14px", marginBottom: 14, textAlign: "center",
      }}>
        {settled ? (
          <>
            <div style={{ ...MONO, fontSize: 11, color: DIM, letterSpacing: "0.1em" }}>YOUR SCORE</div>
            <div style={{ ...MONO, fontSize: 32, color: score! >= 3 ? GREEN : MUTED, fontWeight: 700, marginTop: 4 }}>
              {score}<span style={{ color: DIM, fontSize: 22 }}> / 5</span>
            </div>
            {coins > 0 && (
              <div style={{
                marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(255,204,68,0.1)", border: `1px solid ${GOLD}40`,
                borderRadius: 20, padding: "5px 12px",
              }}>
                <Coins size={14} color={GOLD} />
                <span style={{ ...MONO, fontSize: 13, color: GOLD, fontWeight: 700 }}>
                  +{coins.toLocaleString("en-IN")} coins
                </span>
              </div>
            )}
            {coins === 0 && (
              <div style={{ marginTop: 8, ...SANS, fontSize: 12, color: MUTED }}>
                No payout this round — try again tomorrow.
              </div>
            )}
          </>
        ) : (
          <>
            <Lock size={20} color={MUTED} />
            <div style={{ ...MONO, fontSize: 12, color: MUTED, marginTop: 8, letterSpacing: "0.04em" }}>
              PICKS LOCKED · SETTLES AT 15:35 IST
            </div>
            <div style={{ ...SANS, fontSize: 12, color: DIM, marginTop: 4 }}>
              We'll grade your card at market close.
            </div>
          </>
        )}
      </div>

      {/* Pick rows */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px 12px" }}>
        {rowDir("Nifty 50",   "📈", u.pick_nifty,     a?.nifty     ?? null)}
        {rowDir("Bank Nifty", "🏦", u.pick_banknifty, a?.banknifty ?? null)}
        {rowDir("USD/INR",    "💱", u.pick_usdinr,    a?.usdinr    ?? null)}
        {rowDir("Gold",       "🥇", u.pick_gold,      a?.gold      ?? null)}
        <Row
          label="Top Sector"
          emoji="🏆"
          pick={`${SECTOR_EMOJI[u.pick_sector]} ${SECTOR_LABEL[u.pick_sector]}`}
          answer={a?.sector ? `${SECTOR_EMOJI[a.sector]} ${SECTOR_LABEL[a.sector]}` : null}
          correct={settled ? u.pick_sector === a?.sector : null}
          isLast
        />
      </div>

      <Disclaimer />
    </div>
  );
}

function Row({
  label, emoji, pick, answer, correct, isLast,
}: {
  label: string; emoji: string;
  pick: string; answer: string | null;
  correct: boolean | null;
  isLast?: boolean;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto auto",
      gap: 10, alignItems: "center", padding: "10px 0",
      borderBottom: isLast ? "none" : `1px solid ${BORDER}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ ...SANS, fontSize: 13, color: TEXT, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ ...MONO, fontSize: 12, color: MUTED, textAlign: "right" }}>
        <span style={{ color: DIM, fontSize: 9, letterSpacing: "0.08em", display: "block" }}>YOU</span>
        {pick}
      </div>
      {answer == null ? (
        <div style={{ width: 28, textAlign: "center", color: DIM, ...MONO, fontSize: 11 }}>—</div>
      ) : (
        <div style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          background: correct ? `${GREEN}18` : `${RED}18`,
          border: `1px solid ${correct ? GREEN : RED}40`,
          color: correct ? GREEN : RED,
        }}>
          {correct ? <Check size={14} /> : <X size={14} />}
        </div>
      )}
    </div>
  );
}

/* ─── Closed view (weekend / past cutoff) ─── */

function ClosedView({ state, cutoffStr }: { state: CardState; cutoffStr: string }) {
  const isWknd = state.reason === "non_trading_day";
  return (
    <div style={{ padding: "40px 20px 100px", textAlign: "center", color: TEXT, ...SANS, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>{isWknd ? "🛌" : "🔒"}</div>
      <h2 style={{ ...MONO, fontSize: 16, marginBottom: 6, color: GREEN, letterSpacing: "0.06em" }}>
        {isWknd ? "MARKETS CLOSED" : "SUBMISSIONS CLOSED"}
      </h2>
      <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
        {isWknd
          ? "Combo Card runs on NSE trading days only. Come back Monday."
          : <>Today's combo locked at <span style={{ ...MONO, color: TEXT }}>{cutoffStr}</span>. Try again tomorrow before market open.</>}
      </p>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: "10px 16px",
      }}>
        <Trophy size={16} color={GOLD} />
        <span style={{ ...MONO, fontSize: 12, color: MUTED, letterSpacing: "0.04em" }}>
          NEXT CARD OPENS AT MARKET OPEN
        </span>
      </div>
      <Disclaimer />
    </div>
  );
}

/* ─── SEBI/RBI advisory footer ─── */

function Disclaimer() {
  return (
    <div style={{
      marginTop: 24, padding: "10px 12px",
      background: "rgba(59,158,255,0.05)", border: `1px solid ${BLUE}20`,
      borderRadius: 6,
    }}>
      <div style={{ ...MONO, fontSize: 9, color: BLUE, letterSpacing: "0.08em", marginBottom: 4 }}>
        ℹ️ NOT INVESTMENT ADVICE · FOR ENTERTAINMENT ONLY
      </div>
      <div style={{ ...SANS, fontSize: 10, color: DIM, lineHeight: 1.5 }}>
        Combo Card is a virtual coin prediction game. Picks do not constitute trading advice
        or recommendations. Investment in securities markets are subject to market risks. Read all
        related documents carefully before investing.
      </div>
    </div>
  );
}

export default ComboCard;
