import React, { useState, useEffect } from 'react';
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

  /* Language selector */
  lang?: string;
  onLangChange?: (l: string) => void;

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
  lang,
  onLangChange,
  onRefresh,
  refreshing       = false,
  onSignIn,
  navTabs          = [],
}: AppHeaderProps) {
  const { user, coins, signOut } = useAuth();

  const [istTime, setIstTime] = useState('');
  const [mStatus, setMStatus] = useState(calcMarketStatus);

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

          {/* Language selector */}
          {onLangChange && (
            <select
              value={lang ?? 'en'}
              onChange={e => onLangChange(e.target.value)}
              style={{
                background: '#0d0d1e', border: `1px solid ${BORDER}`,
                color: MUTED, ...MONO, fontSize: '0.68rem',
                padding: '4px 6px', borderRadius: 6,
                outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="en">EN</option>
              <option value="hi">HI</option>
              <option value="mr">MR</option>
              <option value="ta">TA</option>
              <option value="te">TE</option>
              <option value="bn">BN</option>
              <option value="kn">KN</option>
            </select>
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

          {/* Coin balance (logged in) */}
          {user && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: 6, padding: '4px 10px',
              color: GREEN, ...MONO, fontSize: '0.72rem', fontWeight: 600,
            }}>
              🪙 {(coins ?? 0).toLocaleString('en-IN')}
            </span>
          )}

          {/* Auth actions */}
          {user ? (
            <button
              onClick={signOut}
              className="ah-btn ah-hide-sm"
              style={{
                background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
                color: MUTED, ...MONO, fontSize: '0.62rem',
                padding: '4px 10px',
              }}
            >
              OUT
            </button>
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
