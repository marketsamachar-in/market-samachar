import React, { useRef, useEffect } from 'react';
import { Newspaper, TrendingUp, Zap, BarChart2, Trophy } from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────────────────────── */
const GREEN  = '#00ff88';
const BG     = '#0d0d1e';
const BORDER = '#1a1a2e';
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };

/* ─── Types ──────────────────────────────────────────────────────────────────── */
export interface BottomNavTab {
  id:      string;
  label:   string;
  icon:    React.ReactNode;
  href?:   string;
  onClick?: () => void;
  active?: boolean;
  hot?:    boolean; /** green dot indicator */
}

interface BottomNavProps {
  tabs: BottomNavTab[];
}

/* ─── Injected CSS ───────────────────────────────────────────────────────────── */
const BN_CSS = `
  .bn-bar {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 9999 !important;
    width: 100% !important;
    max-width: 100vw !important;
    box-sizing: border-box;
    background: ${BG};
    border-top: 1px solid ${BORDER};
    display: flex;
    height: 58px;
    overflow: hidden;
  }

  @media (min-width: 1024px) {
    .bn-bar { display: none !important; }
  }

  .bn-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    background: none;
    border: none;
    cursor: pointer;
    color: #666;
    position: relative;
    padding: 6px 0 8px;
    text-decoration: none;
    transition: color 0.15s;
  }
  .bn-tab.active { color: ${GREEN}; }
  .bn-tab:hover:not(.active) { color: #999; }

  .bn-tab-active-bar {
    position: absolute;
    top: 0; left: 50%;
    transform: translateX(-50%);
    width: 32px; height: 2px;
    background: ${GREEN};
    border-radius: 0 0 2px 2px;
  }

  .bn-tab-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bn-hot-dot {
    position: absolute;
    top: -2px; right: -6px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: ${GREEN};
    box-shadow: 0 0 4px ${GREEN};
    animation: bn-hot-pulse 1.5s ease-in-out infinite;
  }

  @keyframes bn-hot-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px ${GREEN}; }
    50%       { opacity: 0.5; box-shadow: 0 0 8px ${GREEN}; }
  }

  .bn-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    line-height: 1;
  }
`;

/* ─── BottomNav ──────────────────────────────────────────────────────────────── */
export function BottomNav({ tabs }: BottomNavProps) {
  const navRef = useRef<HTMLElement>(null);

  // Keep bottom pinned to the visual viewport on mobile browsers where
  // the address bar auto-hides/shows during scroll, shifting fixed elements.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const fix = () => {
      const vvH = window.visualViewport?.height ?? document.documentElement.clientHeight;
      const lvH = document.documentElement.clientHeight;
      // Offset from bottom of layout viewport to bottom of visual viewport
      const offset = lvH - vvH - (window.visualViewport?.offsetTop ?? 0);
      nav.style.bottom = `${Math.max(0, offset)}px`;
      nav.style.top = 'auto';
    };
    fix();
    const t = setTimeout(fix, 100);
    window.visualViewport?.addEventListener('resize', fix);
    window.visualViewport?.addEventListener('scroll', fix);
    return () => {
      clearTimeout(t);
      window.visualViewport?.removeEventListener('resize', fix);
      window.visualViewport?.removeEventListener('scroll', fix);
    };
  }, []);

  return (
    <>
      <style>{BN_CSS}</style>
      <nav className="bn-bar" ref={navRef}>
        {tabs.map(tab => {
          const cls = `bn-tab${tab.active ? ' active' : ''}`;
          const content = (
            <>
              {tab.active && <span className="bn-tab-active-bar" />}
              <span className="bn-tab-icon-wrap" style={tab.id === 'trading' ? { transform: 'scale(1.15)' } : undefined}>
                {tab.icon}
                {tab.hot && <span className="bn-hot-dot" />}
              </span>
              <span className="bn-label">{tab.label}</span>
            </>
          );

          return tab.href ? (
            <a key={tab.id} href={tab.href} className={cls}>
              {content}
            </a>
          ) : (
            <button key={tab.id} onClick={tab.onClick} className={cls}>
              {content}
            </button>
          );
        })}
      </nav>
    </>
  );
}

/* ─── Default tab definitions ────────────────────────────────────────────────── */
/** Href-based tabs for LandingPage (navigates between routes) */
export function getHrefNavTabs(activePath: string): BottomNavTab[] {
  const tabs: Array<Omit<BottomNavTab, 'active'> & { href: string }> = [
    { id: 'news',        label: 'NEWS',    icon: <Newspaper  size={20} />, href: '/'             },
    { id: 'trading',     label: 'TRADE',   icon: <TrendingUp size={22} />, href: '/paper-trading', hot: true },
    { id: 'pulse',       label: 'PULSE',   icon: <Zap        size={20} />, href: '/pulse',         hot: true },
    { id: 'chartguessr', label: 'CHARTS',  icon: <BarChart2  size={20} />, href: '/chartguessr'  },
    { id: 'rewards',     label: 'REWARDS', icon: <Trophy     size={20} />, href: '/rewards'      },
  ];
  return tabs.map(t => ({
    ...t,
    active: t.href === '/' ? activePath === '/' : activePath.startsWith(t.href),
  }));
}

/** onClick-based tabs for App.tsx (SPA navigation) */
export function getOnClickNavTabs(
  view: string,
  navigate: (v: string) => void,
): BottomNavTab[] {
  return [
    { id: 'news',        label: 'NEWS',    icon: <Newspaper  size={20} />, onClick: () => navigate('news'),        active: view === 'news'        },
    { id: 'trading',     label: 'TRADE',   icon: <TrendingUp size={22} />, onClick: () => navigate('trading'),     active: view === 'trading',     hot: true },
    { id: 'pulse',       label: 'PULSE',   icon: <Zap        size={20} />, onClick: () => navigate('pulse'),       active: view === 'pulse',       hot: true },
    { id: 'chartguessr', label: 'CHARTS',  icon: <BarChart2  size={20} />, onClick: () => navigate('chartguessr'), active: view === 'chartguessr' },
    { id: 'rewards',     label: 'REWARDS', icon: <Trophy     size={20} />, onClick: () => navigate('rewards'),     active: view === 'rewards'     },
  ];
}
