import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const GREEN  = '#00ff88';
const RED    = '#ff4466';
const BORDER = '#1a1a2e';
const TEXT   = '#e8eaf0';
const MUTED  = '#888899';
const DIM    = '#556688';
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface LedgerEntry {
  id:            number;
  action_type:   string;
  amount:        number;
  balance_after: number;
  note:          string | null;
  created_at:    number;
}

interface HubData {
  virtualBalance: number;
  coinLedger:     LedgerEntry[];
}

const ACTION_LABELS: Record<string, string> = {
  FIRST_LOGIN:           'Welcome bonus',
  DAILY_LOGIN:           'Daily login',
  DAILY_STREAK:          'Login streak',
  VIRTUAL_TRADE:         'Trade activity',
  PORTFOLIO_PROFIT:      'Profitable sell',
  REFERRAL:              'Referral bonus',
  PULSE_SWIPE:           'Pulse swipe',
  PULSE_CORRECT:         'Pulse correct',
  CHARTGUESSR_CORRECT:   'Chart guess correct',
  CHARTGUESSR_WRONG:     'Chart guess wrong',
  CHARTGUESSR_STREAK:    'Chart streak bonus',
  POLL_VOTE:             'Poll vote',
  POLL_VOTE_BONUS:       'Poll bonus',
  SHARE_ARTICLE:         'Share article',
  SHARE_ARTICLE_BONUS:   'Share bonus',
  AI_SUMMARY_READ:       'AI summary read',
  ARTICLE_LISTEN:        'Article listen',
  DAILY_READING_STREAK:  'Reading streak',
  ADMIN_GRANT:           'Admin grant',
  PURCHASE:              'Purchase',
  QUIZ_CORRECT:          'Quiz correct',
  QUIZ_BONUS:            'Quiz bonus',
  QUIZ_PODIUM_DAILY:     'Quiz podium · daily',
  QUIZ_PODIUM_WEEKLY:    'Quiz podium · weekly',
  QUIZ_PODIUM_MONTHLY:   'Quiz podium · monthly',
  PREDICTION_VOTE:       'Prediction vote',
  PREDICTION_CORRECT:    'Prediction correct',
  NEWS_IMPACT_CORRECT:   'News quiz correct',
  IPO_PREDICTION:        'IPO prediction',
  IPO_CORRECT:           'IPO correct',
};

const EARN_OPTIONS = [
  { icon: '⚡', label: 'Pulse — Bull/Bear Swiper', desc: '5/swipe · +20 bonus when right after 24h',     reward: '+520',  href: '/app',           color: '#ff9f3b' },
  { icon: '📊', label: 'Chartguessr',              desc: '20/correct · streak bonus up to 1000',          reward: '+1000', href: '/app',           color: '#3b9eff' },
  { icon: '📈', label: 'Trade Stocks',             desc: '50/trade · 500 bonus for 5%+ profit',           reward: '+550',  href: '/paper-trading', color: GREEN     },
  { icon: '📅', label: 'Daily Login Streak',       desc: '100 base + 50/day streak (max 500)',            reward: '+600',  href: '/rewards',       color: '#3bffee' },
  { icon: '👥', label: 'Refer a Friend',           desc: 'Both get 500 coins on signup',                  reward: '+500',  href: '/rewards',       color: '#ffdd3b' },
  { icon: '🗳️', label: 'Vote on Polls',           desc: '10/vote · +50 at 5 today · +150 at 15 today',   reward: '+500',  href: '/app',           color: '#b366ff' },
  { icon: '🔗', label: 'Share Articles',           desc: '25/share · +50 multi-platform · +500 viral',    reward: '+750',  href: '/app',           color: '#ff3bff' },
  { icon: '🧠', label: 'Market Quiz',              desc: '100/correct × IQ tier multiplier · podium bonus', reward: '+2400', href: '/app',         color: '#3b9eff' },
];

function formatTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function CoinsPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, virtualBalance } = useAuth();
  const [tab, setTab] = useState<'history' | 'earn'>('history');
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session?.access_token) return;
    setLoading(true);
    fetch('/api/rewards/hub', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d) => setData({
        virtualBalance: d.virtualBalance ?? virtualBalance ?? 0,
        coinLedger:     d.coinLedger     ?? [],
      }))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, session?.access_token, virtualBalance]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const balance = data?.virtualBalance ?? virtualBalance ?? 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '5vh 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0d0d1e', border: `1px solid ${BORDER}`,
          borderRadius: 12, width: '100%', maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 18px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ color: DIM, ...MONO, fontSize: 10, letterSpacing: '0.08em' }}>YOUR COINS</div>
            <div style={{ color: GREEN, ...MONO, fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              🪙 {balance.toLocaleString('en-IN')}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
              color: MUTED, cursor: 'pointer', padding: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}` }}>
          {(['history', 'earn'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 12px', background: 'none',
                border: 'none', cursor: 'pointer',
                color: tab === t ? GREEN : MUTED,
                borderBottom: tab === t ? `2px solid ${GREEN}` : '2px solid transparent',
                ...MONO, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600,
              }}
            >
              {t === 'history' ? 'HISTORY' : 'WAYS TO EARN'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          {tab === 'history' && (
            <>
              {loading && (
                <div style={{ color: MUTED, ...SANS, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  Loading…
                </div>
              )}
              {!loading && (!data || data.coinLedger.length === 0) && (
                <div style={{ color: MUTED, ...SANS, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  No coin activity yet. Start earning from the “Ways to Earn” tab.
                </div>
              )}
              {!loading && data && data.coinLedger.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.coinLedger.map(e => {
                    const positive = e.amount >= 0;
                    const label = ACTION_LABELS[e.action_type] ?? e.action_type;
                    return (
                      <div key={e.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#09091a', border: `1px solid ${BORDER}`,
                        borderRadius: 8, padding: '10px 12px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: TEXT, ...SANS, fontSize: 13, fontWeight: 500 }}>
                            {label}
                          </div>
                          {e.note && (
                            <div style={{
                              color: MUTED, ...SANS, fontSize: 11, marginTop: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {e.note}
                            </div>
                          )}
                          <div style={{ color: DIM, ...MONO, fontSize: 10, marginTop: 2 }}>
                            {formatTime(e.created_at)}
                          </div>
                        </div>
                        <div style={{
                          color: positive ? GREEN : RED, ...MONO,
                          fontSize: 13, fontWeight: 700, flexShrink: 0,
                        }}>
                          {positive ? '+' : ''}{e.amount.toLocaleString('en-IN')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'earn' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EARN_OPTIONS.map(opt => (
                <a
                  key={opt.label}
                  href={opt.href}
                  onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#09091a', border: `1px solid ${BORDER}`,
                    borderRadius: 8, padding: '10px 12px',
                    textDecoration: 'none', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = opt.color + '50')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: TEXT, ...SANS, fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ color: MUTED, ...SANS, fontSize: 11, marginTop: 1 }}>{opt.desc}</div>
                  </div>
                  <span style={{
                    color: opt.color, ...MONO, fontSize: 11, fontWeight: 700,
                    background: opt.color + '12', border: `1px solid ${opt.color}25`,
                    borderRadius: 4, padding: '2px 7px', flexShrink: 0,
                  }}>
                    {opt.reward}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
