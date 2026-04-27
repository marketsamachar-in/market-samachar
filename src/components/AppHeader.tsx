import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
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
              {/* Coin balance */}
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)',
                borderRadius: 6, padding: '4px 10px',
                color: GREEN, ...MONO, fontSize: '0.72rem', fontWeight: 600,
              }}>
                🪙 {displayCoins.toLocaleString('en-IN')}
              </span>

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
    </>
  );
}
