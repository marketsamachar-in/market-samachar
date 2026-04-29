/**
 * RewardsHub — unified engagement stats and coin economy dashboard.
 * Shows balance, today's tasks, weekly earnings chart, activity feed,
 * achievements, and referral section.
 */

import React, {
  useState, useEffect, useRef, useCallback, type CSSProperties,
} from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  CheckCircle2, Circle, TrendingUp, Star, Gift, Share2,
  Copy, Check, RefreshCw, Zap, Brain, Activity, Lock, Trophy,
  Flame, BarChart2,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  getTitleFromIQ,
  getNextTitle,
  pointsToNextTier,
  IQ_MAX,
} from "../lib/iq-calculator";
import { APP_URL, BRAND_HOST } from "../lib/config";
import { buildShareUrl } from "../lib/referral";

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG     = "#07070e";
const CARD   = "#0d0d1e";
const BORDER = "#1e1e2e";
const GREEN  = "#00ff88";
const RED    = "#ff4466";
const YELLOW = "#ffdd3b";
const BLUE   = "#3b9eff";
const ORANGE = "#ff9f3b";
const PURPLE = "#b366ff";
const TEXT   = "#e8eaf0";
const MUTED  = "#888899";
const DIM    = "#444455";
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: number;
  action_type: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: number;
}

interface WeeklyDay {
  date: string;
  total: number;
  bySource: {
    quiz: number;
    predictions: number;
    trading: number;
    streak: number;
    other: number;
  };
}

