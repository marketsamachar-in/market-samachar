import React, { useState, useEffect, useRef } from 'react';
import { X, Trophy, Flame, ArrowRight, ArrowUp, Share2, Users } from 'lucide-react';
import type { SubmitResult } from './types';
import { useAuth } from '../../hooks/useAuth';
import { getTitleFromIQ, getNextTitle, pointsToNextTier } from '../../lib/iq-calculator';
import { InvestorIQCard, type CategoryStat } from '../InvestorIQCard';
import { ScoreCardShare } from './ScoreCardShare';
import { APP_URL, BRAND_HOST } from '../../lib/config';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

const RESULT_CSS = `
@keyframes qr-enter {
  from { opacity: 0; transform: scale(0.96) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes qr-iq-arrow {
  0%   { transform: translateX(-6px); opacity: 0; }
  100% { transform: translateX(0);    opacity: 1; }
}
@keyframes qr-count {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.qr-enter     { animation: qr-enter 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
.qr-iq-arrow  { animation: qr-iq-arrow 0.4s ease 0.6s both; }
.qr-count     { animation: qr-count 0.3s ease both; }
`;

// ─── Animated counter ─────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const start = Date.now();
      const tick = () => {
        const p = Math.min(1, (Date.now() - start) / duration);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(eased * target));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return val;
}

// ─── IQ Transition ────────────────────────────────────────────────────────────
function IQTransition({ prevIQ, newIQ }: { prevIQ: number; newIQ: number }) {
  const delta = newIQ - prevIQ;
  const animIQ = useCountUp(newIQ, 900, 300);
  const deltaColor = delta >= 0 ? '#00ff88' : '#ff4466';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ color: '#445566', ...MONO, fontSize: 18 }}>{prevIQ}</span>
      <span className="qr-iq-arrow" style={{ color: '#445566', fontSize: 16 }}>→</span>
      <span style={{ color: '#3b9eff', ...MONO, fontSize: 24, fontWeight: 700 }}>{animIQ}</span>
      {delta !== 0 && (
        <span
          style={{ color: deltaColor, ...MONO, fontSize: 13, fontWeight: 600 }}
          className="qr-iq-arrow"
        >
          ({delta > 0 ? '+' : ''}{delta})
        </span>
      )}
    </div>
  );
}

