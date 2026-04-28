/**
 * Reading + Engagement Rewards API
 *
 *   POST /api/reading-rewards/claim
 *     body: { articleId, rewardType, platform? }
 *     rewardType: AI_SUMMARY_READ | ARTICLE_LISTEN | POLL_VOTE | SHARE_ARTICLE
 *     platform (shares only): whatsapp | twitter | telegram | copy | other
 *
 *   GET  /api/reading-rewards/today  → today's stats per type
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
  POLL_VOTE_DAILY_CAP,
  POLL_STREAK_5_BONUS_COINS,
  POLL_STREAK_15_BONUS_COINS,
  SHARE_ARTICLE_COINS,
  SHARE_ARTICLE_DAILY_CAP,
  SHARE_MULTI_PLATFORM_BONUS,
  SHARE_STREAK_5_BONUS_COINS,
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

const VALID_PLATFORMS = ['whatsapp', 'twitter', 'telegram', 'copy', 'other'] as const;
type Platform = typeof VALID_PLATFORMS[number];

function coinsForType(t: RewardType): number {
  switch (t) {
    case 'AI_SUMMARY_READ': return AI_SUMMARY_READ_COINS;
    case 'ARTICLE_LISTEN':  return ARTICLE_LISTEN_COINS;
    case 'POLL_VOTE':       return POLL_VOTE_COINS;
    case 'SHARE_ARTICLE':   return SHARE_ARTICLE_COINS;
  }
}

function dailyCapForType(t: RewardType): number {
  switch (t) {
    case 'POLL_VOTE':     return POLL_VOTE_DAILY_CAP;
    case 'SHARE_ARTICLE': return SHARE_ARTICLE_DAILY_CAP;
    default:              return READING_REWARD_DAILY_CAP;
  }
}

function countByTypeToday(userId: string, type: RewardType, date: string): number {
  return (rawDb.prepare(
    "SELECT COUNT(*) AS c FROM reading_rewards WHERE user_id = ? AND reward_type = ? AND reward_date = ?"
  ).get(userId, type, date) as { c: number }).c;
}

/**
 * Award daily streak bonuses for polls / shares the moment a threshold is crossed.
 * Idempotent — uses samachar_coins note tagging to prevent double-paying within the day.
 */
function maybeAwardEngagementBonus(
  userId: string,
  type: 'POLL_VOTE' | 'SHARE_ARTICLE',
  countAfterInsert: number,
  date: string,
): { bonusAwarded: number; bonusReason: string | null } {
  let bonus = 0;
  let reason: string | null = null;

  if (type === 'POLL_VOTE') {
    if (countAfterInsert === 5)  { bonus = POLL_STREAK_5_BONUS_COINS;  reason = "5 polls today!"; }
    if (countAfterInsert === 15) { bonus = POLL_STREAK_15_BONUS_COINS; reason = "15 polls today!"; }
  } else if (type === 'SHARE_ARTICLE') {
    if (countAfterInsert === 5)  { bonus = SHARE_STREAK_5_BONUS_COINS; reason = "5 shares today!"; }
  }

  if (bonus > 0) {
    const actionType = type === 'POLL_VOTE' ? 'POLL_VOTE_BONUS' : 'SHARE_ARTICLE_BONUS';
    addCoins(userId, bonus, actionType, null, `Streak: ${reason}`);
  }
  return { bonusAwarded: bonus, bonusReason: reason };
}

/**
 * Award the multi-platform bonus once per article when the user's first
 * second-platform share is recorded.
 */
function maybeAwardMultiPlatformBonus(
  userId: string, articleId: string, date: string,
): { bonusAwarded: number; bonusReason: string | null } {
  const platformsRow = rawDb.prepare(`
    SELECT COUNT(DISTINCT platform) AS c
    FROM reading_rewards
    WHERE user_id = ? AND article_id = ? AND reward_type = 'SHARE_ARTICLE'
      AND reward_date = ? AND platform IS NOT NULL
  `).get(userId, articleId, date) as { c: number };

  // Trigger exactly when distinct-platform count hits 2
  if (platformsRow.c === 2) {
    addCoins(userId, SHARE_MULTI_PLATFORM_BONUS, 'SHARE_ARTICLE_BONUS',
             articleId, "Multi-platform share bonus");
    return { bonusAwarded: SHARE_MULTI_PLATFORM_BONUS, bonusReason: "Multi-platform bonus!" };
  }
  return { bonusAwarded: 0, bonusReason: null };
}

// ─── POST /claim ──────────────────────────────────────────────────────────────