interface HubData {
  virtualBalance: number;
  coinLedger: LedgerEntry[];
  weeklyBreakdown: WeeklyDay[];
  todayTasks: {
    login: boolean;
    quiz: boolean;
    prediction: boolean;
    trade: boolean;
    streak: boolean;
  };
  referralCode: string;
  referralCount: number;
  achievements: {
    firstTrade:       { unlocked: boolean; unlockedAt: number | null };
    sevenDayStreak:   { unlocked: boolean; unlockedAt: number | null };
    predictionStreak: { unlocked: boolean; unlockedAt: number | null };
    quizMaster:       { unlocked: boolean; unlockedAt: number | null };
  };
  stats: {
    tradeCount: number;
    quizCount: number;
    correctPredictions: number;
    maxStreak: number;
  };
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!target) return;
    const start = performance.now();
    const from  = current;
    const step  = (ts: number) => {
      const prog = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setCurrent(Math.round(from + (target - from) * ease));
      if (prog < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return current;
}

// ─── Circular progress ────────────────────────────────────────────────────────

function CircularProgress({
  pct, size = 88, stroke = 6, color, children,
}: {
  pct: number; size?: number; stroke?: number; color: string; children?: React.ReactNode;
}) {
  const r  = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Coin badge ───────────────────────────────────────────────────────────────

function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size,
        background: "linear-gradient(135deg, #ffdd3b, #ff9f3b)",
        borderRadius: "50%",
        fontSize: size * 0.55,
        flexShrink: 0,
      }}
    >
      🪙
    </span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, accent = GREEN }: { icon: React.ReactNode; label: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span style={{ color: accent }}>{icon}</span>
      <span style={{ color: accent, ...MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
  );
}

// ─── Action label map ─────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; emoji: string; color: string }> = {
  QUIZ_CORRECT:       { label: "Market Quiz correct (1X)",       emoji: "🧠", color: PURPLE },
  QUIZ_BONUS:         { label: "Perfect Score bonus (3X)",       emoji: "🧠", color: PURPLE },
  DAILY_STREAK:       { label: "Daily streak bonus",             emoji: "🔥", color: ORANGE },
  PREDICTION_VOTE:    { label: "Made a prediction (1X)",         emoji: "🎯", color: BLUE },
  PREDICTION_CORRECT: { label: "Correct prediction! (3X)",      emoji: "✅", color: GREEN },
  VIRTUAL_TRADE:      { label: "Executed a trade",               emoji: "📈", color: GREEN },
  PORTFOLIO_PROFIT:   { label: "Portfolio profit bonus (5X)",    emoji: "💰", color: YELLOW },
  NEWS_IMPACT_CORRECT:{ label: "News Impact quiz (1X)",          emoji: "📰", color: BLUE },
  IPO_PREDICTION:     { label: "IPO prediction (1X)",            emoji: "🏢", color: ORANGE },
  IPO_CORRECT:        { label: "Correct IPO call! (5X)",         emoji: "✅", color: GREEN },
  REFERRAL:           { label: "Referral bonus (5X)",            emoji: "🎁", color: YELLOW },
  ADMIN_GRANT:        { label: "Admin bonus",                    emoji: "⭐", color: YELLOW },
  PURCHASE:           { label: "Coin purchase",                  emoji: "💳", color: BLUE },
  FIRST_LOGIN:        { label: "Welcome bonus — 10X! 🎉",       emoji: "🎉", color: GREEN },
  DAILY_LOGIN:        { label: "Daily login reward (1X)",        emoji: "📅", color: ORANGE },
  PULSE_SWIPE:        { label: "Pulse swipe",                    emoji: "⚡", color: ORANGE },
  PULSE_CORRECT:      { label: "Pulse direction correct",        emoji: "✅", color: GREEN },
  CHARTGUESSR_CORRECT:{ label: "Chartguessr correct",            emoji: "📊", color: BLUE },
  CHARTGUESSR_WRONG:  { label: "Chartguessr penalty",            emoji: "❌", color: RED },
  CHARTGUESSR_STREAK: { label: "Chartguessr streak bonus",       emoji: "🔥", color: ORANGE },
  POLL_VOTE:          { label: "Poll vote",                      emoji: "🗳️", color: PURPLE },
  POLL_VOTE_BONUS:    { label: "Poll streak bonus",              emoji: "🗳️", color: PURPLE },
  SHARE_ARTICLE:      { label: "Article shared",                 emoji: "🔗", color: PURPLE },
  SHARE_ARTICLE_BONUS:{ label: "Share streak bonus",             emoji: "🔗", color: PURPLE },
  AI_SUMMARY_READ:    { label: "AI summary read",                emoji: "📰", color: BLUE },
  ARTICLE_LISTEN:     { label: "Article listened",               emoji: "🎧", color: BLUE },
  DAILY_READING_STREAK:{ label: "Daily reading streak (5X)",     emoji: "📚", color: ORANGE },
  COMBO_CARD_3OF5:    { label: "Combo Card 3/5 (1X)",            emoji: "🎯", color: GREEN },
  COMBO_CARD_4OF5:    { label: "Combo Card 4/5 (5X)",            emoji: "🎯", color: YELLOW },
  COMBO_CARD_5OF5:    { label: "Combo Card 5/5 jackpot 🔥",      emoji: "🎯", color: YELLOW },
  T20_RUNS:           { label: "Dalal Street T20 runs",          emoji: "🏏", color: GREEN },
  T20_CENTURY:        { label: "T20 century bonus 💯",           emoji: "🏏", color: YELLOW },
  T20_DOUBLE_TON:     { label: "T20 double-ton bonus 🚀",        emoji: "🏏", color: YELLOW },
  QUIZ_PODIUM_DAILY:  { label: "Quiz podium · daily",            emoji: "🥇", color: YELLOW },
  QUIZ_PODIUM_WEEKLY: { label: "Quiz podium · weekly",           emoji: "🥇", color: YELLOW },
  QUIZ_PODIUM_MONTHLY:{ label: "Quiz podium · monthly",          emoji: "🥇", color: YELLOW },
};

