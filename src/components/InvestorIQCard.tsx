import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  getTitleFromIQ, getNextTitle, pointsToNextTier, getPercentile,
  IQ_MIN, IQ_MAX, type IQTitle,
} from '../lib/iq-calculator';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── SVG Gauge constants ──────────────────────────────────────────────────────
const CX = 100, CY = 100, R = 78;
const CIRC        = 2 * Math.PI * R;       // 490.09
const TRACK_RATIO = 0.75;                   // 270° of 360°
const TRACK       = CIRC * TRACK_RATIO;     // 367.57
const GAP         = CIRC - TRACK;           // 122.52
// rotate(135) places the arc start at SVG 135° = bottom-left corner ✓
const GAUGE_ROTATE = `rotate(135 ${CX} ${CY})`;

// ─── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, delayMs = 120) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t0 = setTimeout(() => {
      const start = Date.now();
      const tick  = () => {
        const p      = Math.min(1, (Date.now() - start) / duration);
        const eased  = 1 - Math.pow(1 - p, 3); // ease-out cubic
        setVal(Math.round(eased * target));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delayMs);
    return () => clearTimeout(t0);
  }, [target, duration, delayMs]);
  return val;
}

// ─── Category bar ─────────────────────────────────────────────────────────────
export interface CategoryStat {
  category: string;
  correct:  number;
  total:    number;
}

const CAT_COLORS: Record<string, string> = {
  indian:    '#00ff88',
  companies: '#ffdd3b',
  global:    '#3bffee',
  commodity: '#ff6b3b',
  crypto:    '#b366ff',
  ipo:       '#ff3bff',
  economy:   '#3b9eff',
  banking:   '#3b9eff',
};

function CategoryBar({ stat }: { stat: CategoryStat }) {
  const pct   = stat.total > 0 ? (stat.correct / stat.total) * 100 : 0;
  const color = CAT_COLORS[stat.category] ?? '#00ff88';
  const label = stat.correct >= stat.total * 0.8 ? 'Strong' : stat.correct >= stat.total * 0.5 ? 'Good' : 'Weak';
  const labelColor = stat.correct >= stat.total * 0.8 ? '#00ff88' : stat.correct >= stat.total * 0.5 ? '#ffdd3b' : '#ff4466';
  return (
    <div className="flex items-center gap-2">
      <span
        style={{ color: color, ...MONO, width: 72, flexShrink: 0 }}
        className="text-[9px] uppercase truncate"
      >
        {stat.category}
      </span>
      <div style={{ flex: 1, background: '#1e1e2e', height: 4, borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 2, transition: 'width 0.8s ease 0.3s' }}
        />
      </div>
      <span style={{ color: labelColor, ...MONO, width: 44, textAlign: 'right', flexShrink: 0 }}
        className="text-[9px]">
        {label}
      </span>
    </div>
  );
}

