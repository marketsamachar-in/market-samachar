/**
 * CommunityPollPopup — bullish / bearish / neutral sentiment poll for a
 * single article. Fetches GET /api/news/poll/:id, posts to
 * /api/news/poll/:id/vote, awards +3 coins on first vote per article.
 */

import { useEffect, useState } from 'react';

const MONO = "'DM Mono', monospace";
const SANS = "'DM Sans', sans-serif";

const AMBER  = '#ff9f3b';
const GREEN  = '#00ff88';
const RED    = '#ff4444';
const GREY   = '#888899';
const DIM    = '#556677';
const BORDER = '#1e1e2e';

type VoteKey = 'bullish' | 'bearish' | 'neutral';

interface VoteCounts {
  bullish: number;
  bearish: number;
  neutral: number;
  total:   number;
}

interface OptionDef {
  key:    VoteKey;
  label:  string;
  emoji:  string;
  color:  string;
  border: string;
}

const OPTIONS: OptionDef[] = [
  { key: 'bullish', label: 'BULLISH', emoji: '📈', color: GREEN, border: 'rgba(0,255,136,0.35)' },
  { key: 'bearish', label: 'BEARISH', emoji: '📉', color: RED,   border: 'rgba(255,68,68,0.35)' },
  { key: 'neutral', label: 'NEUTRAL', emoji: '🤔', color: GREY,  border: 'rgba(136,136,153,0.35)' },
];

interface Props {
  articleId:    string;
  articleTitle: string;
  isSignedIn:   boolean;
  authToken:    string | null;
}

