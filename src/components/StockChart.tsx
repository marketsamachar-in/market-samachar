/**
 * StockChart — interactive price chart for a single NSE stock or index.
 * Range toggle: 1D / 1W / 1M / 6M / 1Y. Built on recharts AreaChart.
 */

import React, { useEffect, useState, type CSSProperties } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';

const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const BORDER = '#1e1e2e';
const MUTED  = '#888899';
const DIM    = '#444455';

type Range = '1d' | '5d' | '1mo' | '6mo' | '1y';

const RANGES: { key: Range; label: string }[] = [
  { key: '1d',  label: '1D' },
  { key: '5d',  label: '1W' },
  { key: '1mo', label: '1M' },
  { key: '6mo', label: '6M' },
  { key: '1y',  label: '1Y' },
];

interface Point { t: number; c: number; }

interface Props {
  symbol: string;
  height?: number;
  showRangeToggle?: boolean;
  defaultRange?: Range;
}

export const StockChart: React.FC<Props> = ({
  symbol, height = 180, showRangeToggle = true, defaultRange = '1d',
}) => {
  const [range, setRange]   = useState<Range>(defaultRange);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPoints(null); setError(false);
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const pts: Point[] = data?.points ?? [];
        if (pts.length < 2) { setError(true); setPoints([]); return; }
        setPoints(pts);
      })
      .catch(() => { if (!cancelled) { setError(true); setPoints([]); } });
    return () => { cancelled = true; };
  }, [symbol, range]);

  const up = points && points.length > 1
    ? points[points.length - 1].c >= points[0].c
    : true;
  const lineCol = up ? '#00ff88' : '#ff4466';

  const fmtTick = (t: number) => {
    const d = new Date(t);
    if (range === '1d')                          return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (range === '5d')                          return d.toLocaleDateString('en-IN', { weekday: 'short' });
    if (range === '1mo' || range === '6mo')      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  };

  const fmtPrice = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

  return (
    <div style={{ width: '100%' }}>
      {showRangeToggle && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                flex: 1,
                padding: '4px 0',
                background: range === r.key ? 'rgba(0,255,136,0.08)' : 'transparent',
                border: `1px solid ${range === r.key ? '#00ff8855' : BORDER}`,
                color:  range === r.key ? '#00ff88' : MUTED,
                ...MONO, fontSize: 10, letterSpacing: '0.06em',
                borderRadius: 4, cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ height, width: '100%' }}>
        {points === null ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: DIM, ...MONO, fontSize: 10,
          }}>
            Loading chart…
          </div>
        ) : error || points.length < 2 ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: DIM, ...MONO, fontSize: 10,
          }}>
            Chart data unavailable
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sc-fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={lineCol} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineCol} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={BORDER} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={fmtTick}
                stroke={DIM} tick={{ fill: MUTED, fontSize: 9, fontFamily: "'DM Mono', monospace" }}
                axisLine={{ stroke: BORDER }} tickLine={false} minTickGap={32}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(v) => fmtPrice(v as number)}
                stroke={DIM} tick={{ fill: MUTED, fontSize: 9, fontFamily: "'DM Mono', monospace" }}
                axisLine={false} tickLine={false} width={48} orientation="right"
              />
              <Tooltip
                contentStyle={{
                  background: '#0a0a1a', border: `1px solid ${BORDER}`,
                  borderRadius: 6, fontSize: 11, ...MONO,
                }}
                labelFormatter={(t) => new Date(t as number).toLocaleString('en-IN')}
                formatter={(v: any) => [`₹${fmtPrice(v)}`, 'Price']}
              />
              <Area
                type="monotone" dataKey="c"
                stroke={lineCol} strokeWidth={1.5}
                fill={`url(#sc-fill-${symbol})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default StockChart;