// ─── Next Badge Preview ───────────────────────────────────────────────────────
function NextBadgePreview({ iq }: { iq: number }) {
  const next = getNextTitle(iq);
  const pts  = pointsToNextTier(iq);
  if (!next) return null;

  const tierW = next.range[1] - next.range[0];
  const done  = Math.max(0, iq - next.range[0]);
  const pct   = Math.min(98, Math.max(2, (done / tierW) * 100));

  return (
    <div
      style={{
        background: '#07070e', border: '1px solid #1e1e2e',
        borderRadius: 10, padding: '12px 14px',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider">
          Next milestone
        </span>
        <span style={{ color: '#445566', ...MONO }} className="text-[9px]">
          {pts} pts away
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `${next.color}15`,
            border: `1px solid ${next.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}
        >
          {next.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ color: next.color, ...MONO, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
            {next.title}
          </p>
          <div style={{ background: '#1e1e2e', height: 4, borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`, height: '100%',
                background: next.color, borderRadius: 2,
                transition: 'width 1.2s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Challenge Friend button ──────────────────────────────────────────────────
function ChallengeFriend({ result }: { result: SubmitResult }) {
  const [copied, setCopied] = useState(false);

  const handleChallenge = async () => {
    const text = `I scored ${result.score}/${result.total} on today's Market Quiz! 🧠📈 Can you beat me? Play at ${BRAND_HOST}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Market Quiz', text, url: APP_URL });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch { /* ignore */ }
    }
  };

  return (
    <button
      onClick={handleChallenge}
      style={{
        flex: 1,
        background: '#07070e',
        border: '1px solid #1e1e2e',
        borderRadius: 8,
        color: copied ? '#00ff88' : '#8899aa',
        ...MONO,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderColor: copied ? '#00ff8840' : '#1e1e2e',
      }}
      className="py-2.5 text-[11px] uppercase tracking-wide flex items-center justify-center gap-2 hover:border-[#556688] hover:text-[#e8eaf0]"
    >
      {copied ? '✓ Copied!' : <><Users size={13} /> Challenge Friend</>}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface QuizResultProps {
  result:        SubmitResult;
  prevIQ:        number;
  onLeaderboard: () => void;
  onClose:       () => void;
}

export function QuizResult({ result, prevIQ, onLeaderboard, onClose }: QuizResultProps) {
  const { profile } = useAuth();
  const [showAll, setShowAll] = useState(false);

  const categoryStats: CategoryStat[] = (() => {
    const map: Record<string, { correct: number; total: number }> = {};
    for (const r of result.results) {
      const cat = r.category ?? 'other';
      if (!map[cat]) map[cat] = { correct: 0, total: 0 };
      map[cat].total++;
      if (r.correct) map[cat].correct++;
    }
    return Object.entries(map).map(([category, s]) => ({ category, ...s }));
  })();

  const animatedScore = useCountUp(result.score, 600);
  const pct           = result.score / result.total;
  const scoreColor    = pct >= 0.8 ? '#00ff88' : pct >= 0.6 ? '#ffdd3b' : '#ff4466';
  const scoreLabel    = [
    'Keep at it! 💪',
    'Getting there!',
    'Good effort!',
    'Great work! 🔥',
    'Excellent! ⚡',
    'Perfect! 🎯',
  ][result.score] ?? '';

  return (
    <>
      <style>{RESULT_CSS}</style>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7,7,14,0.97)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}>
        <div
          style={{
            background: '#0d0d1e',
            border: '1px solid #1e1e2e',
            borderTop: `3px solid ${scoreColor}`,
            borderRadius: 14,
            width: '100%', maxWidth: 500,
            maxHeight: '90vh', overflowY: 'auto',
          }}
          className="qr-enter"
        >
          {/* Header */}
          <div
            style={{ borderBottom: '1px solid #1e1e2e', background: '#07070e' }}
            className="px-4 py-3 flex items-center gap-2"
          >
            <Trophy className="w-3.5 h-3.5" style={{ color: scoreColor }} />
            <span style={{ color: scoreColor, ...MONO }} className="text-[10px] uppercase tracking-widest">
              Quiz Result
            </span>
            <span style={{ color: '#334466', ...MONO }} className="ml-auto text-[10px]">{result.date}</span>
            <button
              onClick={onClose}
              style={{ color: '#334466', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-5">

            {/* ── Score hero ───────────────────────────────────────────────── */}
            <div className="text-center" style={{ paddingTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: scoreColor, ...MONO, fontSize: 80, fontWeight: 700, lineHeight: 1 }}>
                  {animatedScore}
                </span>
                <span style={{ color: '#334466', ...MONO, fontSize: 36, fontWeight: 700, lineHeight: 1, paddingBottom: 8 }}>
                  /5
                </span>
              </div>
              <p style={{ color: scoreColor, ...MONO }} className="text-[13px] uppercase tracking-widest">
                {scoreLabel}
              </p>
            </div>

            {/* ── Stats row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2">
              {/* Coins */}
              <div style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 10 }} className="p-3 text-center">
                <div style={{ color: '#ffdd3b', ...MONO, fontSize: 20, fontWeight: 700 }}>
                  +{result.coins_earned}
                </div>
                <div style={{ color: '#445566', ...MONO }} className="text-[9px] uppercase tracking-wide mt-0.5">
                  Coins
                </div>
              </div>

              {/* IQ transition */}
              <div style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 10 }} className="p-3 text-center">
                <IQTransition prevIQ={prevIQ} newIQ={result.new_iq} />
                <div style={{ color: '#445566', ...MONO }} className="text-[9px] uppercase tracking-wide mt-1">
                  Investor IQ
                </div>
              </div>

              {/* Streak */}
              <div style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 10 }} className="p-3 text-center">
                <div style={{ color: '#ff9f3b', ...MONO, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Flame size={17} />{result.new_streak}
                </div>
                <div style={{ color: '#445566', ...MONO }} className="text-[9px] uppercase tracking-wide mt-0.5">
                  Day Streak
                </div>
              </div>
            </div>

            {/* ── Next badge preview ───────────────────────────────────────── */}
            <NextBadgePreview iq={result.new_iq} />

            {/* ── IQ Card ──────────────────────────────────────────────────── */}
            <InvestorIQCard
              iq={result.new_iq}
              prevIQ={prevIQ}
              categories={categoryStats}
            />

            {/* ── Question breakdown ───────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase tracking-wider">
                  Question Breakdown
                </span>
                <button
                  onClick={() => setShowAll(v => !v)}
                  style={{ color: '#445566', ...MONO }}
                  className="ml-auto text-[10px] uppercase hover:text-[#00ff88] transition-colors"
                >
                  {showAll ? 'Hide' : 'Expand'}
                </button>
              </div>

              {/* Quick dots */}
              <div className="flex gap-2 mb-3">
                {result.results.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      width: 34, height: 34, borderRadius: 7, flexShrink: 0,
                      background: r.correct ? '#00ff8815' : '#ff446615',
                      border: `1px solid ${r.correct ? '#00ff8840' : '#ff446640'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <span style={{ ...MONO, fontSize: 14 }}>{r.correct ? '✓' : '✗'}</span>
                  </div>
                ))}
              </div>

              {showAll && (
                <div className="space-y-3">
                  {result.results.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#07070e',
                        border: `1px solid ${r.correct ? '#00ff8830' : '#ff446630'}`,
                        borderLeft: `3px solid ${r.correct ? '#00ff88' : '#ff4466'}`,
                        borderRadius: '0 8px 8px 0',
                      }}
                      className="p-3"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span style={{ color: '#334466', ...MONO }} className="text-[10px]">Q{i + 1}</span>
                        <span style={{ color: r.correct ? '#00ff88' : '#ff4466', ...MONO }} className="text-[10px] uppercase">
                          {r.correct ? '✓ Correct' : '✗ Wrong'}
                        </span>
                      </div>
                      <p style={{ color: '#aab8cc', ...SANS, fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
                        {r.question}
                      </p>
                      {!r.correct && r.selected_index >= 0 && (
                        <p style={{ color: '#ff446680', ...MONO, fontSize: 10, marginBottom: 3 }}>
                          Your answer: {r.options[r.selected_index]}
                        </p>
                      )}
                      <p style={{ color: '#00ff8880', ...MONO, fontSize: 10, marginBottom: r.explanation ? 6 : 0 }}>
                        Correct: {r.options[r.correct_index]}
                      </p>
                      {r.explanation && (
                        <p style={{ color: '#445566', ...SANS, fontSize: 11, lineHeight: 1.6, borderTop: '1px solid #1e1e2e', paddingTop: 8 }}>
                          {r.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Score card share ─────────────────────────────────────────── */}
            <ScoreCardShare
              result={result}
              prevIQ={prevIQ}
              username={profile?.name}
            />

            {/* ── Action buttons ───────────────────────────────────────────── */}
            <div className="flex gap-2">
              <ChallengeFriend result={result} />
              <button
                onClick={onLeaderboard}
                style={{ flex: 1, background: '#00ff88', color: '#07070e', border: 'none', borderRadius: 8, cursor: 'pointer', ...MONO }}
                className="py-2.5 text-[11px] font-semibold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Trophy size={13} /> Leaderboard <ArrowRight size={12} />
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
