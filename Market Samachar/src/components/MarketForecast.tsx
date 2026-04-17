/**
 * MarketForecast — daily market direction prediction game.
 * Users vote Green / Red, earn 5 coins for participating,
 * 15 bonus coins if correct after market close.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, Coins, BarChart2, History, RefreshCw } from 'lucide-react';

// ─── Brand palette ────────────────────────────────────────────────────────────

const C = {
  bg:        '#07070e',
  card:      '#0d0d1e',
  border:    '#1e1e2e',
  green:     '#00ff88',
  red:       '#ff4444',
  text:      '#e8eaf0',
  muted:     '#888899',
  dim:       '#444455',
  warning:   '#ff9f3b',
} as const;

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommunityStats {
  totalVotes: number;
  options:    Array<{ answer: string; count: number; percent: number }>;
}

interface Prediction {
  id:              number;
  question:        string;
  prediction_type: string;
  symbol:          string | null;
  resolves_at:     number;
  isResolved:      boolean;
  votingOpen:      boolean;
  userVote:        string | null;
  coinsAwarded:    number;
  correct_answer:  string | null;
  communityStats:  CommunityStats;
}

interface YesterdayResult {
  question:       string;
  correct_answer: string;
  userVote:       string | null;
  wasCorrect:     boolean | null;
  coinsAwarded:   number;
}

interface TodayData {
  date:        string;
  predictions: Prediction[];
  yesterday:   YesterdayResult[];
}

interface Props {
  authToken?: string;
  onCoinsChanged?: (delta: number) => void;
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(targetMs: number): string {
  const [text, setText] = useState('');

  useEffect(() => {
    function update() {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setText('Closed'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setText(
        h > 0
          ? `${h}h ${String(m).padStart(2,'0')}m`
          : `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
      );
    }
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [targetMs]);

  return text;
}

// ─── PollBar ──────────────────────────────────────────────────────────────────

function PollBar({ stats, userVote, correctAnswer }: {
  stats:         CommunityStats;
  userVote:      string | null;
  correctAnswer: string | null;
}) {
  const greenOpt = stats.options.find(o => o.answer.includes('Green') || o.answer === 'Green 📈');
  const redOpt   = stats.options.find(o => o.answer.includes('Red')   || o.answer === 'Red 📉');
  const greenPct = greenOpt?.percent ?? 50;
  const redPct   = redOpt?.percent   ?? 50;

  const isGreenCorrect = correctAnswer?.includes('Green');
  const isRedCorrect   = correctAnswer?.includes('Red');

  return (
    <div style={{ ...SANS, marginTop: 12 }}>
      {/* Bar */}
      <div style={{
        display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden',
        border: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: `${greenPct}%`, background: C.green,
          transition: 'width 0.6s ease',
          opacity: isRedCorrect ? 0.4 : 1,
        }} />
        <div style={{
          width: `${redPct}%`, background: C.red,
          transition: 'width 0.6s ease',
          opacity: isGreenCorrect ? 0.4 : 1,
        }} />
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ color: isGreenCorrect ? C.green : C.muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {isGreenCorrect && <CheckCircle size={12} color={C.green} />}
          <span style={{ ...MONO }}>Green 📈</span>
          <span style={{ color: C.text, fontWeight: 600 }}>{greenPct}%</span>
          {userVote?.includes('Green') && !isGreenCorrect && !correctAnswer && (
            <span style={{ color: C.green, fontSize: 10 }}>← you</span>
          )}
        </span>
        <span style={{ color: C.muted, fontSize: 11 }}>
          {stats.totalVotes} vote{stats.totalVotes !== 1 ? 's' : ''}
        </span>
        <span style={{ color: isRedCorrect ? C.red : C.muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {isRedCorrect && <CheckCircle size={12} color={C.red} />}
          <span style={{ color: C.text, fontWeight: 600 }}>{redPct}%</span>
          <span style={{ ...MONO }}>Red 📉</span>
          {userVote?.includes('Red') && !isRedCorrect && !correctAnswer && (
            <span style={{ color: C.red, fontSize: 10 }}>you →</span>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── PredictionCard ───────────────────────────────────────────────────────────

function PredictionCard({
  prediction, authToken, onVoted,
}: {
  key?:       React.Key;
  prediction: Prediction;
  authToken?: string;
  onVoted:    (p: Prediction, coinsEarned: number) => void;
}) {
  const [voting,   setVoting]   = useState(false);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const countdown = useCountdown(prediction.resolves_at);

  const hasVoted   = prediction.userVote !== null;
  const isResolved = prediction.isResolved;

  async function vote(answer: string) {
    if (!authToken || hasVoted || !prediction.votingOpen) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/predictions/${prediction.id}/vote`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body:    JSON.stringify({ answer }),
      });
      const data = await res.json();
      if (data.ok) {
        const updated: Prediction = {
          ...prediction,
          userVote:       answer,
          coinsAwarded:   data.coinsAwarded,
          communityStats: data.communityStats,
        };
        setFlashMsg(`+${data.coinsAwarded} coins!`);
        setTimeout(() => setFlashMsg(null), 2500);
        onVoted(updated, data.coinsAwarded);
      } else if (data.alreadyVoted) {
        setFlashMsg('Already voted!');
        setTimeout(() => setFlashMsg(null), 2000);
      }
    } catch {
      // silent fail
    } finally {
      setVoting(false);
    }
  }

  // Outcome indicator
  const userCorrect = isResolved && hasVoted && prediction.userVote === prediction.correct_answer;
  const userWrong   = isResolved && hasVoted && prediction.userVote !== prediction.correct_answer;

  return (
    <div style={{
      background:   C.card,
      border:       `1px solid ${C.border}`,
      borderLeft:   `3px solid ${isResolved ? (userCorrect ? C.green : C.red) : C.green}`,
      borderRadius: 10,
      padding:      '16px 18px',
      marginBottom: 12,
      position:     'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          {prediction.prediction_type === 'STOCK_DIRECTION' && prediction.symbol && (
            <span style={{
              ...MONO, fontSize: 10, color: C.green,
              background: '#001a0e', border: `1px solid ${C.green}30`,
              borderRadius: 4, padding: '2px 6px', marginBottom: 6, display: 'inline-block',
            }}>
              {prediction.symbol}.NS
            </span>
          )}
          <p style={{ ...SANS, color: C.text, fontSize: 15, fontWeight: 500, margin: '4px 0 0 0', lineHeight: 1.4 }}>
            {prediction.question}
          </p>
        </div>

        {/* Status badge */}
        {isResolved ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 10 }}>
            {userCorrect && <CheckCircle size={16} color={C.green} />}
            {userWrong   && <XCircle    size={16} color={C.red}   />}
            <span style={{ ...SANS, fontSize: 11, color: userCorrect ? C.green : userWrong ? C.red : C.muted }}>
              {userCorrect ? 'Correct!' : userWrong ? 'Wrong' : 'Resolved'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted, marginLeft: 10 }}>
            <Clock size={12} />
            <span style={{ ...MONO, fontSize: 11 }}>{countdown}</span>
          </div>
        )}
      </div>

      {/* Vote buttons — shown only if voting open and not yet voted */}
      {prediction.votingOpen && !hasVoted && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button
            onClick={() => vote('Green 📈')}
            disabled={voting}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 8, border: `1px solid ${C.green}40`,
              background: '#001a0e', color: C.green, cursor: voting ? 'wait' : 'pointer',
              ...SANS, fontSize: 15, fontWeight: 600,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#003320')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#001a0e')}
          >
            <TrendingUp size={18} /> Green 📈
          </button>
          <button
            onClick={() => vote('Red 📉')}
            disabled={voting}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 8, border: `1px solid ${C.red}40`,
              background: '#1a0008', color: C.red, cursor: voting ? 'wait' : 'pointer',
              ...SANS, fontSize: 15, fontWeight: 600,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#330010')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#1a0008')}
          >
            <TrendingDown size={18} /> Red 📉
          </button>
        </div>
      )}

      {/* Post-vote: show user's choice highlighted */}
      {hasVoted && prediction.votingOpen && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {['Green 📈', 'Red 📉'].map((opt) => {
            const chosen  = prediction.userVote === opt;
            const isGreen = opt.includes('Green');
            return (
              <div key={opt} style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border:     `1px solid ${chosen ? (isGreen ? C.green : C.red) : C.border}`,
                background: chosen ? (isGreen ? '#001a0e' : '#1a0008') : 'transparent',
                color:      chosen ? (isGreen ? C.green : C.red) : C.dim,
                ...SANS, fontSize: 14, fontWeight: chosen ? 600 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {isGreen ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {opt}
                {chosen && <span style={{ fontSize: 11, opacity: 0.7 }}>← you</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved: show correct answer row */}
      {isResolved && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {['Green 📈', 'Red 📉'].map((opt) => {
            const isCorrectOpt = prediction.correct_answer === opt;
            const isUserVote   = prediction.userVote === opt;
            const isGreen      = opt.includes('Green');
            return (
              <div key={opt} style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border:     `1px solid ${isCorrectOpt ? (isGreen ? C.green : C.red) : C.border}`,
                background: isCorrectOpt ? (isGreen ? '#001a0e' : '#1a0008') : 'transparent',
                color:      isCorrectOpt ? (isGreen ? C.green : C.red) : C.dim,
                ...SANS, fontSize: 14, fontWeight: isCorrectOpt ? 600 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {isCorrectOpt ? <CheckCircle size={14} /> : null}
                {isGreen ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {opt}
                {isUserVote && (
                  <span style={{ fontSize: 11, opacity: 0.7 }}>← you</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Poll bar */}
      {(hasVoted || isResolved) && (
        <PollBar
          stats={prediction.communityStats}
          userVote={prediction.userVote}
          correctAnswer={prediction.correct_answer}
        />
      )}

      {/* Coins earned */}
      {prediction.coinsAwarded > 0 && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>🪙</span>
          <span style={{ ...MONO, fontSize: 12, color: C.green }}>
            +{prediction.coinsAwarded} coins earned
            {userCorrect && ' (5 participation + 15 correct)'}
          </span>
        </div>
      )}

      {/* Flash message */}
      {flashMsg && (
        <div style={{
          position: 'absolute', top: 10, right: 14,
          background: '#001a0e', border: `1px solid ${C.green}`,
          borderRadius: 6, padding: '4px 10px',
          ...MONO, fontSize: 12, color: C.green,
          animation: 'fadeIn 0.2s ease',
        }}>
          {flashMsg}
        </div>
      )}
    </div>
  );
}

// ─── YesterdayRow ─────────────────────────────────────────────────────────────

function YesterdayRow({ entry }: { key?: React.Key; entry: YesterdayResult }) {
  const Icon = entry.wasCorrect === true
    ? CheckCircle
    : entry.wasCorrect === false
      ? XCircle
      : Clock;
  const iconColor = entry.wasCorrect === true ? C.green : entry.wasCorrect === false ? C.red : C.muted;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 0', borderBottom: `1px solid ${C.border}30`,
    }}>
      <Icon size={15} color={iconColor} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <p style={{ ...SANS, color: C.muted, fontSize: 12, margin: 0 }}>{entry.question}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <span style={{ ...MONO, fontSize: 11, color: C.green }}>
            ✓ {entry.correct_answer}
          </span>
          {entry.userVote && (
            <span style={{ ...MONO, fontSize: 11, color: entry.wasCorrect ? C.green : C.red }}>
              You: {entry.userVote}
            </span>
          )}
          {entry.coinsAwarded > 0 && (
            <span style={{ ...MONO, fontSize: 11, color: C.green }}>+{entry.coinsAwarded} 🪙</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MarketForecast({ authToken, onCoinsChanged }: Props) {
  const [data,        setData]        = useState<TodayData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<'today' | 'history'>('today');
  const [history,     setHistory]     = useState<any | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const fetchToday = useCallback(async () => {
    if (!authToken) { setError('Sign in to participate'); setLoading(false); return; }
    try {
      const res = await fetch('/api/predictions/today', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (json.ok) setData(json);
      else setError(json.error ?? 'Failed to load');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  async function fetchHistory() {
    if (!authToken || histLoading) return;
    setHistLoading(true);
    try {
      const res = await fetch('/api/predictions/history', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (json.ok) setHistory(json);
    } catch {}
    finally { setHistLoading(false); }
  }

  useEffect(() => {
    if (tab === 'history' && !history) fetchHistory();
  }, [tab]);

  function handleVoted(updated: Prediction, coinsEarned: number) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        predictions: prev.predictions.map((p) => p.id === updated.id ? updated : p),
      };
    });
    onCoinsChanged?.(coinsEarned);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: C.bg, minHeight: '100%', ...SANS }}>
      {/* Header */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={18} color={C.green} />
              <h2 style={{ color: C.text, fontSize: 17, fontWeight: 600, margin: 0 }}>
                Daily Forecast
              </h2>
              <span style={{
                ...MONO, fontSize: 9, color: C.green,
                background: '#001a0e', border: `1px solid ${C.green}30`,
                borderRadius: 4, padding: '2px 5px',
              }}>LIVE</span>
            </div>
            <p style={{ color: C.muted, fontSize: 12, margin: '3px 0 0 0' }}>
              Predict market direction · Earn coins
            </p>
          </div>
          <button
            onClick={fetchToday}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {([['today', 'Today'], ['history', 'My History']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px', borderRadius: 6,
                border: `1px solid ${tab === t ? C.green : C.border}`,
                background: tab === t ? '#001a0e' : 'transparent',
                color: tab === t ? C.green : C.muted,
                ...SANS, fontSize: 13, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 640, margin: '0 auto' }}>
        {/* ── Today tab ─────────────────────────────────────────────────── */}
        {tab === 'today' && (
          <>
            {loading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                <div style={{
                  width: 24, height: 24, border: `2px solid ${C.border}`,
                  borderTop: `2px solid ${C.green}`, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 12px',
                }} />
                Loading predictions…
              </div>
            )}

            {error && (
              <div style={{
                background: '#1a0010', border: `1px solid ${C.red}40`,
                borderRadius: 8, padding: '14px 16px', color: C.red, fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* Earn info banner */}
                <div style={{
                  background: '#001a0e', border: `1px solid ${C.green}20`,
                  borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 18 }}>🪙</span>
                  <div>
                    <p style={{ color: C.green, fontSize: 12, fontWeight: 600, margin: 0, ...MONO }}>
                      +5 coins for voting · +15 bonus if correct
                    </p>
                    <p style={{ color: C.muted, fontSize: 11, margin: '2px 0 0 0' }}>
                      Results at 3:30 PM IST (market close)
                    </p>
                  </div>
                </div>

                {/* Prediction cards */}
                {data.predictions.length === 0 ? (
                  <div style={{
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: '32px 20px', textAlign: 'center',
                    color: C.muted,
                  }}>
                    <Clock size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
                    <p style={{ fontSize: 14, margin: 0 }}>
                      Today's predictions will appear at 8:45 AM IST
                    </p>
                  </div>
                ) : (
                  data.predictions.map((p: Prediction) => (
                    <PredictionCard
                      key={p.id}
                      prediction={p}
                      authToken={authToken}
                      onVoted={handleVoted}
                    />
                  ))
                )}

                {/* Yesterday's results */}
                {data.yesterday.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ color: C.muted, fontSize: 12, fontWeight: 600, ...MONO, marginBottom: 8, letterSpacing: '0.08em' }}>
                      YESTERDAY'S RESULTS
                    </h3>
                    <div style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: '4px 14px',
                    }}>
                      {data.yesterday.map((y: YesterdayResult, i: number) => (
                        <YesterdayRow key={i} entry={y} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── History tab ───────────────────────────────────────────────── */}
        {tab === 'history' && (
          <>
            {histLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>
                Loading…
              </div>
            )}

            {history && (
              <>
                {/* Stats row */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Votes', value: history.totalVotes, mono: true },
                    { label: 'Accuracy', value: `${history.accuracyRate}%`, mono: true, color: C.green },
                    { label: 'Coins', value: `+${history.coinsEarned}`, mono: true, color: C.green },
                  ].map(({ label, value, mono, color }) => (
                    <div key={label} style={{
                      flex: 1, background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '12px 0', textAlign: 'center',
                    }}>
                      <p style={{ color: color ?? C.text, fontSize: 18, fontWeight: 700, margin: 0, ...(mono ? MONO : {}) }}>
                        {value}
                      </p>
                      <p style={{ color: C.muted, fontSize: 11, margin: '3px 0 0 0' }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* History entries */}
                {history.entries.length === 0 ? (
                  <div style={{ textAlign: 'center', color: C.muted, padding: '32px 0', fontSize: 13 }}>
                    No predictions yet — start voting!
                  </div>
                ) : (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 14px' }}>
                    {history.entries.map((e: any, i: number) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 0', borderBottom: i < history.entries.length - 1 ? `1px solid ${C.border}30` : 'none',
                      }}>
                        {e.isCorrect === true  && <CheckCircle size={14} color={C.green} />}
                        {e.isCorrect === false && <XCircle    size={14} color={C.red}   />}
                        {e.isCorrect === null  && <Clock      size={14} color={C.muted} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: C.text, fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {e.question}
                          </p>
                          <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                            <span style={{ ...MONO, fontSize: 11, color: C.muted }}>You: {e.userVote}</span>
                            {e.correctAnswer && (
                              <span style={{ ...MONO, fontSize: 11, color: C.green }}>✓ {e.correctAnswer}</span>
                            )}
                          </div>
                        </div>
                        {e.coinsAwarded > 0 && (
                          <span style={{ ...MONO, fontSize: 12, color: C.green, flexShrink: 0 }}>
                            +{e.coinsAwarded} 🪙
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default MarketForecast;
