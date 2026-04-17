/**
 * NewsImpactPanel — shows stock price movement after a news article was published.
 * Available to all signed-in users.  Fetches from GET /api/news/impact/:id
 */

import React, { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Lock, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImpactEntry {
  then?: number;
  d1?: number;
  d3?: number;
  d7?: number;
}

interface ImpactData {
  [symbol: string]: ImpactEntry;
}

interface Props {
  articleId:  string;
  isPro?:     boolean;
  isSignedIn?: boolean;
  onUpgrade?: () => void;
  onSignIn?:  () => void;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLatestSnapshot(entry: ImpactEntry): { price: number; days: number } | null {
  if (entry.d7 !== undefined) return { price: entry.d7, days: 7 };
  if (entry.d3 !== undefined) return { price: entry.d3, days: 3 };
  if (entry.d1 !== undefined) return { price: entry.d1, days: 1 };
  return null;
}

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewsImpactPanel({ articleId, isPro, isSignedIn, onUpgrade, onSignIn }: Props) {
  const [impact,  setImpact]  = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(false);
  const [noData,  setNoData]  = useState(false);

  useEffect(() => {
    if (!isPro) return;
    setLoading(true);
    setImpact(null);
    setNoData(false);

    fetch(`/api/news/impact/${articleId}`)
      .then(r => r.json())
      .then((data: { symbols: string[]; impact: ImpactData }) => {
        const entries = (Object.entries(data.impact ?? {}) as Array<[string, ImpactEntry]>).filter(
          ([, e]) => e.then && getLatestSnapshot(e) !== null,
        );
        if (entries.length > 0) {
          setImpact(Object.fromEntries(entries));
        } else {
          setNoData(true);
        }
      })
      .catch(() => setNoData(true))
      .finally(() => setLoading(false));
  }, [articleId, isPro]);

  // ── Sign-in gate ──────────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <div
        style={{
          background: '#07080f',
          border:     '1px solid #1a1a2e',
          borderRadius: 8,
          padding:    '10px 14px',
          marginTop:  10,
        }}
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5" style={{ color: '#334466' }} />
          <span style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase tracking-wider">
            Market Impact
          </span>
          <Lock className="w-3 h-3 ml-auto" style={{ color: '#334466' }} />
        </div>
        <p style={{ color: '#445566', ...SANS }} className="text-xs mt-2 leading-relaxed">
          See how this news moved the market.{' '}
          <button
            onClick={onSignIn}
            style={{ color: '#00ff88', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...SANS }}
            className="hover:underline"
          >
            Sign in to unlock →
          </button>
        </p>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          background: '#07080f',
          border:     '1px solid #1a1a2e',
          borderRadius: 8,
          padding:    '10px 14px',
          marginTop:  10,
        }}
      >
        <div className="flex items-center gap-2" style={{ color: '#334466' }}>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span style={{ ...MONO }} className="text-[10px] uppercase tracking-wider">
            Loading impact data…
          </span>
        </div>
      </div>
    );
  }

  // ── Not yet available ─────────────────────────────────────────────────────
  if (noData || !impact) {
    return (
      <div
        style={{
          background: '#07080f',
          border:     '1px solid #1a1a2e',
          borderRadius: 8,
          padding:    '10px 14px',
          marginTop:  10,
        }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <BarChart2 className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
          <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] uppercase tracking-wider">
            Market Impact
          </span>
        </div>
        <p style={{ color: '#445566', ...SANS }} className="text-xs">
          📊 Check back in 3 days to see how this news moved the market
        </p>
      </div>
    );
  }

  // ── Impact table ──────────────────────────────────────────────────────────
  const rows = (Object.entries(impact) as Array<[string, ImpactEntry]>)
    .map(([symbol, entry]) => {
      const snap = getLatestSnapshot(entry);
      if (!snap || !entry.then) return null;
      const changePct = ((snap.price - entry.then) / entry.then) * 100;
      return { symbol, then: entry.then, now: snap.price, changePct, days: snap.days };
    })
    .filter(Boolean) as Array<{ symbol: string; then: number; now: number; changePct: number; days: number }>;

  return (
    <div
      style={{
        background:   '#07080f',
        border:       '1px solid #1a3a2a',
        borderRadius: 8,
        padding:      '10px 14px',
        marginTop:    10,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <BarChart2 className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
        <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] uppercase tracking-wider">
          📊 Market Impact — What happened after this news?
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', ...MONO }} className="text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid #1a2a1a' }}>
              {['Stock', 'Then', 'Now', 'Change', 'Days'].map(h => (
                <th
                  key={h}
                  style={{ color: '#556688', textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}
                  className="text-[10px] uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const up = row.changePct >= 0;
              return (
                <tr key={row.symbol} style={{ borderBottom: '1px solid #0d1a10' }}>
                  {/* Stock */}
                  <td style={{ color: '#e8eaf0', padding: '6px 8px', fontWeight: 500 }}>
                    {row.symbol}
                  </td>
                  {/* Then */}
                  <td style={{ color: '#8899aa', padding: '6px 8px' }}>
                    {fmtINR(row.then)}
                  </td>
                  {/* Now */}
                  <td style={{ color: '#e8eaf0', padding: '6px 8px' }}>
                    {fmtINR(row.now)}
                  </td>
                  {/* Change */}
                  <td style={{ color: up ? '#00ff88' : '#ff4466', padding: '6px 8px' }}>
                    <span className="flex items-center gap-1">
                      {up
                        ? <TrendingUp  className="w-3 h-3 flex-shrink-0" />
                        : <TrendingDown className="w-3 h-3 flex-shrink-0" />
                      }
                      {up ? '+' : ''}{row.changePct.toFixed(2)}%
                    </span>
                  </td>
                  {/* Days */}
                  <td style={{ color: '#556688', padding: '6px 8px' }}>
                    {row.days}d
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ color: '#334466', ...SANS }} className="text-[10px] mt-2">
        Prices from NSE via Yahoo Finance · Updated daily after market close
      </p>
    </div>
  );
}
