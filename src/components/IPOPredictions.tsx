/**
 * IPOPredictions — vote on IPO listing outcomes.
 * Users predict listing price direction and earn coins.
 * Vote: 1X (100 coins), Correct: 5X (500 coins).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Clock, CheckCircle, Users, Coins, History, RefreshCw } from 'lucide-react';

const C: Record<string, string> = {
  bg:     '#07070e',
  card:   '#0d0d1e',
  border: '#1e1e2e',
  green:  '#00ff88',
  red:    '#ff4466',
  text:   '#e8eaf0',
  muted:  '#888899',
  dim:    '#444455',
  blue:   '#3b9eff',
  pink:   '#ff3bff',
  yellow: '#ffdd3b',
  orange: '#ff9f3b',
};

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface CommunityOption {
  answer: string;
  count: number;
  percent: number;
}

interface IPOPrediction {
  id: number;
  ipoName: string;
  symbol: string | null;
  openDate: string | null;
  listingDate: string | null;
  questionType: string;
  priceBand: { low: number | null; high: number | null } | null;
  gmp: number | null;
  lotSize: number | null;
  subscription: number | null;
  category: string;
  userVote: string | null;
  alreadyVoted: boolean;
  communityStats: { totalVotes: number; options: CommunityOption[] };
  voteReward: number;
  correctReward: number;
}

const VOTE_OPTIONS = [
  { answer: 'Above Issue Price', emoji: '📈', color: C.green, icon: TrendingUp },
  { answer: 'Below Issue Price', emoji: '📉', color: C.red, icon: TrendingDown },
];

export default function IPOPredictions({ authToken }: { authToken?: string }) {
  const [predictions, setPredictions] = useState<IPOPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<number | null>(null);
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const [history, setHistory] = useState<any[]>([]);

  const fetchPredictions = useCallback(async () => {
    if (!authToken) { setLoading(false); return; }
    try {
      const res = await fetch('/api/ipo-predictions/open', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPredictions(data.predictions ?? []);
      }
    } catch {}
    finally { setLoading(false); }
  }, [authToken]);

  const fetchHistory = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/ipo-predictions/history', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.entries ?? []);
      }
    } catch {}
  }, [authToken]);

  useEffect(() => { fetchPredictions(); }, [fetchPredictions]);
  useEffect(() => { if (tab === 'history') fetchHistory(); }, [tab, fetchHistory]);

  const handleVote = async (predId: number, answer: string) => {
    if (!authToken || voting) return;
    setVoting(predId);
    try {
      const res = await fetch(`/api/ipo-predictions/${predId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ answer }),
      });
      if (res.ok) {
        fetchPredictions(); // refresh to show community stats
      }
    } catch {}
    finally { setVoting(null); }
  };

  if (!authToken) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <TrendingUp size={32} color={C.pink} />
        <p style={{ color: C.muted, ...MONO, fontSize: 12, marginTop: 12 }}>
          Sign in to predict IPO outcomes
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, height: 180,
          animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <TrendingUp size={16} color={C.pink} />
        <span style={{ color: C.pink, ...MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          IPO Predictions
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderRadius: 8, overflow: 'hidden',
        border: `1px solid ${C.border}` }}>
        {(['open', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
              background: tab === t ? C.pink + '20' : 'transparent',
              color: tab === t ? C.pink : C.muted,
              ...MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
              borderRight: t === 'open' ? `1px solid ${C.border}` : 'none',
            }}>
            {t === 'open' ? 'Active' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'open' ? (
        <>
          {predictions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Clock size={28} color={C.dim} />
              <p style={{ color: C.muted, ...SANS, fontSize: 13, marginTop: 10 }}>
                No active IPO predictions right now.
              </p>
              <p style={{ color: C.dim, ...SANS, fontSize: 11, marginTop: 4 }}>
                Predictions appear automatically when IPOs are about to list.
              </p>
              <button onClick={() => { setLoading(true); fetchPredictions(); }}
                style={{ marginTop: 12, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.pink, padding: '6px 14px', cursor: 'pointer', ...MONO, fontSize: 11 }}>
                <RefreshCw size={12} style={{ marginRight: 4 }} /> Refresh
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {predictions.map(p => (
                <IPOCard key={p.id} prediction={p} onVote={handleVote} voting={voting === p.id} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 ? (
            <p style={{ color: C.muted, ...SANS, fontSize: 13, textAlign: 'center', padding: 20 }}>
              No prediction history yet.
            </p>
          ) : (
            history.map((h, i) => (
              <div key={i} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <p style={{ color: C.text, ...SANS, fontSize: 13, margin: 0 }}>{h.ipoName}</p>
                  <p style={{ color: C.muted, ...MONO, fontSize: 10, margin: '3px 0 0' }}>
                    Your vote: {h.userAnswer} {h.isCorrect === true ? '✅' : h.isCorrect === false ? '❌' : '⏳'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {h.isCorrect !== null ? (
                    <span style={{ color: h.isCorrect ? C.green : C.red, ...MONO, fontSize: 12 }}>
                      {h.isCorrect ? `+${h.coinsAwarded}` : '0'} coins
                    </span>
                  ) : (
                    <span style={{ color: C.orange, ...MONO, fontSize: 10 }}>Pending</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function IPOCard({ prediction: p, onVote, voting, ...rest }: {
  prediction: IPOPrediction;
  onVote: (id: number, answer: string) => void;
  voting: boolean;
  [key: string]: any;
}) {
  const daysUntilListing = p.listingDate
    ? Math.ceil((new Date(p.listingDate).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      borderLeft: `3px solid ${C.pink}`, overflow: 'hidden',
    }}>
      {/* IPO header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h4 style={{ color: C.text, ...SANS, fontSize: 14, margin: 0, fontWeight: 500 }}>
              {p.ipoName}
            </h4>
            {p.symbol && (
              <span style={{ color: C.pink, ...MONO, fontSize: 10 }}>{p.symbol}</span>
            )}
          </div>
          {daysUntilListing !== null && daysUntilListing >= 0 && (
            <span style={{
              background: C.orange + '20', color: C.orange, ...MONO, fontSize: 10,
              padding: '3px 8px', borderRadius: 6,
            }}>
              {daysUntilListing === 0 ? 'Lists Today' : `Lists in ${daysUntilListing}d`}
            </span>
          )}
        </div>

        {/* IPO stats */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {p.priceBand && p.priceBand.high && (
            <span style={{ color: C.muted, ...MONO, fontSize: 10 }}>
              Band: {p.priceBand.low}-{p.priceBand.high}
            </span>
          )}
          {p.gmp !== null && (
            <span style={{ color: p.gmp > 0 ? C.green : C.red, ...MONO, fontSize: 10 }}>
              GMP: {p.gmp > 0 ? '+' : ''}{p.gmp}
            </span>
          )}
          {p.subscription !== null && p.subscription > 0 && (
            <span style={{ color: C.blue, ...MONO, fontSize: 10 }}>
              {p.subscription.toFixed(1)}x subscribed
            </span>
          )}
          {p.listingDate && (
            <span style={{ color: C.dim, ...MONO, fontSize: 10 }}>
              Listing: {p.listingDate}
            </span>
          )}
        </div>
      </div>

      {/* Question + voting */}
      <div style={{ padding: 16 }}>
        <p style={{ color: C.text, ...SANS, fontSize: 13, margin: '0 0 4px', lineHeight: 1.4 }}>
          Will {p.ipoName} list above or below issue price?
        </p>
        <p style={{ color: C.dim, ...MONO, fontSize: 10, margin: '0 0 12px' }}>
          Vote: +{p.voteReward} coins | Correct: +{p.correctReward} coins
        </p>

        {p.alreadyVoted ? (
          <>
            {/* Already voted — show community stats */}
            <div style={{
              background: C.green + '10', border: `1px solid ${C.green}30`, borderRadius: 10,
              padding: '8px 12px', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <CheckCircle size={14} color={C.green} />
              <span style={{ color: C.green, ...MONO, fontSize: 11 }}>
                You voted: {p.userVote}
              </span>
            </div>

            {/* Community stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {VOTE_OPTIONS.map(opt => {
                const stat = p.communityStats.options.find(o => o.answer === opt.answer);
                const pct = stat?.percent ?? 0;
                return (
                  <div key={opt.answer} style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${pct}%`, background: opt.color + '12', borderRadius: 8,
                      transition: 'width 0.5s ease',
                    }} />
                    <div style={{
                      position: 'relative', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '8px 12px', borderRadius: 8,
                      border: `1px solid ${p.userVote === opt.answer ? opt.color + '50' : C.border}`,
                    }}>
                      <span style={{ color: C.text, ...SANS, fontSize: 12 }}>
                        {opt.emoji} {opt.answer}
                      </span>
                      <span style={{ color: opt.color, ...MONO, fontSize: 11 }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Users size={11} color={C.dim} />
                <span style={{ color: C.dim, ...MONO, fontSize: 10 }}>
                  {p.communityStats.totalVotes} votes
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Vote buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {VOTE_OPTIONS.map(opt => (
                <button key={opt.answer}
                  onClick={() => onVote(p.id, opt.answer)}
                  disabled={voting}
                  style={{
                    flex: 1, padding: '12px 8px', border: `1.5px solid ${opt.color}40`,
                    borderRadius: 10, cursor: voting ? 'default' : 'pointer',
                    background: opt.color + '08', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 6, transition: 'all 0.2s',
                    opacity: voting ? 0.6 : 1,
                  }}>
                  <opt.icon size={20} color={opt.color} />
                  <span style={{ color: opt.color, ...MONO, fontSize: 11, fontWeight: 500 }}>
                    {opt.answer}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
