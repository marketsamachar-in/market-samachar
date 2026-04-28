/**
 * Sparkline — tiny inline SVG line chart for ticker / market cards.
 * Fetches /api/chart?symbol=...&range=1d and renders a 1-day price trend.
 * No external chart library — pure SVG, ~60 lines.
 */

import React, { useEffect, useState } from 'react';

interface Point { t: number; c: number; }

interface Props {
  symbol: string;
  width?: number;
  height?: number;
  color?: string;          // line color; auto picks green/red if omitted
  range?: '1d' | '5d';
}

const cache = new Map<string, { points: Point[]; fetchedAt: number }>();
const TTL   = 5 * 60_000;

export const Sparkline: React.FC<Props> = ({
  symbol, width = 80, height = 24, color, range = '1d',
}) => {
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${symbol}:${range}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < TTL) {
      setPoints(hit.points);
      return;
    }
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const pts: Point[] = data?.points ?? [];
        cache.set(key, { points: pts, fetchedAt: Date.now() });
        setPoints(pts);
      })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [symbol, range]);

  if (!points || points.length < 2) {
    return <svg width={width} height={height} />;
  }

  const ys = points.map((p) => p.c);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);

  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.c - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const up      = points[points.length - 1].c >= points[0].c;
  const lineCol = color ?? (up ? '#00ff88' : '#ff4466');
  const fillId  = `sg-${symbol.replace(/[^A-Z0-9]/gi, '')}`;

  // Area path
  const areaPath = `${path} L${(points.length - 1) * stepX},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineCol} stopOpacity="0.35" />
          <stop offset="100%" stopColor={lineCol} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path d={path} fill="none" stroke={lineCol} strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
};

export default Sparkline;
