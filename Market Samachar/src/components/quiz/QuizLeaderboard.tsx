import React, { useState, useEffect } from 'react';
import { X, Trophy, Loader2, Flame } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getTitleFromIQ } from '../../lib/iq-calculator';
import type { LeaderboardEntry } from './types';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

type Period = 'daily' | 'weekly' | 'monthly' | 'alltime';

interface QuizLeaderboardProps {
  onClose:     () => void;
  onPlayAgain: () => void;
}

const PERIOD_LABELS: Record<Period, string> = {
  daily:   'Today',
  weekly:  'Week',
  monthly: 'Month',
  alltime: 'All Time',
};

const PODIUM_PRIZES: [number, number, number] = [1000, 750, 500];

// ─── Component ────────────────────────────────────────────────────────────────
export function QuizLeaderboard({ onClose, onPlayAgain }: QuizLeaderboardProps) {
  const { user } = useAuth();
  const [period,  setPeriod]  = useState<Period>('daily');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/quiz/leaderboard?period=${period}`)
      .then(r => r.json())
      .then(data => {
        const raw = data.leaderboard ?? [];
        const normalized: LeaderboardEntry[] = raw.map((e: any) => ({
          user_id:         e.user_id,
          name:            e.profiles?.name        ?? e.name        ?? 'Anonymous',
          avatar:          e.profiles?.avatar       ?? e.avatar       ?? null,
          investor_iq:     e.profiles?.investor_iq  ?? e.investor_iq  ?? 0,
          score:           e.score,
          iq_change:       e.iq_change,
          time_taken_secs: e.time_taken_secs,
          coins_earned:    e.coins_earned,
          total_iq_gained: e.total_iq_gained,
          total_score:     e.total_score,
          days_played:     e.days_played,
          total_coins:     e.total_coins,
          avg_score:       e.avg_score,
        }));
        setEntries(normalized);
      })
      .catch(() => setError('Failed to load leaderboard'))
      .finally(() => setLoading(false));
  }, [period]);

  const myRank = user ? entries.findIndex(e => e.user_id === user.id) : -1;

  // ── IQ delta (primary ranking) + sub-label per period ───────────────────
  const displayIqGain = (e: LeaderboardEntry) => {
    const v = period === 'daily' ? (e.iq_change ?? 0) : (e.total_iq_gained ?? 0);
    return `${v >= 0 ? '+' : ''}${v}`;
  };

  const displaySub = (e: LeaderboardEntry) =>
    period === 'daily'
      ? `${e.score ?? 0}/5${e.time_taken_secs ? ` · ${e.time_taken_secs}s` : ''}`
      : `${e.total_score ?? 0} pts · ${e.days_played ?? 0}d`;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(7,7,14,0.97)',
      zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0d0d1e',
        border: '1px solid #1e1e2e',
        borderTop: '3px solid #ffdd3b',
        borderRadius: 14,
        width: '100%', maxWidth: 500,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{ borderBottom: '1px solid #1e1e2e', background: '#07070e', flexShrink: 0 }}
          className="px-4 py-3 flex items-center gap-2"
        >
          <Trophy className="w-3.5 h-3.5" style={{ color: '#ffdd3b' }} />
          <span style={{ color: '#ffdd3b', ...MONO }} className="text-[10px] uppercase tracking-widest">
            Leaderboard
          </span>
          <button
            onClick={onPlayAgain}
            style={{ background: '#00ff8818', border: '1px solid #00ff8830', color: '#00ff88', ...MONO }}
            className="ml-auto text-[10px] uppercase px-2 py-1 rounded hover:bg-[#00ff8828] transition-colors"
          >
            Play Quiz
          </button>
          <button
            onClick={onClose}
            style={{ color: '#334466', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Period tabs ─────────────────────────────────────────────────── */}
        <div style={{ borderBottom: '1px solid #1e1e2e', flexShrink: 0 }} className="flex">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex:         1,
                padding:      '9px 0',
                background:   'none',
                border:       'none',
                borderBottom: period === p ? '2px solid #00ff88' : '2px solid transparent',
                color:        period === p ? '#00ff88' : '#445566',
                ...MONO,
                fontSize:       10,
                letterSpacing:  '0.06em',
                cursor:         'pointer',
                transition:     'color 0.15s',
              }}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* ── Podium prize hint (not shown on all-time) ────────────────────── */}
        {period !== 'alltime' && (
          <div
            style={{ borderBottom: '1px solid #1e1e2e', background: '#ffdd3b08', flexShrink: 0 }}
            className="px-4 py-2 flex items-center gap-2"
          >
            <Trophy className="w-3 h-3" style={{ color: '#ffdd3b', flexShrink: 0 }} />
            <span style={{ color: '#ffdd3b', ...MONO }} className="text-[9px] uppercase tracking-wider">
              Top 3 {period} by IQ →
            </span>
            <span style={{ color: '#665500', ...MONO }} className="text-[9px]">
              🥇 {PODIUM_PRIZES[0]} · 🥈 {PODIUM_PRIZES[1]} · 🥉 {PODIUM_PRIZES[2]} coins
            </span>
          </div>
        )}

        {/* ── Column headers ──────────────────────────────────────────────── */}
        <div
          style={{ borderBottom: '1px solid #111122', flexShrink: 0, background: '#07070e' }}
          className="px-4 py-1.5 flex items-center gap-3"
        >
          <div style={{ width: 28, flexShrink: 0 }} />
          <div style={{ flex: 1 }} />
          <span style={{ color: '#2a2a4a', ...MONO, fontSize: 8, letterSpacing: '0.06em', width: 48, textAlign: 'center' }}>IQ</span>
          <span style={{ color: '#2a2a4a', ...MONO, fontSize: 8, letterSpacing: '0.06em', width: 56, textAlign: 'right' }}>IQ GAIN</span>
        </div>

        {/* ── List ────────────────────────────────────────────────────────── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12" style={{ color: '#334466' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span style={{ ...MONO }} className="text-[10px] uppercase">Loading…</span>
            </div>
          ) : error ? (
            <p style={{ color: '#ff4466', ...MONO }} className="text-[11px] text-center py-8 uppercase">
              {error}
            </p>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-8 h-8 mx-auto mb-3" style={{ color: '#1e1e2e' }} />
              <p style={{ color: '#334466', ...MONO }} className="text-[11px] uppercase">
                No entries yet — be the first!
              </p>
            </div>
          ) : (
            <div>
              {entries.map((entry, i) => {
                const isMe       = user?.id === entry.user_id;
                const titleInfo  = getTitleFromIQ(entry.investor_iq ?? 0);
                const iqGainStr  = displayIqGain(entry);
                const subStr     = displaySub(entry);
                const isTop3     = i < 3;
                const iqGainVal  = period === 'daily' ? (entry.iq_change ?? 0) : (entry.total_iq_gained ?? 0);

                // Rank badge
                const rankEl = i === 0
                  ? <span style={{ fontSize: 18 }}>👑</span>
                  : i === 1
                    ? <span style={{ color: '#b0bec5', ...MONO, fontSize: 12 }}>#2</span>
                    : i === 2
                      ? <span style={{ color: '#cd7f32', ...MONO, fontSize: 12 }}>#3</span>
                      : <span style={{ color: '#334466', ...MONO, fontSize: 11 }}>#{i + 1}</span>;

                return (
                  <div
                    key={entry.user_id}
                    style={{
                      borderBottom: '1px solid #0f0f1e',
                      background:   isMe ? '#00ff8808' : 'transparent',
                      borderLeft:   isMe ? '3px solid #00ff88' : '3px solid transparent',
                      transition:   'background 0.15s',
                    }}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    {/* Rank */}
                    <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
                      {rankEl}
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {entry.avatar ? (
                        <img
                          src={entry.avatar}
                          alt=""
                          style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          background: isTop3 ? `${titleInfo.color}18` : '#1a1a2e',
                          border: isTop3 ? `1px solid ${titleInfo.color}40` : '1px solid #1e1e2e',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: isTop3 ? titleInfo.color : '#334466', ...MONO, fontSize: 11 }}>
                            {(entry.name ?? 'A')[0].toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="min-w-0">
                        <p style={{ color: isMe ? '#e8eaf0' : '#aab8cc', ...SANS, fontSize: 12 }}
                          className="truncate font-medium">
                          {entry.name ?? 'Anonymous'}
                          {isMe && (
                            <span style={{ color: '#00ff88', ...MONO, fontSize: 8 }} className="ml-1.5">YOU</span>
                          )}
                        </p>
                        {/* Tier + score/time sub-label */}
                        <p style={{ color: titleInfo.color, ...MONO, fontSize: 8 }}>
                          {titleInfo.emoji} {titleInfo.title} · <span style={{ color: '#445566' }}>{subStr}</span>
                        </p>
                      </div>
                    </div>

                    {/* IQ number */}
                    <div style={{ width: 48, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ color: titleInfo.color, ...MONO, fontSize: 11, fontWeight: 600 }}>
                        {entry.investor_iq ?? 0}
                      </p>
                      <p style={{ color: '#2a2a4a', ...MONO, fontSize: 8 }}>IQ</p>
                    </div>

                    {/* IQ gain (primary ranking value) */}
                    <div style={{ width: 56, textAlign: 'right', flexShrink: 0 }}>
                      <p style={{
                        color:       iqGainVal > 0 ? (i === 0 ? '#00ff88' : isMe ? '#e8eaf0' : '#8899aa') : '#ff4466',
                        ...MONO, fontSize: 14, fontWeight: 700,
                      }}>
                        {iqGainStr}
                      </p>
                      <p style={{ color: '#334466', ...MONO, fontSize: 8 }}>
                        {period === 'daily' ? 'today' : 'period'}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Current user if not in top 20 */}
              {myRank === -1 && user && (
                <div
                  style={{ borderTop: '1px solid #1e1e2e', background: '#00ff8808', borderLeft: '3px solid #00ff88' }}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <div style={{ width: 28, textAlign: 'center' }}>
                    <span style={{ color: '#334466', ...MONO, fontSize: 11 }}>—</span>
                  </div>
                  <p style={{ color: '#00ff88', ...MONO, fontSize: 11 }}>
                    {period === 'daily'
                      ? "You haven't submitted yet today"
                      : "You're not on the board yet"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