function getLedgerMeta(actionType: string, amount: number, note: string | null) {
  const meta = ACTION_META[actionType] ?? { label: note ?? actionType, emoji: "🪙", color: MUTED };
  // Detect buy/sell from note
  if (actionType === "VIRTUAL_TRADE" && note) {
    if (amount < 0) return { ...meta, label: note, emoji: "📉", color: RED };
    return { ...meta, label: note };
  }
  return meta;
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px",
      ...MONO, fontSize: 11,
    }}>
      <p style={{ color: MUTED, marginBottom: 6 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, display: "inline-block" }} />
          <span style={{ color: TEXT }}>{p.name}: </span>
          <span style={{ color: p.fill }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RewardsHub({
  authToken, onNavigate,
}: {
  authToken?: string;
  onNavigate?: (view: string) => void;
}) {
  const { user, coins, investorIq, profile } = useAuth();
  const [data,    setData]    = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [referralMsg, setReferralMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [claimingRef, setClaimingRef] = useState(false);
  const [shareStats, setShareStats] = useState<{
    totalClicks: number;
    todayClicks: number;
    byPlatform:  Record<string, number>;
  } | null>(null);
  const animBalance = useCountUp(data?.virtualBalance ?? 0);

  const fetchHub = useCallback(async () => {
    if (!authToken) { setLoading(false); return; }
    try {
      const res = await fetch("/api/rewards/hub", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) setData(await res.json().then((d) => d));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [authToken]);

  useEffect(() => { fetchHub(); }, [fetchHub]);

  // Fetch share-link click attribution stats
  useEffect(() => {
    if (!authToken) return;
    let aborted = false;
    fetch("/api/referrals/my-stats", { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => {
        if (aborted || !d?.ok) return;
        setShareStats({
          totalClicks: d.totalClicks ?? 0,
          todayClicks: d.todayClicks ?? 0,
          byPlatform:  d.byPlatform  ?? {},
        });
      })
      .catch(() => {});
    return () => { aborted = true; };
  }, [authToken]);

  // Auto-claim daily login reward on first visit
  const loginClaimedRef = useRef(false);
  useEffect(() => {
    if (!authToken || loginClaimedRef.current) return;
    loginClaimedRef.current = true;
    fetch("/api/rewards/login", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && !d.alreadyClaimed && d.coinsEarned > 0) {
          // Refresh hub data to reflect new balance
          fetchHub();
        }
      })
      .catch(() => {});
  }, [authToken, fetchHub]);

  // IQ title & progress
  const iqTitle   = getTitleFromIQ(investorIq);
  const nextTitle = getNextTitle(investorIq);
  const ptsToNext = pointsToNextTier(investorIq);
  const currentRange = iqTitle.range;
  const rangeSize    = currentRange[1] - currentRange[0] || 1;
  const pct = nextTitle
    ? Math.round(((investorIq - currentRange[0]) / rangeSize) * 100)
    : 100;

  // Today tasks
  const tasks = data?.todayTasks;
  const TODAY_TASKS = [
    { key: "login",      label: "Daily Login",              reward: 100,  done: tasks?.login      ?? false, icon: <Flame size={13} /> },
    { key: "quiz",       label: "Take Market Quiz (5 Qs)",  reward: 500,  done: tasks?.quiz       ?? false, icon: <Brain size={13} /> },
    { key: "prediction", label: "Make a Prediction",        reward: 100,  done: tasks?.prediction ?? false, icon: <Zap   size={13} /> },
    { key: "trade",      label: "Execute a Virtual Trade",  reward: 50,   done: tasks?.trade      ?? false, icon: <TrendingUp size={13} /> },
    { key: "streak",     label: "Maintain Streak",          reward: 50,   done: tasks?.streak     ?? false, icon: <Activity size={13} /> },
  ];
  const potentialToday = TODAY_TASKS.filter((t) => !t.done).reduce((s, t) => s + t.reward, 0);
  const earnedToday    = TODAY_TASKS.filter((t) =>  t.done).reduce((s, t) => s + t.reward, 0);

  const handleCopyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsAppShare = () => {
    if (!data?.referralCode) return;
    const link = buildShareUrl("/", data.referralCode, "whatsapp");
    const msg = encodeURIComponent(
      `Join Market Samachar, India's smartest financial news app! Use my code ${data.referralCode} and get 500 bonus coins. We both earn 500 coins! 🚀 ${link}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener");
  };

  const handleClaimReferral = async () => {
    const code = referralInput.trim();
    if (!code || !authToken) return;
    setClaimingRef(true);
    setReferralMsg(null);
    try {
      const res = await fetch("/api/rewards/referral/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (res.ok) {
        setReferralMsg({ text: `+${d.coinsEarned ?? 500} coins earned! Welcome aboard.`, ok: true });
        setReferralInput("");
        fetchHub(); // refresh data
      } else {
        setReferralMsg({ text: d.error ?? "Failed to claim", ok: false });
      }
    } catch {
      setReferralMsg({ text: "Network error", ok: false });
    } finally {
      setClaimingRef(false);
    }
  };

  const ACHIEVEMENTS = [
    {
      key:   "firstTrade",
      title: "First Trade",
      desc:  "Execute your first virtual trade",
      emoji: "📈",
      color: GREEN,
      unlocked: data?.achievements.firstTrade.unlocked ?? false,
      date:     data?.achievements.firstTrade.unlockedAt,
      progress: Math.min(data?.stats.tradeCount ?? 0, 1),
      max:      1,
    },
    {
      key:   "sevenDayStreak",
      title: "7-Day Streak",
      desc:  "Earn streak bonus 7 days in a row",
      emoji: "🔥",
      color: ORANGE,
      unlocked: data?.achievements.sevenDayStreak.unlocked ?? false,
      date:     data?.achievements.sevenDayStreak.unlockedAt,
      progress: Math.min(data?.stats.maxStreak ?? 0, 7),
      max:      7,
    },
    {
      key:   "predictionStreak",
      title: "Prediction Ace",
      desc:  "Get 5 correct predictions",
      emoji: "🎯",
      color: BLUE,
      unlocked: data?.achievements.predictionStreak.unlocked ?? false,
      date:     data?.achievements.predictionStreak.unlockedAt,
      progress: Math.min(data?.stats.correctPredictions ?? 0, 5),
      max:      5,
    },
    {
      key:   "quizMaster",
      title: "Quiz Master",
      desc:  "Complete 100 Market Quizzes",
      emoji: "🧠",
      color: PURPLE,
      unlocked: data?.achievements.quizMaster.unlocked ?? false,
      date:     data?.achievements.quizMaster.unlockedAt,
      progress: Math.min(data?.stats.quizCount ?? 0, 100),
      max:      100,
    },
  ];

  // ─── Not signed in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <CoinIcon size={48} />
        <p style={{ color: MUTED, ...MONO, fontSize: 12, marginTop: 16 }}>
          Sign in to view your Rewards Hub
        </p>
      </div>
    );
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {[120, 200, 160, 240].map((h, i) => (
          <div key={i} style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, height: h,
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const chartData = (data?.weeklyBreakdown ?? []).map((d) => ({
    date: d.date.slice(5),  // "MM-DD"
    Quiz:        d.bySource.quiz,
    Predictions: d.bySource.predictions,
    Trading:     d.bySource.trading,
    Streak:      d.bySource.streak,
    Other:       d.bySource.other,
  }));
  const hasChartData = chartData.some((d) => d.Quiz + d.Predictions + d.Trading + d.Streak + d.Other > 0);

  return (
    <div style={{ background: BG, minHeight: "100%", paddingBottom: 24, ...SANS }}>

      {/* ── Coin Overview Card ─────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #0a1a1a 0%, #070e14 100%)",
        borderBottom: `1px solid ${BORDER}`,
        padding: "20px 16px",
      }}>
        <div className="flex items-start gap-4">

          {/* Circular IQ progress */}
          <CircularProgress pct={pct} size={88} stroke={6} color={iqTitle.color}>
            <span style={{ fontSize: 22 }}>{iqTitle.emoji}</span>
            <span style={{ color: iqTitle.color, ...MONO, fontSize: 9, marginTop: 1 }}>
              {investorIq}
            </span>
          </CircularProgress>

          {/* Balance + title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Trade Coins
              </span>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span style={{ color: TEXT, ...MONO, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                {animBalance.toLocaleString("en-IN")}
              </span>
              <span style={{ color: MUTED, ...MONO, fontSize: 11, marginBottom: 2 }}>coins</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{
                background: `${iqTitle.color}18`,
                border:     `1px solid ${iqTitle.color}40`,
                color:      iqTitle.color,
                ...MONO, fontSize: 9, padding: "2px 8px", borderRadius: 20,
              }}>
                {iqTitle.emoji} {iqTitle.title}
              </span>
              {nextTitle && (
                <span style={{ color: DIM, ...MONO, fontSize: 9 }}>
                  {ptsToNext} pts → {nextTitle.title}
                </span>
              )}
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchHub}
            style={{ background: "none", border: "none", cursor: "pointer", color: DIM, padding: 4 }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Profile coins (Supabase) vs virtual balance row */}
        <div
          className="flex items-center justify-between mt-4 pt-3"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ color: DIM, ...MONO, fontSize: 10 }}>Supabase coins</span>
            <span style={{ color: YELLOW, ...MONO, fontSize: 11 }}>
              {(coins ?? 0).toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: DIM, ...MONO, fontSize: 10 }}>Trading balance</span>
            <span style={{ color: GREEN, ...MONO, fontSize: 11 }}>
              {(data?.virtualBalance ?? 0).toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: DIM, ...MONO, fontSize: 10 }}>IQ score</span>
            <span style={{ color: iqTitle.color, ...MONO, fontSize: 11 }}>{investorIq}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px" }} className="flex flex-col gap-4">

        {/* ── 🏏 Dalal Street T20 — Cricket-themed reaction game ────────── */}
        <T20EntryWidget authToken={authToken} onPlay={() => onNavigate?.("t20")} />

        {/* ── Today's Tasks ─────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
          <SectionHeader icon={<CheckCircle2 size={14} />} label="Today's Tasks" />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TODAY_TASKS.map((task) => (
              <div
                key={task.key}
                className="flex items-center justify-between"
                style={{ opacity: task.done ? 0.7 : 1 }}
              >
                <div className="flex items-center gap-2.5">
                  {task.done
                    ? <CheckCircle2 size={16} style={{ color: GREEN, flexShrink: 0 }} />
                    : <Circle       size={16} style={{ color: DIM,   flexShrink: 0 }} />
                  }
                  <span style={{ color: task.done ? MUTED : TEXT, ...SANS, fontSize: 13,
                    textDecoration: task.done ? "line-through" : "none" }}>
                    {task.label}
                  </span>
                </div>
                <span style={{
                  color: task.done ? MUTED : GREEN,
                  ...MONO, fontSize: 11,
                  background: task.done ? "transparent" : `${GREEN}12`,
                  border:     task.done ? "none" : `1px solid ${GREEN}30`,
                  padding:    "2px 6px", borderRadius: 4,
                }}>
                  +{task.reward}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
            <span style={{ color: MUTED, ...MONO, fontSize: 10 }}>
              Earned today: <span style={{ color: GREEN }}>+{earnedToday}</span>
            </span>
            <span style={{ color: MUTED, ...MONO, fontSize: 10 }}>
              Still available: <span style={{ color: YELLOW }}>+{potentialToday}</span>
            </span>
          </div>
        </div>

        {/* ── Weekly Earnings Chart ──────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
          <SectionHeader icon={<BarChart2 size={14} />} label="Last 7 Days" accent={BLUE} />

          {!hasChartData ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: DIM, ...MONO, fontSize: 11 }}>No earnings this week yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barSize={8} barGap={2}>
                  <XAxis dataKey="date" tick={{ fill: DIM, fontSize: 9, fontFamily: "'DM Mono'" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: `${BORDER}80` }} />
                  <Legend
                    iconType="square" iconSize={8}
                    wrapperStyle={{ fontSize: 10, fontFamily: "'DM Mono'", color: MUTED, paddingTop: 8 }}
                  />
                  <Bar dataKey="Quiz"        stackId="a" fill={PURPLE} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Predictions" stackId="a" fill={BLUE}   radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Trading"     stackId="a" fill={GREEN}  radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Streak"      stackId="a" fill={ORANGE} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Other"       stackId="a" fill={DIM}    radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Source breakdown totals */}
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  { label: "Quiz",    color: PURPLE, total: chartData.reduce((s, d) => s + d.Quiz, 0) },
                  { label: "Predict", color: BLUE,   total: chartData.reduce((s, d) => s + d.Predictions, 0) },
                  { label: "Trading", color: GREEN,  total: chartData.reduce((s, d) => s + d.Trading, 0) },
                  { label: "Streak",  color: ORANGE, total: chartData.reduce((s, d) => s + d.Streak, 0) },
                ].filter((s) => s.total > 0).map((s) => (
                  <div key={s.label} className="flex items-center gap-1">
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: s.color, display: "inline-block" }} />
                    <span style={{ color: MUTED, ...MONO, fontSize: 10 }}>{s.label}: </span>
                    <span style={{ color: s.color, ...MONO, fontSize: 10 }}>+{s.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Activity Feed ──────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
          <SectionHeader icon={<Activity size={14} />} label="Activity Feed" accent={MUTED} />

          {!data?.coinLedger.length ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: DIM, ...MONO, fontSize: 11 }}>No activity yet — start earning!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {data.coinLedger.map((entry, i) => {
                const meta    = getLedgerMeta(entry.action_type, entry.amount, entry.note);
                const earned  = entry.amount > 0;
                const timeAgo = formatTimeAgo(entry.created_at);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: i < data.coinLedger.length - 1 ? `1px solid ${BORDER}` : "none" }}
                  >
                    <div className="flex items-center gap-2.5" style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.emoji}</span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ color: TEXT, ...SANS, fontSize: 12, lineHeight: 1.3 }} className="truncate">
                          {earned ? "You earned" : "You spent"} — {meta.label}
                        </p>
                        <p style={{ color: DIM, ...MONO, fontSize: 10, marginTop: 1 }}>{timeAgo}</p>
                      </div>
                    </div>
                    <span style={{
                      color:   earned ? GREEN : RED,
                      ...MONO, fontSize: 12, fontWeight: 600,
                      flexShrink: 0, marginLeft: 8,
                    }}>
                      {earned ? "+" : ""}{entry.amount}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Achievements ───────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
          <SectionHeader icon={<Trophy size={14} />} label="Achievements" accent={YELLOW} />

          <div className="grid grid-cols-2 gap-3">
            {ACHIEVEMENTS.map((ach) => (
              <div
                key={ach.key}
                style={{
                  background:  ach.unlocked ? `${ach.color}10` : "#070710",
                  border:      `1px solid ${ach.unlocked ? `${ach.color}30` : BORDER}`,
                  borderRadius: 10, padding: "12px",
                  position:    "relative", overflow: "hidden",
                  opacity:     ach.unlocked ? 1 : 0.6,
                }}
              >
                {!ach.unlocked && (
                  <Lock size={11} style={{
                    position: "absolute", top: 8, right: 8, color: DIM,
                  }} />
                )}
                <div style={{ fontSize: 24, marginBottom: 6, filter: ach.unlocked ? "none" : "grayscale(1)" }}>
                  {ach.emoji}
                </div>
                <p style={{ color: ach.unlocked ? TEXT : MUTED, ...SANS, fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
                  {ach.title}
                </p>
                <p style={{ color: DIM, ...SANS, fontSize: 10, marginTop: 2, lineHeight: 1.3 }}>
                  {ach.desc}
                </p>

                {/* Progress bar */}
                {!ach.unlocked && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ background: BORDER, borderRadius: 2, height: 3, overflow: "hidden" }}>
                      <div style={{
                        width:      `${Math.round((ach.progress / ach.max) * 100)}%`,
                        height:     "100%",
                        background: ach.color,
                        borderRadius: 2,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                    <p style={{ color: DIM, ...MONO, fontSize: 9, marginTop: 3 }}>
                      {ach.progress}/{ach.max}
                    </p>
                  </div>
                )}

                {ach.unlocked && ach.date && (
                  <p style={{ color: ach.color, ...MONO, fontSize: 9, marginTop: 4 }}>
                    ✓ {new Date(ach.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                )}
                {ach.unlocked && !ach.date && (
                  <p style={{ color: ach.color, ...MONO, fontSize: 9, marginTop: 4 }}>✓ Unlocked</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Referral Section ───────────────────────────────────────────── */}
        <div style={{
          background:   CARD,
          border:       `1px solid ${BORDER}`,
          borderRadius: 12,
          padding:      "14px 16px",
        }}>
          <SectionHeader icon={<Gift size={14} />} label="Refer & Earn" accent={YELLOW} />

          <p style={{ color: MUTED, ...SANS, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Invite friends to Market Samachar. You earn <span style={{ color: YELLOW }}>1,000 coins (10×)</span> for each referral, and your friend gets <span style={{ color: YELLOW }}>100 bonus coins</span>!
          </p>

          {/* Referral code */}
          <div className="flex items-center gap-2 mb-3">
            <div style={{
              flex:         1, background: BG, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding:    "10px 14px",
              display:      "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ color: TEXT, ...MONO, fontSize: 18, letterSpacing: "0.2em", fontWeight: 700 }}>
                {data?.referralCode ?? "——"}
              </span>
              <button
                onClick={handleCopyCode}
                style={{ background: "none", border: "none", cursor: "pointer", color: copied ? GREEN : MUTED, padding: 4 }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mb-3">
            <div>
              <p style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>Signups</p>
              <p style={{ color: YELLOW, ...MONO, fontSize: 18, fontWeight: 700 }}>
                {data?.referralCount ?? 0}
              </p>
            </div>
            <div>
              <p style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>Coins Earned</p>
              <p style={{ color: GREEN, ...MONO, fontSize: 18, fontWeight: 700 }}>
                {((data?.referralCount ?? 0) * 1000).toLocaleString("en-IN")}
              </p>
            </div>
            {shareStats && (
              <>
                <div>
                  <p style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>Today's Clicks</p>
                  <p style={{ color: ORANGE, ...MONO, fontSize: 18, fontWeight: 700 }}>
                    {shareStats.todayClicks}
                  </p>
                </div>
                <div>
                  <p style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>Total Clicks</p>
                  <p style={{ color: TEXT, ...MONO, fontSize: 18, fontWeight: 700 }}>
                    {shareStats.totalClicks}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Share Impact panel — platform breakdown when there are clicks */}
          {shareStats && shareStats.totalClicks > 0 && (
            <div style={{
              background:   BG, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "10px 12px", marginBottom: 12,
            }}>
              <p style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.1em", marginBottom: 6 }}>
                CLICK-THROUGHS BY PLATFORM
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(shareStats.byPlatform)
                  .sort((a, b) => b[1] - a[1])
                  .map(([platform, count]) => {
                    const emoji =
                      platform === "whatsapp" ? "💚" :
                      platform === "twitter"  ? "𝕏"  :
                      platform === "telegram" ? "✈️" :
                      platform === "copy"     ? "🔗" : "📤";
                    return (
                      <span key={platform} style={{
                        background: CARD, border: `1px solid ${BORDER}`,
                        borderRadius: 4, padding: "3px 8px",
                        ...MONO, fontSize: 11, color: TEXT,
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                        <span style={{ fontSize: 13 }}>{emoji}</span>
                        {platform.toUpperCase()}
                        <span style={{ color: ORANGE, fontWeight: 700, marginLeft: 2 }}>{count}</span>
                      </span>
                    );
                  })}
              </div>
              <p style={{ color: DIM, ...SANS, fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
                Each signup via your link = <span style={{ color: GREEN }}>+500 coins</span> for both of you. Keep sharing!
              </p>
            </div>
          )}

          {/* Share buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleWhatsAppShare}
              style={{
                flex:         1, background: "#25D36620", border: `1px solid #25D36640`,
                borderRadius: 8, padding:    "10px",
                display:      "flex", alignItems: "center", justifyContent: "center", gap: 6,
                cursor:       "pointer", color: "#25D366", ...MONO, fontSize: 11,
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}
            >
              <Share2 size={13} /> Share on WhatsApp
            </button>
            <button
              onClick={handleCopyCode}
              style={{
                background:   copied ? `${GREEN}20` : BG,
                border:       `1px solid ${copied ? GREEN + "40" : BORDER}`,
                borderRadius: 8, padding:    "10px 14px",
                display:      "flex", alignItems: "center", justifyContent: "center", gap: 6,
                cursor:       "pointer", color: copied ? GREEN : MUTED,
                ...MONO, fontSize: 11, textTransform: "uppercase",
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>

          {/* Have a referral code? */}
          <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
            <p style={{ color: MUTED, ...MONO, fontSize: 10, letterSpacing: "0.06em", marginBottom: 8 }}>
              HAVE A REFERRAL CODE?
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                placeholder="Enter code"
                value={referralInput}
                onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                maxLength={8}
                style={{
                  flex: 1, background: BG, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "8px 12px",
                  color: TEXT, ...MONO, fontSize: 14, letterSpacing: "0.15em",
                  outline: "none",
                }}
              />
              <button
                onClick={handleClaimReferral}
                disabled={claimingRef || !referralInput.trim()}
                style={{
                  background: GREEN + "18", border: `1px solid ${GREEN}40`,
                  borderRadius: 6, padding: "8px 14px",
                  color: GREEN, ...MONO, fontSize: 11, cursor: "pointer",
                  opacity: claimingRef || !referralInput.trim() ? 0.5 : 1,
                }}
              >
                {claimingRef ? "..." : "CLAIM"}
              </button>
            </div>
            {referralMsg && (
              <p style={{ color: referralMsg.ok ? GREEN : RED, ...MONO, fontSize: 10, marginTop: 6 }}>
                {referralMsg.text}
              </p>
            )}
          </div>
        </div>

      </div>{/* /padding wrapper */}
    </div>
  );
}

// ─── T20 Entry Widget — hero card linking to Dalal Street T20 game ───────────

interface T20State {
  ok:           boolean;
  playedToday:  number;
  dailyCap:     number;
  remaining:    number;
  careerBest:   number;
  top3:         Array<{ rank: number; name: string | null; runs: number; balls: number }>;
}

function T20EntryWidget({
  authToken, onPlay,
}: {
  authToken?: string;
  onPlay: () => void;
}) {
  const [state, setState] = useState<T20State | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authToken) return;
    let alive = true;
    setLoading(true);
    fetch("/api/t20/state", { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.json())
      .then((d) => { if (alive) setState(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authToken]);

  // Compose tagline based on state
  const remaining   = state?.remaining ?? 0;
  const careerBest  = state?.careerBest ?? 0;
  const top         = state?.top3?.[0];
  const canPlay     = remaining > 0;

  return (
    <div
      onClick={canPlay ? onPlay : undefined}
      style={{
        background: "linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(0,255,136,0.03) 50%, rgba(255,204,68,0.05) 100%)",
        border: `1px solid ${canPlay ? GREEN + "40" : BORDER}`,
        borderRadius: 12, padding: "14px 16px",
        cursor: canPlay ? "pointer" : "default",
        position: "relative", overflow: "hidden",
        transition: "transform 0.15s",
      }}
      onMouseEnter={(e) => { if (canPlay) (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
    >
      {/* Background cricket ball decoration */}
      <div style={{
        position: "absolute", top: -10, right: -10, fontSize: 80, opacity: 0.06,
        pointerEvents: "none", lineHeight: 1,
      }}>🏏</div>

      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>🏏</span>
          <span style={{ ...MONO, fontSize: 12, color: GREEN, letterSpacing: "0.08em", fontWeight: 700 }}>
            DALAL STREET T20
          </span>
          <span style={{
            ...MONO, fontSize: 9, color: YELLOW, background: "rgba(255,221,59,0.1)",
            border: `1px solid ${YELLOW}40`, borderRadius: 3, padding: "1px 6px",
            letterSpacing: "0.08em",
          }}>NEW</span>
        </div>

        <div style={{ ...SANS, fontSize: 13, color: TEXT, marginBottom: 8, lineHeight: 1.4 }}>
          Read the chart, swing for the boundary.<br/>
          <span style={{ color: MUTED, fontSize: 12 }}>
            36 balls · 10 wickets · 1 coin per run · Century +200
          </span>
        </div>

        {/* Stat strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10,
        }}>
          <MiniStat label="TODAY" value={state ? `${state.playedToday}/${state.dailyCap}` : "—"} color={canPlay ? GREEN : ORANGE} />
          <MiniStat label="BEST"  value={careerBest > 0 ? String(careerBest) : "—"} color={YELLOW} />
          <MiniStat label="LEADER" value={top ? String(top.runs) : "—"} color={BLUE} />
        </div>

        {/* CTA */}
        <button
          onClick={(e) => { e.stopPropagation(); if (canPlay) onPlay(); }}
          disabled={!canPlay || loading}
          style={{
            width: "100%", padding: "10px",
            background: canPlay ? GREEN : "#1a1a2e",
            color: canPlay ? "#000" : DIM, border: "none", borderRadius: 8,
            ...MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
            cursor: canPlay ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {loading ? "LOADING…"
            : !canPlay ? "DAILY CAP REACHED"
            : <>▶ PLAY MATCH <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 4 }}>· {remaining} LEFT</span></>}
        </button>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "rgba(13,13,30,0.6)", border: `1px solid ${BORDER}`,
      borderRadius: 5, padding: "5px 6px", textAlign: "center",
    }}>
      <div style={{ ...MONO, fontSize: 8, color: DIM, letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ ...MONO, fontSize: 13, color, fontWeight: 700, marginTop: 1 }}>{value}</div>
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTimeAgo(tsMs: number): string {
  const diffSec = Math.floor((Date.now() - tsMs) / 1000);
  if (diffSec < 60)   return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const d = new Date(tsMs);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