export function CommunityPollPopup({ articleId, articleTitle, isSignedIn, authToken }: Props) {
  const [votes, setVotes]               = useState<VoteCounts>({ bullish: 0, bearish: 0, neutral: 0, total: 0 });
  const [userVote, setUserVote]         = useState<VoteKey | null>(null);
  const [hasVoted, setHasVoted]         = useState(false);
  const [coinsEarned, setCoinsEarned]   = useState(0);
  const [bonusEarned, setBonusEarned]   = useState(0);
  const [bonusReason, setBonusReason]   = useState<string | null>(null);
  const [alreadyCapped, setCapped]      = useState(false);
  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/news/poll/${encodeURIComponent(articleId)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok) {
          setVotes({
            bullish: data.bullish ?? 0,
            bearish: data.bearish ?? 0,
            neutral: data.neutral ?? 0,
            total:   data.total   ?? 0,
          });
        }
      })
      .catch(() => { /* swallow — show empty bars */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [articleId]);

  async function castVote(vote: VoteKey) {
    if (!isSignedIn || !authToken || submitting || hasVoted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/news/poll/${encodeURIComponent(articleId)}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${authToken}`,
        },
        body: JSON.stringify({ vote }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Failed to record vote');
        return;
      }
      setVotes({
        bullish: data.bullish ?? 0,
        bearish: data.bearish ?? 0,
        neutral: data.neutral ?? 0,
        total:   data.total   ?? 0,
      });
      setUserVote(vote);
      setHasVoted(true);
      setCoinsEarned(data.coinsEarned ?? 0);
      setBonusEarned(data.bonusEarned ?? 0);
      setBonusReason(data.bonusReason ?? null);
      setCapped(!!data.alreadyCapped);
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  // Determine winning option (for highlighting after vote)
  const winningKey: VoteKey | null = votes.total === 0
    ? null
    : (['bullish', 'bearish', 'neutral'] as VoteKey[]).reduce((best, k) =>
        votes[k] > votes[best] ? k : best, 'bullish' as VoteKey);

  return (
    <div style={{ fontFamily: SANS }}>
      {/* Article title */}
      <div style={{
        fontFamily:   SANS,
        fontSize:     14,
        color:        '#e8eaf0',
        lineHeight:   1.4,
        marginBottom: 16,
      }}>
        {articleTitle}
      </div>

      {/* Question */}
      <div style={{
        fontFamily:    MONO,
        fontSize:      12,
        color:         AMBER,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom:  12,
      }}>
        What's your read on this news?
      </div>

      {/* Buttons OR result bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {OPTIONS.map(opt => {
          if (hasVoted) {
            const count = votes[opt.key];
            const pct   = votes.total === 0 ? 0 : Math.round((count / votes.total) * 100);
            const isWinner = winningKey === opt.key;
            const isMine   = userVote === opt.key;
            return (
              <ResultBar
                key={opt.key}
                option={opt}
                count={count}
                pct={pct}
                isWinner={isWinner}
                isMine={isMine}
              />
            );
          }
          return (
            <VoteButton
              key={opt.key}
              option={opt}
              disabled={!isSignedIn || submitting}
              onClick={() => castVote(opt.key)}
            />
          );
        })}
      </div>

      {/* Footer state */}
      {!hasVoted && !isSignedIn && (
        <div style={{
          fontFamily:    MONO,
          fontSize:      11,
          color:         DIM,
          letterSpacing: '0.06em',
          textAlign:     'center',
          padding:       '12px 8px',
          border:        `1px dashed ${BORDER}`,
          borderRadius:  6,
          background:    '#0a0a18',
        }}>
          Sign in to vote · +10 coins per vote · streak bonus +50 at 5 today
        </div>
      )}

      {hasVoted && (
        <div style={{ marginTop: 4 }}>
          {coinsEarned > 0 && (
            <div style={{
              fontFamily:   MONO,
              fontSize:     13,
              color:        '#ffdd3b',
              fontWeight:   700,
              textAlign:    'center',
              padding:      '8px 0',
              animation:    'pulse 1.2s ease-out',
            }}>
              +{coinsEarned}{bonusEarned > 0 ? ` + ${bonusEarned} bonus` : ''} coins! 🪙
            </div>
          )}
          {bonusReason && (
            <div style={{
              fontFamily:    MONO,
              fontSize:      10,
              color:         AMBER,
              letterSpacing: '0.06em',
              textAlign:     'center',
              marginBottom:  4,
            }}>
              🔥 {bonusReason}
            </div>
          )}
          {alreadyCapped && (
            <div style={{
              fontFamily:    MONO,
              fontSize:      10,
              color:         DIM,
              letterSpacing: '0.04em',
              textAlign:     'center',
              marginBottom:  4,
            }}>
              Daily poll cap reached — vote still counts!
            </div>
          )}
          <div style={{
            fontFamily:    MONO,
            fontSize:      10,
            color:         DIM,
            letterSpacing: '0.06em',
            textAlign:     'center',
            textTransform: 'uppercase',
          }}>
            {votes.total} community vote{votes.total === 1 ? '' : 's'}
          </div>
        </div>
      )}

      {loading && !hasVoted && (
        <div style={{
          fontFamily:    MONO,
          fontSize:      10,
          color:         DIM,
          letterSpacing: '0.06em',
          textAlign:     'center',
          marginTop:     8,
        }}>
          LOADING…
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: SANS,
          fontSize:   12,
          color:      RED,
          textAlign:  'center',
          marginTop:  10,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function VoteButton({ option, disabled, onClick }: { option: OptionDef; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background:     'none',
        border:         `1px solid ${disabled ? BORDER : option.border}`,
        borderRadius:   8,
        padding:        12,
        fontFamily:     MONO,
        fontSize:       12,
        fontWeight:     700,
        letterSpacing:  '0.08em',
        color:          disabled ? DIM : option.color,
        cursor:         disabled ? 'not-allowed' : 'pointer',
        width:          '100%',
        opacity:        disabled ? 0.6 : 1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            10,
        transition:     'all 0.15s ease',
      }}
    >
      <span style={{ fontSize: 16 }}>{option.emoji}</span>
      {option.label}
    </button>
  );
}

function ResultBar({ option, count, pct, isWinner, isMine }: {
  option:   OptionDef;
  count:    number;
  pct:      number;
  isWinner: boolean;
  isMine:   boolean;
}) {
  return (
    <div style={{
      position:     'relative',
      border:       `1px solid ${isWinner ? option.border : BORDER}`,
      borderRadius: 8,
      padding:      '10px 12px',
      overflow:     'hidden',
      background:   '#0a0a18',
    }}>
      {/* Fill bar */}
      <div style={{
        position:   'absolute',
        inset:      0,
        width:      `${pct}%`,
        background: isWinner ? `${option.color}25` : `${option.color}12`,
        transition: 'width 0.6s ease-out',
        zIndex:     0,
      }} />
      {/* Label row */}
      <div style={{
        position:       'relative',
        zIndex:         1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            8,
      }}>
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        10,
          fontFamily: MONO,
          fontSize:   12,
          fontWeight: 700,
          color:      isWinner ? option.color : `${option.color}cc`,
          letterSpacing: '0.08em',
        }}>
          <span style={{ fontSize: 16 }}>{option.emoji}</span>
          {option.label}
          {isMine && (
            <span style={{
              fontFamily:    MONO,
              fontSize:      9,
              color:         option.color,
              border:        `1px solid ${option.border}`,
              borderRadius:  3,
              padding:       '1px 5px',
              letterSpacing: '0.08em',
              marginLeft:    4,
            }}>
              YOU
            </span>
          )}
        </div>
        <div style={{
          fontFamily: MONO,
          fontSize:   12,
          fontWeight: 500,
          color:      isWinner ? option.color : '#888899',
        }}>
          {pct}% <span style={{ color: DIM, fontSize: 10 }}>({count})</span>
        </div>
      </div>
    </div>
  );
}
