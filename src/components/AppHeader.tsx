import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/* ─── Design tokens ──────────────────────────────────────────────────────────── */
const GREEN  = '#00ff88';
const BORDER = '#1a1a2e';
const TEXT   = '#e8eaf0';
const MUTED  = '#888899';
const DIM    = '#556688';
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };

/* ─── Types ──────────────────────────────────────────────────────────────────── */
export interface NavTab {
  label:    string;
  href?:    string;
  onClick?: () => void;
  active?:  boolean;
  icon?:    React.ReactNode;
}

export interface AppHeaderProps {
  /** Show live IST clock (use on /app, /paper-trading) */
  showClock?: boolean;
  /** Show MARKET OPEN/CLOSED badge */
  showMarketStatus?: boolean;

  /* Refresh button */
  onRefresh?: () => void;
  refreshing?: boolean;

  /* Auth callbacks */
  onSignIn?:  () => void;

  /* Desktop centre nav — pass href-based or onClick-based tabs */
  navTabs?: NavTab[];
}

/* ─── Market status helper ───────────────────────────────────────────────────── */
function calcMarketStatus() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const t   = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (t >= 9 * 60 + 15 && t <= 15 * 60 + 30)
    return { label: 'MARKET OPEN',     color: GREEN,     live: true  };
  if (t >= 6 * 60 && t <= 20 * 60)
    return { label: 'PRE/POST MARKET', color: '#ffdd00', live: false };
  return   { label: 'MARKET CLOSED',  color: DIM,       live: false };
}

/* ─── Coin earn options (inline data — no extra file dep) ───────────────────── */
const EARN_OPTIONS = [
  { icon: '🏏', label: 'Dalal Street T20',         desc: '1/run · century +200 · double-ton +500',    reward: '+2000', href: '/t20',           color: '#00ff88', isNew: true },
  { icon: '🎯', label: 'Combo Card',               desc: 'Daily 5-Q lottery · 5/5 = 5,000 jackpot',   reward: '+5000', href: '/combo',         color: '#3b9eff', isNew: true },
  { icon: '⚡', label: 'Pulse — Bull/Bear Swiper', desc: '5/swipe · +20 bonus when right after 24h',  reward: '+520',  href: '/pulse',         color: '#ff9f3b' },
  { icon: '📊', label: 'Chartguessr',              desc: '20/correct · streak bonus up to 1000',      reward: '+1000', href: '/chartguessr',   color: '#3b9eff' },
  { icon: '📈', label: 'Trade Stocks',             desc: '50/trade · 500 bonus for 5%+ profit',       reward: '+550',  href: '/paper-trading', color: '#00ff88' },
  { icon: '📅', label: 'Daily Login Streak',       desc: '100 base + 50/day streak (max 500)',        reward: '+600',  href: '/rewards',       color: '#3bffee' },
  { icon: '👥', label: 'Refer a Friend',           desc: 'Both get 500 coins on signup',              reward: '+500',  href: '/rewards',       color: '#ffdd3b' },
  { icon: '🗳️', label: 'Vote on Polls',           desc: '10/vote · +50 at 5 today · +150 at 15 today', reward: '+500', href: '/app',          color: '#b366ff' },
  { icon: '🔗', label: 'Share Articles',           desc: '25/share · +50 multi-platform · +500 viral', reward: '+750', href: '/app',           color: '#ff3bff' },
  { icon: '🧠', label: 'Market Quiz',              desc: '100/correct × IQ tier multiplier · podium bonus', reward: '+2400', href: '/app',     color: '#3b9eff' },
];

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
  COMBO_CARD_3OF5:       'Combo Card · 3/5',
  COMBO_CARD_4OF5:       'Combo Card · 4/5',
  COMBO_CARD_5OF5:       'Combo Card · 5/5 🔥',
  T20_RUNS:              'T20 runs',
  T20_CENTURY:           'T20 century 💯',
  T20_DOUBLE_TON:        'T20 double-ton 🚀',
};

