/**
 * IPOCalendarPage — standalone page at /ipo-calendar
 * Wraps the IPOCalendar component with a minimal top nav.
 */

import React, { useEffect } from 'react';
import { IPOCalendar } from '../components/ipo/IPOCalendar';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

export function IPOCalendarPage() {
  useEffect(() => { document.title = "IPO Calendar — Market Samachar"; }, []);
  return (
    <>
      {/* ── Minimal top strip with back link ──────────────────────────── */}
      <div
        style={{
          background: '#0a0a18',
          borderBottom: '1px solid #1e1e2e',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <a
          href="/app"
          style={{ color: '#334466', ...MONO, fontSize: 10, textDecoration: 'none' }}
          className="hover:text-[#00ff88] transition-colors uppercase"
        >
          ← Terminal
        </a>
        <span style={{ color: '#1e1e2e' }}>|</span>
        <a
          href="/"
          style={{ color: '#334466', ...MONO, fontSize: 10, textDecoration: 'none' }}
          className="hover:text-[#00ff88] transition-colors uppercase"
        >
          Market Samachar
        </a>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#1e2840', ...MONO, fontSize: 9 }} className="uppercase hidden sm:block">
          marketsamachar.in
        </span>
      </div>

      {/* ── IPO Calendar ──────────────────────────────────────────────── */}
      <IPOCalendar />
    </>
  );
}
