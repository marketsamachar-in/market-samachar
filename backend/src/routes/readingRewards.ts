/**
 * Reading Rewards API
 *
 * POST /api/reading-rewards/claim   → claim per-article reward (+5 AI summary, +10 listen)
 * GET  /api/reading-rewards/today   → today's reading stats
 *
 * Requires a valid Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser, addCoins, getVirtualBalance } from "../services/coinService.ts";
import rawDb from "../../../pipeline/db.ts";
import {
  AI_SUMMARY_READ_COINS,
  ARTICLE_LISTEN_COINS,
  DAILY_READING_STREAK_COINS,
  DAILY_READING_STREAK_MIN_ARTICLES,
  READING_REWARD_DAILY_CAP,
  POLL_VOTE_COINS,
  SHARE_ARTICLE_COINS,
} from "../services/rewardConfig.ts";

const router = Router();
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** IST date string "YYYY-MM-DD" */
function istDateStr(tsMs: number): string {
  return new Date(tsMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const VALID_TYPES = ['AI_SUMMARY_READ', 'ARTICLE_LISTEN', 'POLL_VOTE', 'SHARE_ARTICLE'] as const;
type RewardType = typeof VALID_TYPES[number];

function coinsForType(t: RewardType): number {
  switch (t) {
    case 'AI_SUMMARY_READ': return AI_SUMMARY_READ_COINS;
    case 'ARTICLE_LISTEN':  return ARTICLE_LISTEN_COINS;
    case 'POLL_VOTE':       return POLL_VOTE_COINS;
    case 'SHARE_ARTICLE':   return SHARE_ARTICLE_COINS;
  }
}

// ─── POST /claim ──────────────────────────────────────────────────────────────

router.post("/claim", (req, res) => {
  try {
    const user = req.user!;
    const { articleId, rewardType } = req.body as { articleId?: string; rewardType?: string };

    if (!articleId || typeof articleId !== "string") {
      return res.status(400).json({ ok: false, error: "articleId required" });
    }
    if (!rewardType || !VALID_TYPES.includes(rewardType as RewardType)) {
      return res.status(400).json({ ok: false, error: "rewardType must be one of AI_SUMMARY_READ, ARTICLE_LISTEN, POLL_VOTE, SHARE_ARTICLE" });
    }

    ensureUser(user.id, user.name, user.email);
    const today = istDateStr(Date.now());
    const coins = coinsForType(rewardType as RewardType);

    // Check daily cap
    const countRow = rawDb.prepare(
      "SELECT COUNT(*) as cnt FROM reading_rewards WHERE user_id = ? AND reward_type = ? AND reward_date = ?"
    ).get(user.id, rewardType, today) as { cnt: number };

    if (countRow.cnt >= READING_REWARD_DAILY_CAP) {
      return res.json({ ok: true, alreadyCapped: true, coinsEarned: 0, streakBonusEarned: 0, newBalance: getVirtualBalance(user.id) });
    }

    // Try insert (UNIQUE constraint prevents duplicates)
    const result = rawDb.prepare(
      "INSERT OR IGNORE INTO reading_rewards (user_id, article_id, reward_type, coins_awarded, reward_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(user.id, articleId, rewardType, coins, today, Date.now());

    if (result.changes === 0) {
      // Already claimed for this article+type today
      return res.json({ ok: true, alreadyClaimed: true, coinsEarned: 0, streakBonusEarned: 0, newBalance: getVirtualBalance(user.id) });
    }

    // Award coins
    addCoins(user.id, coins, rewardType as RewardType, articleId, `${rewardType === 'AI_SUMMARY_READ' ? 'AI Summary' : 'Listen'} reward`);

    // Award daily reading streak bonus only after reading DAILY_READING_STREAK_MIN_ARTICLES unique articles
    let streakBonusEarned = 0;
    const alreadyStreaked = rawDb.prepare(
      "SELECT 1 FROM daily_reading_streak WHERE user_id = ? AND streak_date = ?"
    ).get(user.id, today);

    if (!alreadyStreaked) {
      const uniqueAiReadsToday = (rawDb.prepare(
        "SELECT COUNT(*) as cnt FROM reading_rewards WHERE user_id = ? AND reward_type = 'AI_SUMMARY_READ' AND reward_date = ?"
      ).get(user.id, today) as { cnt: number }).cnt;

      if (uniqueAiReadsToday >= DAILY_READING_STREAK_MIN_ARTICLES) {
        const streakResult = rawDb.prepare(
          "INSERT OR IGNORE INTO daily_reading_streak (user_id, streak_date, coins_awarded, created_at) VALUES (?, ?, ?, ?)"
        ).run(user.id, today, DAILY_READING_STREAK_COINS, Date.now());

        if (streakResult.changes > 0) {
          addCoins(user.id, DAILY_READING_STREAK_COINS, 'DAILY_READING_STREAK', null, 'Daily reading streak bonus');
          streakBonusEarned = DAILY_READING_STREAK_COINS;
        }
      }
    }

    const newBalance = getVirtualBalance(user.id);
    return res.json({ ok: true, coinsEarned: coins, streakBonusEarned, newBalance });
  } catch (err: any) {
    console.error("[reading-rewards] claim error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// ─── GET /today ───────────────────────────────────────────────────────────────

router.get("/today", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);
    const today = istDateStr(Date.now());

    // Counts by type
    const aiCount = (rawDb.prepare(
      "SELECT COUNT(*) as cnt FROM reading_rewards WHERE user_id = ? AND reward_type = 'AI_SUMMARY_READ' AND reward_date = ?"
    ).get(user.id, today) as { cnt: number }).cnt;

    const listenCount = (rawDb.prepare(
      "SELECT COUNT(*) as cnt FROM reading_rewards WHERE user_id = ? AND reward_type = 'ARTICLE_LISTEN' AND reward_date = ?"
    ).get(user.id, today) as { cnt: number }).cnt;

    // Total coins from reading today
    const totalRow = rawDb.prepare(
      "SELECT COALESCE(SUM(coins_awarded), 0) as total FROM reading_rewards WHERE user_id = ? AND reward_date = ?"
    ).get(user.id, today) as { total: number };

    // Streak claimed?
    const streakRow = rawDb.prepare(
      "SELECT 1 FROM daily_reading_streak WHERE user_id = ? AND streak_date = ?"
    ).get(user.id, today);

    // Claimed article IDs today
    const claimed = rawDb.prepare(
      "SELECT article_id, reward_type FROM reading_rewards WHERE user_id = ? AND reward_date = ?"
    ).all(user.id, today) as Array<{ article_id: string; reward_type: string }>;

    const claimedArticles: Record<string, { ai: boolean; listen: boolean }> = {};
    for (const row of claimed) {
      if (!claimedArticles[row.article_id]) {
        claimedArticles[row.article_id] = { ai: false, listen: false };
      }
      if (row.reward_type === 'AI_SUMMARY_READ') claimedArticles[row.article_id].ai = true;
      if (row.reward_type === 'ARTICLE_LISTEN') claimedArticles[row.article_id].listen = true;
    }

    return res.json({
      ok: true,
      aiSummaryCount: aiCount,
      listenCount,
      totalCoinsToday: totalRow.total + (streakRow ? DAILY_READING_STREAK_COINS : 0),
      streakClaimed: !!streakRow,
      dailyCap: READING_REWARD_DAILY_CAP,
      claimedArticles,
    });
  } catch (err: any) {
    console.error("[reading-rewards] today error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