interface LedgerEntry {
  id:            number;
  action_type:   string;
  amount:        number;
  balance_after: number;
  note:          string | null;
  created_at:    number;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/* ─── Injected CSS ───────────────────────────────────────────────────────────── */
const HEADER_CSS = `
  .ah-desktop-nav { display: flex; }
  .ah-hide-xs { display: flex; }
  .ah-hide-sm { display: flex; }

  @media (max-width: 1023px) {
    .ah-desktop-nav { display: none !important; }
  }
  @media (max-width: 600px) {
    .ah-hide-xs { display: none !important; }
  }
  @media (max-width: 400px) {
    .ah-hide-sm { display: none !important; }
  }

  .ah-nav-tab {
    color: ${MUTED};
    font-family: 'DM Mono', monospace;
    font-size: 0.67rem;
    letter-spacing: 0.08em;
    padding: 6px 14px 8px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: color 0.15s;
    white-space: nowrap;
  }
  .ah-nav-tab:hover { color: ${GREEN}; }
  .ah-nav-tab.active {
    color: ${GREEN};
    border-bottom-color: ${GREEN};
  }

  .ah-btn {
    transition: opacity 0.15s, transform 0.12s;
    cursor: pointer;
  }
  .ah-btn:hover  { opacity: 0.85; }
  .ah-btn:active { transform: scale(0.97); }
`;

/* ─── AppHeader ──────────────────────────────────────────────────────────────── */
export function AppHeader({
  showClock        = false,
  showMarketStatus = false,
  onRefresh,
  refreshing       = false,
  onSignIn,
  navTabs          = [],
}: AppHeaderProps) {
  const { user, profile, loading, coins, virtualBalance, signOut } = useAuth();

  // SQLite virtual_coin_balance is the single source of truth. Supabase
  // profile.coins is a read-only mirror that stays 0, so never prefer it.
  const displayCoins = virtualBalance;
  // Silence unused-var warning — `coins` is kept on the context for other callers.
  void coins;

  const [istTime, setIstTime]       = useState('');
  const [mStatus, setMStatus]       = useState(calcMarketStatus);
  const [dropdownOpen, setDropdown] = useState(false);
  const [coinsOpen, setCoinsOpen]   = useState(false);
  const dropdownRef                 = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleSignOut = async () => {
    setDropdown(false);
    await signOut();
    window.location.href = '/';
  };

  // Initials fallback for avatar
  const displayName = user?.user_metadata?.full_name || user?.email || '';
  const initials    = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  /* Live clock — only runs when showClock or showMarketStatus is true */
  useEffect(() => {
    if (!showClock && !showMarketStatus) return;
    const tick = () => {
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const hh  = ist.getUTCHours()  .toString().padStart(2, '0');
      const mm  = ist.getUTCMinutes().toString().padStart(2, '0');
      const ss  = ist.getUTCSeconds().toString().padStart(2, '0');
      setIstTime(`${hh}:${mm}:${ss}`);
      setMStatus(calcMarketStatus());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [showClock, showMarketStatus]);

  return (
    <>
      <style>{HEADER_CSS}</style>

      <header style={{
        background:    'rgba(7,7,14,0.97)',
        borderBottom:  `1px solid ${BORDER}`,
        backdropFilter:'blur(14px)',
        height:         56,
        display:       'flex',
        alignItems:    'center',
        padding:       '0 clamp(0.75rem,3vw,2rem)',
        justifyContent:'space-between',
        gap:            12,
        position:      'sticky',
        top:            0,
        zIndex:         40,
      }}>

        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <a href="/" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <img src="/ms-navbar.svg" alt="Market Samachar" style={{ height: 28, width: 'auto' }} />
        </a>

        {/* ── Desktop centre nav ────────────────────────────────────────────── */}
        {navTabs.length > 0 && (
          <nav className="ah-desktop-nav" style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
          }}>
            {navTabs.map(tab => (
              tab.href ? (
                <a
                  key={tab.label}
                  href={tab.href}
                  className={`ah-nav-tab${tab.active ? ' active' : ''}`}
                >
                  {tab.icon && <span style={{ display: 'flex' }}>{tab.icon}</span>}
                  {tab.label}
                </a>
              ) : (
                <button
                  key={tab.label}
                  onClick={tab.onClick}
                  className={`ah-nav-tab${tab.active ? ' active' : ''}`}
                >
                  {tab.icon && <span style={{ display: 'flex' }}>{tab.icon}</span>}
                  {tab.label}
                </button>
              )
            ))}
          </nav>
        )}

        {/* ── Right controls ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

          {/* IST clock */}
          {showClock && istTime && (
            <div className="ah-hide-xs" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: DIM, ...MONO, fontSize: '0.6rem', letterSpacing: '0.07em' }}>IST</span>
              <span style={{ color: TEXT, ...MONO, fontSize: '0.82rem', fontWeight: 600 }}>{istTime}</span>
            </div>
          )}

