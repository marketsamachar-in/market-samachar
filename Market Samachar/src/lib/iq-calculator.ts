/**
 * Investor IQ Calculator
 * Pure functions — usable in both browser (React) and Node.js (server.ts).
 * No imports, no side effects.
 */

export const IQ_BASE = 300;
export const IQ_MIN  = 100;
export const IQ_MAX  = 1000;

// ─── Title system ─────────────────────────────────────────────────────────────

export type IQTier = 'grey' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface IQTitle {
  title: string;
  tier:  IQTier;
  color: string;
  emoji: string;
  range: [number, number];
}

const TITLES: IQTitle[] = [
  { title: 'Market Guru',      tier: 'diamond',  color: '#00ff88', emoji: '✨', range: [950, 1000] },
  { title: 'Dalal Street Pro', tier: 'platinum', color: '#e2e8f0', emoji: '💎', range: [800,  950] },
  { title: 'Seasoned Trader',  tier: 'gold',     color: '#ffcc44', emoji: '🥇', range: [600,  800] },
  { title: 'Market Analyst',   tier: 'silver',   color: '#b0b8cc', emoji: '📊', range: [400,  600] },
  { title: 'Rookie Trader',    tier: 'bronze',   color: '#cd7f32', emoji: '📈', range: [200,  400] },
  { title: 'News Reader',       tier: 'grey',     color: '#778899', emoji: '📰', range: [0,    200] },
];

export function getTitleFromIQ(iq: number): IQTitle {
  return TITLES.find(t => iq >= t.range[0]) ?? TITLES[TITLES.length - 1];
}

export function getNextTitle(iq: number): IQTitle | null {
  const idx = TITLES.findIndex(t => iq >= t.range[0]);
  return idx > 0 ? TITLES[idx - 1] : null;
}

/** Points needed to reach the next tier. */
export function pointsToNextTier(iq: number): number {
  const next = getNextTitle(iq);
  return next ? next.range[0] - iq : 0;
}

// ─── Score calculation ────────────────────────────────────────────────────────

export interface QuizIQParams {
  correct:         number;   // number of correct answers
  wrong:           number;   // number of wrong / timed-out answers
  streak_days:     number;   // current streak (AFTER this attempt)
  time_taken_secs: number;   // total time for the whole quiz
  question_count:  number;   // total questions (typically 5)
}

/**
 * Calculate the IQ delta earned from a single quiz attempt.
 *
 * Formula:
 *   perCorrect    = 15 + max(0, 10 − avgSecs / 2)   // 0–25 per correct, time-weighted
 *   gainPoints    = correct × perCorrect
 *   streakMult    = min(1 + streak_days × 0.1, 2.0)
 *   adjustedGain  = gainPoints × streakMult
 *   lossPoints    = wrong × 5
 *   delta         = adjustedGain − lossPoints        (can be negative)
 *
 * Speed examples (no streak): 5s/q → +22.5/correct, 15s/q → +17.5, 25s/q → +15.
 */
export function calculateQuizIQDelta(p: QuizIQParams): number {
  const avgTime      = p.time_taken_secs / p.question_count;
  const perCorrect   = 15 + Math.max(0, 10 - avgTime / 2);
  const gainPoints   = p.correct * perCorrect;
  const streakMult   = Math.min(1 + p.streak_days * 0.1, 2.0);
  const adjustedGain = gainPoints * streakMult;
  const lossPoints   = p.wrong * 5;
  return Math.round(adjustedGain - lossPoints);
}

/**
 * Tier-based coin multiplier — higher IQ tiers earn proportionally more from
 * each correct answer. Rewards climbing and encourages daily play.
 *
 *   News Reader (0–200)     → 1.0×
 *   Rookie Trader (200–400) → 1.2×
 *   Market Analyst (400–600)→ 1.5×
 *   Seasoned Trader (600–800)→ 2.0×
 *   Dalal St Pro (800–950)  → 2.5×
 *   Market Guru (950+)      → 3.0×
 */
export function getIQTierMultiplier(iq: number): number {
  if (iq >= 950) return 3.0;
  if (iq >= 800) return 2.5;
  if (iq >= 600) return 2.0;
  if (iq >= 400) return 1.5;
  if (iq >= 200) return 1.2;
  return 1.0;
}

/**
 * Apply daily decay for missed days.
 * No decay for up to 1 missed day (weekends etc.).
 * -2 per additional missed day, minimum IQ_MIN.
 */
export function applyDecay(currentIQ: number, daysMissed: number): number {
  if (daysMissed <= 1) return currentIQ;
  const decay = (daysMissed - 1) * 2;
  return Math.max(IQ_MIN, currentIQ - decay);
}

/** Clamp IQ to valid range [IQ_MIN, IQ_MAX]. */
export function clampIQ(iq: number): number {
  return Math.max(IQ_MIN, Math.min(IQ_MAX, iq));
}

// ─── Percentile ───────────────────────────────────────────────────────────────

/**
 * Estimated "top X% of users" percentile.
 * Based on a simulated bell-curve skewed toward new/casual users (~300 IQ).
 * Replace with a real DB query as user base grows.
 */
export function getPercentile(iq: number): number {
  if (iq >= 950) return 1;
  if (iq >= 900) return 2;
  if (iq >= 800) return 5;
  if (iq >= 700) return 12;
  if (iq >= 600) return 22;
  if (iq >= 500) return 35;
  if (iq >= 400) return 50;
  if (iq >= 300) return 65;
  if (iq >= 200) return 78;
  return 88;
}