router.post("/claim", (req, res) => {
  try {
    const user = req.user!;
    const { articleId, rewardType, platform } = req.body as {
      articleId?: string; rewardType?: string; platform?: string;
    };

    if (!articleId || typeof articleId !== "string") {
      return res.status(400).json({ ok: false, error: "articleId required" });
    }
    if (!rewardType || !VALID_TYPES.includes(rewardType as RewardType)) {
      return res.status(400).json({ ok: false, error: `rewardType must be one of ${VALID_TYPES.join(', ')}` });
    }

    const type = rewardType as RewardType;
    const isShare = type === 'SHARE_ARTICLE';

    // Validate platform for shares (optional but recommended)
    let platformValue: string | null = null;
    if (isShare) {
      const p = (platform ?? '').toLowerCase();
      platformValue = VALID_PLATFORMS.includes(p as Platform) ? p : 'other';
    }

    ensureUser(user.id, user.name, user.email);
    const today = istDateStr(Date.now());
    const cap   = dailyCapForType(type);
    const coins = coinsForType(type);

    // Daily cap check
    const countBefore = countByTypeToday(user.id, type, today);
    if (countBefore >= cap) {
      return res.json({
        ok: true, alreadyCapped: true, coinsEarned: 0,
        bonusEarned: 0, bonusReason: null,
        streakBonusEarned: 0, newBalance: getVirtualBalance(user.id),
        dailyCap: cap, countToday: countBefore,
      });
    }

    // Try insert (UNIQUE constraint prevents duplicates per article+type+date+platform)
    const result = rawDb.prepare(
      "INSERT OR IGNORE INTO reading_rewards (user_id, article_id, reward_type, coins_awarded, reward_date, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(user.id, articleId, type, coins, today, platformValue, Date.now());

    if (result.changes === 0) {
      return res.json({
        ok: true, alreadyClaimed: true, coinsEarned: 0,
        bonusEarned: 0, bonusReason: null,
        streakBonusEarned: 0, newBalance: getVirtualBalance(user.id),
        dailyCap: cap, countToday: countBefore,
      });
    }

    // Base coins
    addCoins(user.id, coins, type, articleId, type.toLowerCase().replace('_', ' '));

    const countAfter = countBefore + 1;
    let bonusEarned = 0;
    let bonusReason: string | null = null;

    // Poll / share streak bonus
    if (type === 'POLL_VOTE' || type === 'SHARE_ARTICLE') {
      const r = maybeAwardEngagementBonus(user.id, type, countAfter, today);
      bonusEarned += r.bonusAwarded;
      if (r.bonusReason) bonusReason = r.bonusReason;
    }

    // Multi-platform share bonus (separate from streak)
    if (isShare) {
      const r = maybeAwardMultiPlatformBonus(user.id, articleId, today);
      bonusEarned += r.bonusAwarded;
      if (r.bonusReason) bonusReason = bonusReason ? `${bonusReason} + ${r.bonusReason}` : r.bonusReason;
    }

    // Daily reading streak (existing flow — unchanged)
    let streakBonusEarned = 0;
    if (type === 'AI_SUMMARY_READ') {
      const alreadyStreaked = rawDb.prepare(
        "SELECT 1 FROM daily_reading_streak WHERE user_id = ? AND streak_date = ?"
      ).get(user.id, today);
      if (!alreadyStreaked) {
        const uniqueAiReadsToday = countByTypeToday(user.id, 'AI_SUMMARY_READ', today);
        if (uniqueAiReadsToday >= DAILY_READING_STREAK_MIN_ARTICLES) {
          const sr = rawDb.prepare(
            "INSERT OR IGNORE INTO daily_reading_streak (user_id, streak_date, coins_awarded, created_at) VALUES (?, ?, ?, ?)"
          ).run(user.id, today, DAILY_READING_STREAK_COINS, Date.now());
          if (sr.changes > 0) {
            addCoins(user.id, DAILY_READING_STREAK_COINS, 'DAILY_READING_STREAK', null, 'Daily reading streak bonus');
            streakBonusEarned = DAILY_READING_STREAK_COINS;
          }
        }
      }
    }

    const newBalance = getVirtualBalance(user.id);
    return res.json({
      ok:                true,
      coinsEarned:       coins,
      bonusEarned,
      bonusReason,
      streakBonusEarned,
      newBalance,
      dailyCap:          cap,
      countToday:        countAfter,
    });
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

    const aiCount     = countByTypeToday(user.id, 'AI_SUMMARY_READ', today);
    const listenCount = countByTypeToday(user.id, 'ARTICLE_LISTEN',  today);
    const pollCount   = countByTypeToday(user.id, 'POLL_VOTE',       today);
    const shareCount  = countByTypeToday(user.id, 'SHARE_ARTICLE',   today);

    const totalRow = rawDb.prepare(
      "SELECT COALESCE(SUM(coins_awarded), 0) as total FROM reading_rewards WHERE user_id = ? AND reward_date = ?"
    ).get(user.id, today) as { total: number };

    const streakRow = rawDb.prepare(
      "SELECT 1 FROM daily_reading_streak WHERE user_id = ? AND streak_date = ?"
    ).get(user.id, today);

    const claimed = rawDb.prepare(
      "SELECT article_id, reward_type FROM reading_rewards WHERE user_id = ? AND reward_date = ?"
    ).all(user.id, today) as Array<{ article_id: string; reward_type: string }>;

    const claimedArticles: Record<string, { ai: boolean; listen: boolean; poll: boolean; share: boolean }> = {};
    for (const row of claimed) {
      if (!claimedArticles[row.article_id]) {
        claimedArticles[row.article_id] = { ai: false, listen: false, poll: false, share: false };
      }
      if (row.reward_type === 'AI_SUMMARY_READ') claimedArticles[row.article_id].ai     = true;
      if (row.reward_type === 'ARTICLE_LISTEN')  claimedArticles[row.article_id].listen = true;
      if (row.reward_type === 'POLL_VOTE')       claimedArticles[row.article_id].poll   = true;
      if (row.reward_type === 'SHARE_ARTICLE')   claimedArticles[row.article_id].share  = true;
    }

    return res.json({
      ok: true,
      aiSummaryCount:  aiCount,
      listenCount,
      pollCount,
      shareCount,
      pollDailyCap:    POLL_VOTE_DAILY_CAP,
      shareDailyCap:   SHARE_ARTICLE_DAILY_CAP,
      totalCoinsToday: totalRow.total + (streakRow ? DAILY_READING_STREAK_COINS : 0),
      streakClaimed:   !!streakRow,
      dailyCap:        READING_REWARD_DAILY_CAP,
      claimedArticles,
    });
  } catch (err: any) {
    console.error("[reading-rewards] today error:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