          {/* Market status */}
          {showMarketStatus && (
            <div className="ah-hide-xs" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {mStatus.live && (
                <span
                  className="pulse-green"
                  style={{ width: 6, height: 6, borderRadius: '50%', background: mStatus.color, display: 'inline-block' }}
                />
              )}
              <span style={{ color: mStatus.color, ...MONO, fontSize: '0.58rem', letterSpacing: '0.08em' }}>
                {mStatus.label}
              </span>
            </div>
          )}

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="ah-btn"
              style={{
                background:  '#0d0d1e',
                border:      `1px solid ${BORDER}`,
                color:       refreshing ? GREEN : DIM,
                ...MONO,     fontSize: '0.62rem', letterSpacing: '0.05em',
                display:     'flex', alignItems: 'center', gap: 5,
                padding:     '4px 10px', borderRadius: 6,
                opacity:     refreshing ? 0.7 : 1,
              }}
            >
              <RefreshCw size={12} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              <span className="ah-hide-xs">REFRESH</span>
            </button>
          )}

          {/* Auth area */}
          {loading ? (
            /* Skeleton while session resolves */
            <div style={{
              width: 90, height: 28, borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              animation: 'pulse 1.4s ease-in-out infinite',
            }} />
          ) : user ? (
            <>
              {/* Coin balance — click for history + ways to earn */}
              <button
                onClick={() => setCoinsOpen(true)}
                aria-label="View coin history and ways to earn"
                title="Coin history & ways to earn"
                className="ah-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)',
                  borderRadius: 6, padding: '4px 10px',
                  color: GREEN, ...MONO, fontSize: '0.72rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🪙 {displayCoins.toLocaleString('en-IN')}
              </button>

              {/* Avatar + dropdown */}
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setDropdown(o => !o)}
                  className="ah-btn"
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer',
                  }}
                  aria-label="Account menu"
                >
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={displayName}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      style={{
                        width: 30, height: 30, borderRadius: '50%',
                        border: `1.5px solid ${GREEN}`, objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      border: `1.5px solid ${GREEN}`,
                      background: 'rgba(0,255,136,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: GREEN, ...MONO, fontSize: '0.65rem', fontWeight: 700,
                    }}>
                      {initials}
                    </div>
                  )}
                </button>

                {dropdownOpen && (
                  <div style={{
                    position: 'absolute', top: 38, right: 0,
                    background: '#0d0d1e', border: `1px solid ${BORDER}`,
                    borderRadius: 8, minWidth: 180, zIndex: 100,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: '10px 14px 8px' }}>
                      <p style={{ color: TEXT, ...MONO, fontSize: '0.75rem', fontWeight: 600, margin: 0 }}>
                        {displayName}
                      </p>
                      <p style={{ color: MUTED, fontFamily: 'DM Sans, sans-serif', fontSize: '0.68rem', margin: '2px 0 0' }}>
                        {user.email}
                      </p>
                    </div>
                    <div style={{ borderTop: `1px solid ${BORDER}` }} />
                    <button
                      onClick={handleSignOut}
                      style={{
                        width: '100%', background: 'none', border: 'none',
                        color: '#ff4466', ...MONO, fontSize: '0.72rem',
                        padding: '9px 14px', textAlign: 'left', cursor: 'pointer',
                        display: 'block',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,68,102,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      SIGN OUT
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={onSignIn}
                className="ah-btn ah-hide-sm"
                style={{
                  background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
                  color: MUTED, ...MONO, fontSize: '0.62rem',
                  padding: '4px 10px',
                }}
              >
                LOG IN
              </button>
              <button
                onClick={onSignIn}
                className="ah-btn"
                style={{
                  background: 'none', border: `1px solid ${GREEN}`, borderRadius: 6,
                  color: GREEN, ...MONO, fontSize: '0.67rem', fontWeight: 600,
                  padding: '5px 14px',
                }}
              >
                SIGN UP FREE
              </button>
            </>
          )}

        </div>
      </header>

      <CoinsPopupInline
        open={coinsOpen}
        onClose={() => setCoinsOpen(false)}
        balance={displayCoins}
      />
    </>
  );
}