// ─── Tier badge ───────────────────────────────────────────────────────────────
function TierBadge({ info }: { info: IQTitle }) {
  const bg: Record<string, string> = {
    diamond:  '#00ff8818',
    platinum: '#e2e8f018',
    gold:     '#ffcc4418',
    silver:   '#b0b8cc18',
    bronze:   '#cd7f3218',
    grey:     '#77889918',
  };
  return (
    <span
      style={{
        background:  bg[info.tier] ?? '#1e1e2e',
        border:      `1px solid ${info.color}40`,
        color:       info.color,
        borderRadius: 20,
        padding:     '2px 10px',
        fontSize:    11,
        ...MONO,
        letterSpacing: '0.04em',
        whiteSpace:  'nowrap',
      }}
    >
      {info.emoji} {info.title}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface InvestorIQCardProps {
  iq:          number;
  prevIQ?:     number;
  categories?: CategoryStat[];
  /** Compact variant: smaller gauge, no category bars */
  compact?:    boolean;
}

export function InvestorIQCard({ iq, prevIQ, categories, compact = false }: InvestorIQCardProps) {
  const clampedIQ = Math.max(IQ_MIN, Math.min(IQ_MAX, iq));
  const displayIQ = useCountUp(clampedIQ, compact ? 800 : 1200);

  // Gauge fill: animate from 0 to target
  const [fillLength, setFillLength] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setFillLength((clampedIQ / IQ_MAX) * TRACK);
    }, 150);
    return () => clearTimeout(t);
  }, [clampedIQ]);

  const titleInfo  = getTitleFromIQ(iq);
  const nextTitle  = getNextTitle(iq);
  const toNext     = pointsToNextTier(iq);
  const percentile = getPercentile(iq);
  const delta      = prevIQ !== undefined ? iq - prevIQ : undefined;
  const gaugeColor = '#00ff88'; // always green per spec

  if (compact) {
    // ── Mini version (sidebar / leaderboard row) ────────────────────────────
    const smallFill = (clampedIQ / IQ_MAX) * TRACK;
    return (
      <div
        style={{ background: '#0d0d1e', border: '1px solid #1e1e2e', borderRadius: 10 }}
        className="p-3 flex items-center gap-3"
      >
        {/* Mini gauge */}
        <svg viewBox="0 0 200 170" style={{ width: 72, flexShrink: 0 }}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e1e2e" strokeWidth="18"
            strokeDasharray={`${TRACK} ${GAP}`} strokeLinecap="round"
            transform={GAUGE_ROTATE}
          />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={gaugeColor} strokeWidth="18"
            strokeDasharray={`${smallFill} ${CIRC - smallFill}`} strokeLinecap="round"
            transform={GAUGE_ROTATE}
            style={{ transition: 'stroke-dasharray 1s ease 0.2s' }}
          />
          <text x={CX} y={CY + 6} textAnchor="middle" fill="#e8eaf0"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700 }}>
            {displayIQ}
          </text>
        </svg>
        <div>
          <TierBadge info={titleInfo} />
          <p style={{ color: '#444455', ...MONO, marginTop: 4 }} className="text-[9px] uppercase">
            Top {percentile}% of users
          </p>
        </div>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: '#0d0d1e',
        border:     '1px solid #1e1e2e',
        borderTop:  `2px solid ${titleInfo.color}`,
        borderRadius: 12,
        overflow:   'hidden',
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e1e2e', background: '#07070e' }}
        className="px-4 py-2.5 flex items-center gap-2">
        <span style={{ color: titleInfo.color, ...MONO }} className="text-[10px] uppercase tracking-widest">
          Investor IQ
        </span>
        {delta !== undefined && delta !== 0 && (
          <span
            style={{
              color:       delta > 0 ? '#00ff88' : '#ff4466',
              background:  delta > 0 ? '#00ff8812' : '#ff446612',
              border:      `1px solid ${delta > 0 ? '#00ff8830' : '#ff446630'}`,
              borderRadius: 20,
              padding:     '1px 7px',
              ...MONO,
              fontSize:    9,
            }}
            className="flex items-center gap-0.5"
          >
            {delta > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
        <span style={{ color: '#334466', ...MONO }} className="ml-auto text-[10px]">
          / {IQ_MAX}
        </span>
      </div>

      <div className="p-5">
        {/* Gauge */}
        <div className="flex justify-center mb-1">
          <svg viewBox="0 0 200 170" style={{ width: '100%', maxWidth: 200 }}>
            {/* Track background */}
            <circle
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke="#1a1a2e"
              strokeWidth="14"
              strokeDasharray={`${TRACK} ${GAP}`}
              strokeLinecap="round"
              transform={GAUGE_ROTATE}
            />
            {/* Coloured fill */}
            <circle
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={gaugeColor}
              strokeWidth="14"
              strokeDasharray={`${fillLength} ${CIRC - fillLength}`}
              strokeLinecap="round"
              transform={GAUGE_ROTATE}
              style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(0.34, 1.2, 0.64, 1)' }}
            />
            {/* Tick marks at 0, 500, 1000 */}
            {[0, 0.5, 1].map((t, i) => {
              // Angle in SVG degrees: 135 + t*270
              const angleDeg = 135 + t * 270;
              const rad      = (angleDeg * Math.PI) / 180;
              const inner    = R - 10;
              const outer    = R + 2;
              const x1 = CX + inner * Math.cos(rad);
              const y1 = CY + inner * Math.sin(rad);
              const x2 = CX + outer * Math.cos(rad);
              const y2 = CY + outer * Math.sin(rad);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a2a4e" strokeWidth="2" strokeLinecap="round" />;
            })}
            {/* Min / max labels */}
            <text x={30}  y={158} textAnchor="middle" fill="#334466"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 9 }}>{IQ_MIN}</text>
            <text x={170} y={158} textAnchor="middle" fill="#334466"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 9 }}>{IQ_MAX}</text>
            {/* Score */}
            <text x={CX} y={CY - 4} textAnchor="middle" fill="#e8eaf0"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 38, fontWeight: 700 }}>
              {displayIQ}
            </text>
            {/* IQ label */}
            <text x={CX} y={CY + 18} textAnchor="middle" fill="#334466"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2 }}>
              IQ SCORE
            </text>
          </svg>
        </div>

        {/* Title badge */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <TierBadge info={titleInfo} />
          <p style={{ color: '#444455', ...MONO }} className="text-[10px]">
            Top <span style={{ color: '#8899aa' }}>{percentile}%</span> of users
          </p>
        </div>

        {/* Progress to next tier */}
        {nextTitle && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase">
                Next: {nextTitle.emoji} {nextTitle.title}
              </span>
              <span style={{ color: '#444455', ...MONO }} className="text-[9px]">
                {toNext} pts to go
              </span>
            </div>
            <div style={{ background: '#1e1e2e', height: 4, borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${((iq - getTitleFromIQ(iq).range[0]) / (nextTitle.range[0] - getTitleFromIQ(iq).range[0])) * 100}%`,
                  background: nextTitle.color,
                  height: '100%',
                  borderRadius: 2,
                  transition: 'width 1s ease 0.5s',
                }}
              />
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {categories && categories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider">
                Category Strength
              </span>
              <span style={{ color: '#1e1e2e' }} className="flex-1 h-px bg-current" />
            </div>
            <div className="space-y-2">
              {categories.map(s => <CategoryBar key={s.category} stat={s} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
