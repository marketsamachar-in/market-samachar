/**
 * CHARTGUESSR — Guess the stock from an unlabeled price chart.
 *
 *   GET  /api/chartguessr/round    → start a new round (chart + 4 choices)
 *   POST /api/chartguessr/answer   → submit choice, get coins + streak
 *   GET  /api/chartguessr/stats    → user's streak + accuracy
 *
 * Round security: the correct answer is held in an in-memory store keyed
 * by a signed roundId.  Client never sees the answer until it submits.
 */

import { Router } from "express";
import crypto from "crypto";
import YahooFinance from "yahoo-finance2";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser, addCoins, deductCoins, getVirtualBalance } from "../services/coinService.ts";
import rawDb from "../../../pipeline/db.ts";
import {
  NIFTY_50, NIFTY_NEXT_50,
} from "../data/nse-symbols.ts";
import {
  CHARTGUESSR_CORRECT_COINS,
  CHARTGUESSR_WRONG_PENALTY,
  CHARTGUESSR_DAILY_LIMIT,
  CHARTGUESSR_STREAK_5_BONUS,
  CHARTGUESSR_STREAK_10_BONUS,
  CHARTGUESSR_STREAK_20_BONUS,
} from "../services/rewardConfig.ts";

const router = Router();
router.use(requireAuth);

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Pool of stocks to draw from. Nifty 50 + Next 50 = 100 well-known names.
const SYMBOL_POOL: string[] = [...NIFTY_50, ...NIFTY_NEXT_50];

// ─── In-memory round store ────────────────────────────────────────────────────
// Keys live for 5 min — long enough to play, short enough to bound memory.
interface PendingRound {
  correctSymbol: string;
  createdAt:     number;
}
const ROUNDS = new Map<string, PendingRound>();
const ROUND_TTL = 5 * 60_000;

function pruneRounds() {
  const cutoff = Date.now() - ROUND_TTL;
  for (const [k, v] of ROUNDS) if (v.createdAt < cutoff) ROUNDS.delete(k);
}

// ─── Chart fetch + cache ──────────────────────────────────────────────────────

interface ChartPoint { t: number; c: number; }
const CHART_CACHE = new Map<string, { points: ChartPoint[]; fetchedAt: number }>();
const CHART_TTL = 60 * 60_000; // 1 hour — chartguessr uses 1-month bars, no need for fresh

async function fetchOneMonthChart(symbol: string): Promise<ChartPoint[]> {
  const hit = CHART_CACHE.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < CHART_TTL) return hit.points;

  const period2 = new Date();
  const period1 = new Date(period2.getTime() - 31 * 86_400_000);
  const result  = await yf.chart(`${symbol}.NS`, {
    period1, period2, interval: "1d" as any,
  } as any);
  const quotes = (result?.quotes ?? []) as any[];
  const points = quotes
    .filter((q) => q && q.close != null)
    .map((q) => ({
      t: new Date(q.date).getTime(),
      c: Math.round(q.close * 100) / 100,
    }));

  CHART_CACHE.set(symbol, { points, fetchedAt: Date.now() });
  return points;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickDistractors(correct: string, count = 3): string[] {
  const pool = SYMBOL_POOL.filter((s) => s !== correct);
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Current consecutive correct streak from the user's most recent plays. */
function getCurrentStreak(userId: string): number {
  const rows = rawDb.prepare(`
    SELECT was_correct FROM chartguessr_plays
    WHERE user_id = ?
    ORDER BY played_at DESC
    LIMIT 50
  `).all(userId) as Array<{ was_correct: number }>;
  let n = 0;
  for (const r of rows) {
    if (r.was_correct === 1) n++;
    else break;
  }
  return n;
}

function istDateRange(): { start: number; end: number } {
  const istNowMs = Date.now() + 5.5 * 60 * 60 * 1000;
  const m = new Date(istNowMs);
  m.setUTCHours(0, 0, 0, 0);
  const start = m.getTime() - 5.5 * 60 * 60 * 1000;
  return { start, end: start + 86_400_000 };
}

function countPlaysToday(userId: string): number {
  const { start } = istDateRange();
  const r = rawDb.prepare(
    "SELECT COUNT(*) AS c FROM chartguessr_plays WHERE user_id = ? AND played_at >= ?"
  ).get(userId, start) as { c: number };
  return r.c;
}

// ─── GET /round ───────────────────────────────────────────────────────────────

router.get("/round", async (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    if (countPlaysToday(user.id) >= CHARTGUESSR_DAILY_LIMIT) {
      return res.json({
        ok: false, reason: "daily_limit",
        message: `Daily limit of ${CHARTGUESSR_DAILY_LIMIT} reached. Come back tomorrow!`,
      });
    }

    pruneRounds();

    // Try up to 5 random symbols until we get usable chart data
    let correctSymbol: string | null = null;
    let points: ChartPoint[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = pickRandom(SYMBOL_POOL);
      try {
        const pts = await fetchOneMonthChart(candidate);
        if (pts.length >= 10) { correctSymbol = candidate; points = pts; break; }
      } catch { /* try next */ }
    }
    if (!correctSymbol) {
      return res.status(503).json({ ok: false, error: "Chart data unavailable, try again" });
    }

    const distractors = pickDistractors(correctSymbol, 3);
    const choices     = shuffle([correctSymbol, ...distractors]);

    const roundId = crypto.randomBytes(16).toString("hex");
    ROUNDS.set(roundId, { correctSymbol, createdAt: Date.now() });

    res.json({
      ok:      true,
      roundId,
      points,                                      // anonymized chart
      choices,                                     // 4 NSE symbols
      streak:  getCurrentStreak(user.id),
      playsToday: countPlaysToday(user.id),
      dailyLimit: CHARTGUESSR_DAILY_LIMIT,
    });
  } catch (err) {
    console.error("[/api/chartguessr/round] error:", err);
    res.status(500).json({ ok: false, error: "Failed to start round" });
  }
});