/* ─── Inline coins popup ─────────────────────────────────────────────────────── */
function CoinsPopupInline({ open, onClose, balance }: {
  open:    boolean;
  onClose: () => void;
  balance: number;
}) {
  const { session } = useAuth();
  const [tab, setTab]         = useState<'history' | 'earn'>('history');
  const [ledger, setLedger]   = useState<LedgerEntry[] | null>(null);
  const [loadingL, setLoadingL] = useState(false);

  useEffect(() => {
    if (!open || !session?.access_token) return;
    setLoadingL(true);
    fetch('/api/rewards/hub', {
      headers: { Authorization: 'Bearer ' + session.access_token },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => setLedger(Array.isArray(d?.coinLedger) ? d.coinLedger : []))
      .catch(() => setLedger([]))
      .finally(() => setLoadingL(false));
  }, [open, session?.access_token]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const TXT = '#e8eaf0';

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
          background: '#0d0d1e', border: '1px solid ' + BORDER,
          borderRadius: 12, width: '100%', maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        }}
      >
        <div style={{
          padding: '16px 18px', borderBottom: '1px solid ' + BORDER,
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
              background: 'none', border: '1px solid ' + BORDER, borderRadius: 6,
              color: MUTED, cursor: 'pointer', padding: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid ' + BORDER }}>
          {(['history', 'earn'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 12px', background: 'none',
                border: 'none', cursor: 'pointer',
                color: tab === t ? GREEN : MUTED,
                borderBottom: tab === t ? '2px solid ' + GREEN : '2px solid transparent',
                ...MONO, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600,
              }}
            >
              {t === 'history' ? 'HISTORY' : 'WAYS TO EARN'}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          {tab === 'history' && (
            <>
              {loadingL && (
                <div style={{ color: MUTED, fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  Loading...
                </div>
              )}
              {!loadingL && (!ledger || ledger.length === 0) && (
                <div style={{ color: MUTED, fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                  No coin activity yet. Check the Earn tab.
                </div>
              )}
              {!loadingL && ledger && ledger.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ledger.map(e => {
                    const positive = e.amount >= 0;
                    const lbl = ACTION_LABELS[e.action_type] ?? e.action_type;
                    return (
                      <div key={e.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#09091a', border: '1px solid ' + BORDER,
                        borderRadius: 8, padding: '10px 12px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: TXT, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500 }}>
                            {lbl}
                          </div>
                          {e.note && (
                            <div style={{
                              color: MUTED, fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {e.note}
                            </div>
                          )}
                          <div style={{ color: DIM, ...MONO, fontSize: 10, marginTop: 2 }}>
                            {formatRelativeTime(e.created_at)}
                          </div>
                        </div>
                        <div style={{
                          color: positive ? GREEN : '#ff4466', ...MONO,
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
                    background: opt.isNew ? `linear-gradient(90deg, ${opt.color}10, #09091a 60%)` : '#09091a',
                    border: '1px solid ' + (opt.isNew ? opt.color + '40' : BORDER),
                    borderRadius: 8, padding: '12px 12px',
                    textDecoration: 'none',
                    minHeight: 44,
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: TXT, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                      {opt.isNew && (
                        <span style={{
                          ...MONO, fontSize: 8, color: '#ffdd3b',
                          background: 'rgba(255,221,59,0.1)', border: '1px solid #ffdd3b40',
                          borderRadius: 3, padding: '1px 5px', letterSpacing: '0.08em', fontWeight: 700,
                        }}>NEW</span>
                      )}
                    </div>
                    <div style={{ color: MUTED, fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginTop: 1 }}>{opt.desc}</div>
                  </div>
                  <span style={{
                    color: opt.color, ...MONO, fontSize: 11, fontWeight: 700,
                    background: opt.color + '12', border: '1px solid ' + opt.color + '25',
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
