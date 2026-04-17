import React, { useState, useEffect } from 'react';
import { Brain, Flame, Zap, Trophy, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getTitleFromIQ, getNextTitle, pointsToNextTier, getIQTierMultiplier } from '../../lib/iq-calculator';
import type { SafeQuestion, LeaderboardEntry, SubmitResult } from './types';
import { CAT_COLOR, DIFF_COLOR } from './types';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Circular IQ Gauge ────────────────────────────────────────────────────────
function IQGauge({ iq }: { iq: number }) {
  const radius = 38;
  const stroke = 5;
  const cx = 46;
  const size = cx * 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(100, Math.min(1000, iq));
  const pct = (clamped - 100) / 900;
  const dashOffset = circumference * (1 - pct);
  const titleInfo = getTitleFromIQ(iq);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke="#1e1e2e" strokeWidth={stroke} />
        {/* Progress */}
        <circle
          cx={cx} cy={cx} r={radius}
          fill="none"
          stroke={titleInfo.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        <span style={{ color: titleInfo.color, ...MONO, fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{iq}</span>
        <span style={{ fontSize: 11, lineHeight: 1 }}>{titleInfo.emoji}</span>
        <span style={{ color: '#3a3a5a', ...MONO, fontSize: 8, letterSpacing: '0.06em', marginTop: 1 }}>IQ</span>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface QuizLandingProps {
  onPlay: () => void;
  onLeaderboard: () => void;
  lastResult: SubmitResult | null;
}

export function QuizLanding({ onPlay, onLeaderboard, lastResult }: QuizLandingProps) {
  const { user, profile } = useAuth();
  const [questions, setQuestions]     = useState<SafeQuestion[]>([]);
  const [top3, setTop3]               = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/quiz/today').then(r => r.json()),
      fetch('/api/quiz/leaderboard?period=daily').then(r => r.json()),
    ])
      .then(([qData, lbData]) => {
        setQuestions(qData.questions ?? []);
        setTop3((lbData.leaderboard ?? []).slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (lastResult) setAlreadyPlayed(true);
  }, [lastResult]);

  const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cats = [...new Set(questions.map(q => q.category))] as string[];
  const difficulties = questions.map(q => q.difficulty);
  const hardCount = difficulties.filter(d => d === 'hard').length;
  const medCount  = difficulties.filter(d => d === 'medium').length;
  const iq        = profile?.investor_iq ?? 300;
  const titleInfo = getTitleFromIQ(iq);
  const nextTitle = getNextTitle(iq);
  const ptsToNext = pointsToNextTier(iq);
  const tierMult  = getIQTierMultiplier(iq);

  return (
    <div
      style={{ background: '#0d0d1e', border: '1px solid #1e1e2e', borderTop: '2px solid #00ff88' }}
      className="rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div
        style={{ background: '#07070e', borderBottom: '1px solid #1e1e2e' }}
        className="px-3 py-2 flex items-center gap-2"
      >
        <Brain className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
        <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] uppercase tracking-widest font-medium">
          Market Quiz
        </span>
        <span
          style={{ background: '#00ff8818', border: '1px solid #00ff8840', color: '#00ff88', ...MONO }}
          className="ml-1 text-[9px] px-1.5 py-0.5 rounded uppercase"
        >
          Daily
        </span>
        <span style={{ color: '#334466', ...MONO }} className="ml-auto text-[10px]">{todayIST}</span>
      </div>

      <div className="p-3 space-y-3">

        {/* IQ Gauge + streak row */}
        {user && profile ? (
          <div className="flex items-center gap-3">
            <IQGauge iq={iq} />

            <div className="flex-1 min-w-0 space-y-2">
              {/* Title */}
              <div>
                <span style={{ color: titleInfo.color, ...MONO }} className="text-[11px] font-semibold">
                  {titleInfo.emoji} {titleInfo.title}
                </span>
              </div>

              {/* Progress to next tier */}
              {nextTitle && (
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span style={{ color: '#334466', ...MONO }} className="text-[8px] uppercase">
                      Next: {nextTitle.title}
                    </span>
                    <span style={{ color: '#445566', ...MONO }} className="text-[8px]">
                      {ptsToNext} pts away
                    </span>
                  </div>
                  <div style={{ background: '#1e1e2e', height: 3, borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(98, Math.max(2, 100 - (ptsToNext / 200) * 100))}%`,
                        height: '100%',
                        background: nextTitle.color,
                        borderRadius: 2,
                        transition: 'width 1s cubic-bezier(0.34,1.56,0.64,1)',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Streak + coins */}
              <div className="flex items-center gap-2">
                <div
                  style={{ background: '#07070e', border: '1px solid #1e1e2e' }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded flex-1 justify-center"
                >
                  <Flame className="w-3 h-3" style={{ color: '#ff9f3b' }} />
                  <span style={{ color: '#ff9f3b', ...MONO }} className="text-[12px] font-semibold">
                    {profile.streak_count}
                  </span>
                  <span style={{ color: '#445566', ...MONO }} className="text-[8px] uppercase">streak</span>
                </div>
                {profile.coins > 0 && (
                  <div
                    style={{ background: '#07070e', border: '1px solid #1e1e2e' }}
                    className="flex items-center gap-1 px-2 py-1 rounded"
                  >
                    <span style={{ color: '#ffdd3b' }} className="text-[10px]">◆</span>
                    <span style={{ color: '#ffdd3b', ...MONO }} className="text-[11px]">{profile.coins}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : !user ? (
          /* Not logged in: prompt */
          <div
            style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }}
            className="p-2.5 flex items-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" style={{ color: '#00ff88', flexShrink: 0 }} />
            <span style={{ color: '#556688', ...MONO }} className="text-[10px] uppercase">
              Sign in to track your IQ & streak
            </span>
          </div>
        ) : null}

        {/* Last result banner */}
        {lastResult && (
          <div
            style={{ background: '#00ff8810', border: '1px solid #00ff8830', borderRadius: 6 }}
            className="px-2.5 py-1.5 flex items-center justify-between"
          >
            <span style={{ color: '#00ff88', ...MONO }} className="text-[11px]">
              Today: {lastResult.score}/{lastResult.total} correct
            </span>
            <span style={{ color: '#445566', ...MONO }} className="text-[9px]">
              +{lastResult.coins_earned} coins
            </span>
          </div>
        )}

        {/* Quiz meta */}
        {loading ? (
          <div className="flex items-center gap-2 py-2" style={{ color: '#334466' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span style={{ ...MONO }} className="text-[10px] uppercase">Loading quiz…</span>
          </div>
        ) : questions.length > 0 ? (
          <>
            {/* Category + difficulty tags */}
            <div className="flex flex-wrap gap-1.5">
              {cats.map(cat => (
                <span
                  key={cat}
                  style={{
                    color:       CAT_COLOR[cat] ?? '#00ff88',
                    borderColor: `${CAT_COLOR[cat] ?? '#00ff88'}40`,
                    ...MONO,
                  }}
                  className="text-[9px] border px-1.5 py-0.5 rounded-sm uppercase tracking-wider"
                >
                  {cat}
                </span>
              ))}
              {hardCount > 0 && (
                <span
                  style={{ color: DIFF_COLOR.hard, borderColor: `${DIFF_COLOR.hard}40`, ...MONO }}
                  className="text-[9px] border px-1.5 py-0.5 rounded-sm uppercase tracking-wider"
                >
                  {hardCount}H
                </span>
              )}
              {medCount > 0 && (
                <span
                  style={{ color: DIFF_COLOR.medium, borderColor: `${DIFF_COLOR.medium}40`, ...MONO }}
                  className="text-[9px] border px-1.5 py-0.5 rounded-sm uppercase tracking-wider"
                >
                  {medCount}M
                </span>
              )}
            </div>

            {/* Difficulty bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase">Difficulty</span>
                <span style={{ color: '#445566', ...MONO }} className="text-[9px]">
                  {medCount + hardCount}/{questions.length} challenging
                </span>
              </div>
              <div style={{ background: '#1e1e2e', borderRadius: 4, overflow: 'hidden' }} className="h-1.5 flex">
                {[
                  { d: 'easy',   count: difficulties.filter(d => d === 'easy').length },
                  { d: 'medium', count: medCount },
                  { d: 'hard',   count: hardCount },
                ].map(({ d, count }) => count > 0 && (
                  <div
                    key={d}
                    style={{
                      width: `${(count / questions.length) * 100}%`,
                      height: '100%',
                      background: DIFF_COLOR[d],
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase py-1">
            Quiz not available yet — check back soon
          </p>
        )}

        {/* Play CTA */}
        <button
          onClick={onPlay}
          disabled={loading || questions.length === 0 || alreadyPlayed}
          style={
            alreadyPlayed
              ? { background: '#0d0d1e', border: '1px solid #1e1e2e', color: '#556688', ...MONO }
              : { background: '#00ff88', color: '#07070e', ...MONO }
          }
          className="w-full py-2.5 rounded text-[11px] font-semibold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
        >
          {alreadyPlayed ? (
            <>✓ Today's Quiz Done</>
          ) : (
            <><Brain className="w-3.5 h-3.5" />Run Today's Market IQ Test</>
          )}
        </button>

        {/* Tier multiplier hint (signed-in, not yet played) */}
        {user && profile && !alreadyPlayed && tierMult > 1 && (
          <div
            style={{ background: '#00ff8808', border: '1px solid #00ff8820', borderRadius: 6 }}
            className="px-2.5 py-1.5 flex items-center justify-between"
          >
            <span style={{ color: '#77aa99', ...MONO }} className="text-[9px] uppercase tracking-wider">
              Your tier bonus
            </span>
            <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] font-semibold">
              {tierMult}× coins per correct
            </span>
          </div>
        )}

        {/* Top 3 leaderboard preview */}
        {top3.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider">
                Today's Top 3
              </span>
              <button
                onClick={onLeaderboard}
                style={{ color: '#445566', ...MONO }}
                className="text-[9px] uppercase hover:text-[#00ff88] transition-colors"
              >
                Full Board →
              </button>
            </div>

            {top3.map((entry, i) => {
              const p    = (entry as any).profiles ?? {};
              const name = p.name ?? entry.name ?? 'Anonymous';
              const entryIQ    = p.investor_iq ?? entry.investor_iq ?? 0;
              const entryTitle = getTitleFromIQ(entryIQ);
              const score      = entry.score ?? 0;

              return (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-2 py-1.5"
                  style={{ borderBottom: i < top3.length - 1 ? '1px solid #14142a' : 'none' }}
                >
                  <span
                    style={{
                      color:    i === 0 ? '#ffdd3b' : '#334466',
                      ...MONO,
                      fontSize: i === 0 ? 15 : 10,
                      width:    20,
                      flexShrink: 0,
                    }}
                  >
                    {i === 0 ? '👑' : `#${i + 1}`}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#8899aa', ...MONO, fontSize: 10 }} className="truncate">{name}</p>
                    <p style={{ color: entryTitle.color, ...MONO, fontSize: 8 }}>
                      {entryTitle.emoji} {entryTitle.title}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p style={{ color: '#00ff88', ...MONO, fontSize: 12, fontWeight: 600 }}>{score}/5</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Podium prize hint — paid out by cron for daily / weekly / monthly winners */}
        <div
          style={{ background: '#ffdd3b08', border: '1px solid #ffdd3b15', borderRadius: 6 }}
          className="flex items-start gap-2 px-2.5 py-2"
        >
          <Trophy className="w-3 h-3 mt-0.5" style={{ color: '#ffdd3b', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <span style={{ color: '#ffdd3b', ...MONO }} className="text-[9px] uppercase tracking-wider block leading-tight">
              Top 3 by IQ gained · Daily · Weekly · Monthly
            </span>
            <span style={{ color: '#665500', ...MONO }} className="text-[8px] uppercase tracking-wider block mt-0.5 leading-tight">
              🥇 1000 · 🥈 750 · 🥉 500 coins each period
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