// ─── POST /answer ─────────────────────────────────────────────────────────────

router.post("/answer", (req, res) => {
  try {
    const user = req.user!;
    const { roundId, choice } = req.body as { roundId?: string; choice?: string };

    if (!roundId || typeof roundId !== "string") {
      return res.status(400).json({ ok: false, error: "roundId required" });
    }
    if (!choice || typeof choice !== "string") {
      return res.status(400).json({ ok: false, error: "choice required" });
    }

    const round = ROUNDS.get(roundId);
    if (!round) {
      return res.status(410).json({ ok: false, error: "Round expired or already used" });
    }
    ROUNDS.delete(roundId); // single-use

    if (Date.now() - round.createdAt > ROUND_TTL) {
      return res.status(410).json({ ok: false, error: "Round expired" });
    }

    const wasCorrect = choice.toUpperCase() === round.correctSymbol.toUpperCase();
    const now = Date.now();

    // Compute streak after this play (predict before insert; we'll save it).
    const prevStreak = getCurrentStreak(user.id);
    const newStreak  = wasCorrect ? prevStreak + 1 : 0;

    // Coin payout
    let coinsDelta = 0;
    let bonusReason: string | null = null;
    let newBalance = getVirtualBalance(user.id);

    rawDb.transaction(() => {
      if (wasCorrect) {
        newBalance = addCoins(
          user.id, CHARTGUESSR_CORRECT_COINS, "CHARTGUESSR_CORRECT",
          round.correctSymbol, "Correct guess",
        );
        coinsDelta += CHARTGUESSR_CORRECT_COINS;

        // Streak bonuses (paid only on the play that hits the threshold)
        let streakBonus = 0;
        if (newStreak === 20)      { streakBonus = CHARTGUESSR_STREAK_20_BONUS; bonusReason = "🔥 20-streak!"; }
        else if (newStreak === 10) { streakBonus = CHARTGUESSR_STREAK_10_BONUS; bonusReason = "🔥 10-streak!"; }
        else if (newStreak === 5)  { streakBonus = CHARTGUESSR_STREAK_5_BONUS;  bonusReason = "🔥 5-streak!"; }
        if (streakBonus > 0) {
          newBalance = addCoins(
            user.id, streakBonus, "CHARTGUESSR_STREAK",
            round.correctSymbol, `Streak ${newStreak}`,
          );
          coinsDelta += streakBonus;
        }
      } else {
        // Penalty — but only if the user has the coins.  Otherwise zero out.
        const cur = getVirtualBalance(user.id);
        const pen = Math.min(CHARTGUESSR_WRONG_PENALTY, cur);
        if (pen > 0) {
          newBalance = deductCoins(
            user.id, pen, "CHARTGUESSR_WRONG",
            round.correctSymbol, "Wrong guess",
          );
          coinsDelta -= pen;
        }
      }

      rawDb.prepare(`
        INSERT INTO chartguessr_plays
          (user_id, correct_symbol, chosen_symbol, was_correct, coins_earned, streak_after, played_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, round.correctSymbol, choice.toUpperCase(),
             wasCorrect ? 1 : 0, coinsDelta, newStreak, now);
    })();

    res.json({
      ok:            true,
      wasCorrect,
      correctSymbol: round.correctSymbol,
      coinsDelta,
      bonusReason,
      streak:        newStreak,
      balance:       newBalance,
      playsToday:    countPlaysToday(user.id),
      dailyLimit:    CHARTGUESSR_DAILY_LIMIT,
    });
  } catch (err) {
    console.error("[/api/chartguessr/answer] error:", err);
    res.status(500).json({ ok: false, error: "Failed to submit answer" });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────

router.get("/stats", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const totals = rawDb.prepare(`
      SELECT
        COUNT(*)                                       AS plays,
        SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct,
        MAX(streak_after)                              AS best_streak,
        COALESCE(SUM(coins_earned), 0)                 AS coins_total
      FROM chartguessr_plays
      WHERE user_id = ?
    `).get(user.id) as { plays: number; correct: number; best_streak: number | null; coins_total: number };

    const accuracy = totals.plays > 0
      ? Math.round((totals.correct / totals.plays) * 100)
      : null;

    res.json({
      ok:           true,
      plays:        totals.plays,
      correct:      totals.correct,
      accuracyPct:  accuracy,
      bestStreak:   totals.best_streak ?? 0,
      currentStreak: getCurrentStreak(user.id),
      coinsTotal:   totals.coins_total,
      playsToday:   countPlaysToday(user.id),
      dailyLimit:   CHARTGUESSR_DAILY_LIMIT,
    });
  } catch (err) {
    console.error("[/api/chartguessr/stats] error:", err);
    res.status(500).json({ ok: false, error: "Failed to load stats" });
  }
});

export default router;
