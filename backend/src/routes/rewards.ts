/**
 * Rewards Hub API
 *
 * GET  /api/rewards/hub        → complete user rewards summary
 *
 * Requires a valid Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser, addCoins, getVirtualBalance } from "../services/coinService.ts";
import rawDb from "../../../pipeline/db.ts";
import { getUserByReferralCode, getUserById } from "../../../pipeline/db.ts";
import type { CoinLedgerEntry } from "../../../pipeline/db.ts";
import {
  FIRST_LOGIN_COINS,
  DAILY_LOGIN_COINS,
  STREAK_BONUS_PER_DAY,
  STREAK_BONUS_MAX,
  REFERRAL_NEW_USER_COINS,
  REFERRAL_INVITER_COINS,
} from "../services/rewardConfig.ts";

const router = Router();
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** IST date string "YYYY-MM-DD" */
function istDateStr(tsMs: number): string {
  return new Date(tsMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Generate a short referral code from a UUID (first 6 alphanumeric chars, uppercase). */
function generateReferralCode(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/** Ensure the user row has a referral_code. Returns it. */
function ensureReferralCode(userId: string): string {
  const row = rawDb
    .prepare("SELECT referral_code FROM users WHERE id = ?")
    .get(userId) as { referral_code: string | null } | undefined;

  if (row?.referral_code) return row.referral_code;

  const code = generateReferralCode(userId);
  rawDb
    .prepare("UPDATE users SET referral_code = ? WHERE id = ?")
    .run(code, userId);
  return code;
}

// ─── GET /api/rewards/hub ─────────────────────────────────────────────────────

router.get("/hub", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    // ── Virtual coin balance ───────────────────────────────────────────────
    const virtualBalance = getVirtualBalance(user.id);

    // ── Last 20 ledger entries ─────────────────────────────────────────────
    const coinLedger = rawDb
      .prepare(`
        SELECT id, user_id, action_type, amount, balance_after, ref_id, note, created_at
        FROM samachar_coins
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `)
      .all(user.id) as CoinLedgerEntry[];

    // ── Weekly breakdown (last 7 days) ────────────────────────────────────
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekRows = rawDb
      .prepare(`
        SELECT
          action_type,
          amount,
          created_at
        FROM samachar_coins
        WHERE user_id = ?
          AND created_at >= ?
          AND amount > 0
        ORDER BY created_at ASC
      `)
      .all(user.id, sevenDaysAgo) as Array<{
        action_type: string;
        amount: number;
        created_at: number;
      }>;

    // Build 7-day map
    const dayMap = new Map<string, { quiz: number; predictions: number; trading: number; streak: number; other: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = istDateStr(Date.now() - i * 24 * 60 * 60 * 1000);
      dayMap.set(d, { quiz: 0, predictions: 0, trading: 0, streak: 0, other: 0 });
    }
    for (const row of weekRows) {
      const d = istDateStr(row.created_at);
      const bucket = dayMap.get(d);
      if (!bucket) continue;
      const at = row.action_type;
      if (at === "QUIZ_CORRECT" || at === "QUIZ_BONUS") bucket.quiz += row.amount;
      else if (at === "PREDICTION_VOTE" || at === "PREDICTION_CORRECT") bucket.predictions += row.amount;
      else if (at === "VIRTUAL_TRADE" || at === "PORTFOLIO_PROFIT") bucket.trading += row.amount;
      else if (at === "DAILY_STREAK") bucket.streak += row.amount;
      else bucket.other += row.amount;
    }
    const weeklyBreakdown = Array.from(dayMap.entries()).map(([date, bySource]) => ({
      date,
      total: bySource.quiz + bySource.predictions + bySource.trading + bySource.streak + bySource.other,
      bySource,
    }));

    // ── Today's task status ────────────────────────────────────────────────
    const todayIST = istDateStr(Date.now());
    const todayStart = new Date(todayIST + "T00:00:00+05:30").getTime();
    const todayRows = rawDb
      .prepare(`
        SELECT action_type, COUNT(*) as cnt
        FROM samachar_coins
        WHERE user_id = ?
          AND created_at >= ?
        GROUP BY action_type
      `)
      .all(user.id, todayStart) as Array<{ action_type: string; cnt: number }>;

    const todayMap = new Map(todayRows.map((r) => [r.action_type, r.cnt]));
    const todayTasks = {
      login:      (todayMap.get("DAILY_LOGIN") ?? 0) > 0 || (todayMap.get("FIRST_LOGIN") ?? 0) > 0,
      quiz:       (todayMap.get("QUIZ_CORRECT") ?? 0) > 0 || (todayMap.get("QUIZ_BONUS") ?? 0) > 0,
      prediction: (todayMap.get("PREDICTION_VOTE") ?? 0) > 0,
      trade:      (todayMap.get("VIRTUAL_TRADE") ?? 0) > 0,
      streak:     (todayMap.get("DAILY_STREAK") ?? 0) > 0,
    };

    // ── Referral ───────────────────────────────────────────────────────────
    const referralCode = ensureReferralCode(user.id);
    const referralCount = (
      rawDb
        .prepare("SELECT COUNT(*) as cnt FROM users WHERE referred_by = ?")
        .get(user.id) as { cnt: number } | undefined
    )?.cnt ?? 0;

    // ── Achievements ───────────────────────────────────────────────────────
    // Count trades, quiz attempts, correct predictions
    const tradeCount = (
      rawDb
        .prepare("SELECT COUNT(*) as cnt FROM virtual_orders WHERE user_id = ?")
        .get(user.id) as { cnt: number } | undefined
    )?.cnt ?? 0;

    const quizCount = (
      rawDb
        .prepare("SELECT COUNT(*) as cnt FROM samachar_coins WHERE user_id = ? AND action_type IN ('QUIZ_CORRECT','QUIZ_BONUS')")
        .get(user.id) as { cnt: number } | undefined
    )?.cnt ?? 0;

    const correctPredictions = (
      rawDb
        .prepare("SELECT COUNT(*) as cnt FROM samachar_coins WHERE user_id = ? AND action_type = 'PREDICTION_CORRECT'")
        .get(user.id) as { cnt: number } | undefined
    )?.cnt ?? 0;

    // First trade timestamp
    const firstTrade = rawDb
      .prepare("SELECT executed_at FROM virtual_orders WHERE user_id = ? ORDER BY executed_at ASC LIMIT 1")
      .get(user.id) as { executed_at: number } | undefined;

    // Streak — from users table (not tracked here but check coin ledger for consecutive days)
    const streakEntries = rawDb
      .prepare(`
        SELECT DISTINCT DATE(created_at / 1000, 'unixepoch') as day
        FROM samachar_coins
        WHERE user_id = ? AND action_type = 'DAILY_STREAK'
        ORDER BY day DESC
        LIMIT 10
      `)
      .all(user.id) as Array<{ day: string }>;

    // Calculate max consecutive streak
    let maxStreak = 0;
    let streak = 1;
    for (let i = 1; i < streakEntries.length; i++) {
      const prev = new Date(streakEntries[i - 1].day);
      const curr = new Date(streakEntries[i].day);
      const diff = (prev.getTime() - curr.getTime()) / 86400000;
      if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 1;
    }
    if (streakEntries.length > 0) maxStreak = Math.max(maxStreak, streak);

    const achievements = {
      firstTrade:       { unlocked: tradeCount > 0,    unlockedAt: firstTrade?.executed_at ?? null },
      sevenDayStreak:   { unlocked: maxStreak >= 7,    unlockedAt: null },
      predictionStreak: { unlocked: correctPredictions >= 5, unlockedAt: null },
      quizMaster:       { unlocked: quizCount >= 100,  unlockedAt: null },
    };

    return res.json({
      ok: true,
      virtualBalance,
      coinLedger,
      weeklyBreakdown,
      todayTasks,
      referralCode,
      referralCount,
      achievements,
      stats: {
        tradeCount,
        quizCount,
        correctPredictions,
        maxStreak,
      },
    });
  } catch (err) {
    console.error("[/api/rewards/hub]", err);
    return res.status(500).json({ ok: false, error: "Failed to load rewards hub" });
  }
});

// ─── POST /api/rewards/login ──────────────────────────────────────────────────

/**
 * Claim daily login reward. Call this once per day when user opens the app.
 *
 *  - First ever login   → 1,000 coins  (FIRST_LOGIN, 10X)
 *  - Subsequent daily   →   100 coins  (DAILY_LOGIN, 1X)
 *  - Streak bonus       → +50 per consecutive day (capped at 500 = 5X)
 *  - Separate DAILY_STREAK ledger entry for streak bonus
 *
 * Also updates the local streak tracking.
 */
router.post("/login", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    const todayIST = istDateStr(Date.now());
    const todayStart = new Date(todayIST + "T00:00:00+05:30").getTime();

    // Check if already claimed today
    const alreadyClaimed = rawDb
      .prepare(`
        SELECT 1 FROM samachar_coins
        WHERE user_id = ? AND action_type IN ('DAILY_LOGIN','FIRST_LOGIN') AND created_at >= ?
        LIMIT 1
      `)
      .get(user.id, todayStart);

    if (alreadyClaimed) {
      return res.json({ ok: true, alreadyClaimed: true, coinsEarned: 0 });
    }

    // Check if this is the very first login (no login entries ever)
    const hasLoggedBefore = rawDb
      .prepare(`
        SELECT 1 FROM samachar_coins
        WHERE user_id = ? AND action_type IN ('DAILY_LOGIN','FIRST_LOGIN')
        LIMIT 1
      `)
      .get(user.id);

    const isFirstLogin = !hasLoggedBefore;

    // Calculate streak
    const yesterdayIST = istDateStr(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStart = new Date(yesterdayIST + "T00:00:00+05:30").getTime();
    const yesterdayEnd = todayStart;

    const loggedYesterday = rawDb
      .prepare(`
        SELECT 1 FROM samachar_coins
        WHERE user_id = ? AND action_type IN ('DAILY_LOGIN','FIRST_LOGIN')
          AND created_at >= ? AND created_at < ?
        LIMIT 1
      `)
      .get(user.id, yesterdayStart, yesterdayEnd);

    // Get current streak from users table (defensive — streak columns may not exist on old DBs)
    let userRow: { streak_count?: number; streak_last_date?: string } | undefined;
    try {
      userRow = rawDb.prepare("SELECT streak_count, streak_last_date FROM users WHERE id = ?").get(user.id) as
        { streak_count?: number; streak_last_date?: string } | undefined;
    } catch { /* streak columns may not exist — skip */ }

    let newStreak = 1;
    if (loggedYesterday && userRow?.streak_count) {
      newStreak = userRow.streak_count + 1;
    }

    // Update streak on user row (defensive — skip if columns missing)
    try {
      rawDb.prepare(`
        UPDATE users SET streak_count = ?, streak_last_date = ?, updated_at = ? WHERE id = ?
      `).run(newStreak, todayIST, Date.now(), user.id);
    } catch { /* streak columns may not exist — skip */ }

    // Calculate reward
    let coinsEarned = 0;
    if (isFirstLogin) {
      // First login: 10X = 1,000 coins welcome bonus
      coinsEarned = FIRST_LOGIN_COINS;
      addCoins(user.id, FIRST_LOGIN_COINS, "FIRST_LOGIN", undefined, "Welcome bonus — first login! 🎉");
    } else {
      // Daily login: 1X = 100 coins base
      coinsEarned = DAILY_LOGIN_COINS;
      addCoins(user.id, DAILY_LOGIN_COINS, "DAILY_LOGIN", undefined,
        `Daily login reward (Day ${newStreak})`);

      // Streak bonus: +50 per consecutive day (max 500), as SEPARATE ledger entry
      if (newStreak > 1) {
        const streakBonus = Math.min((newStreak - 1) * STREAK_BONUS_PER_DAY, STREAK_BONUS_MAX);
        coinsEarned += streakBonus;
        addCoins(user.id, streakBonus, "DAILY_STREAK", undefined,
          `🔥 ${newStreak}-day streak bonus (+${streakBonus} coins)`);
      }
    }

    return res.json({
      ok: true,
      alreadyClaimed: false,
      isFirstLogin,
      coinsEarned,
      streak: newStreak,
    });
  } catch (err) {
    console.error("[/api/rewards/login]", err);
    return res.status(500).json({ ok: false, error: "Failed to claim login reward" });
  }
});

// ─── POST /api/rewards/referral/claim ────────────────────────────────────────

/**
 * Claim a referral code. Awards 500 coins (5X) to both the referrer and the new user.
 * Can only be claimed once per user.
 */
router.post("/referral/claim", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return res.status(400).json({ ok: false, error: "Referral code is required" });
  }

  try {
    const currentUser = getUserById(user.id);
    if (!currentUser) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // Already used a referral code
    if (currentUser.referred_by) {
      return res.status(409).json({ ok: false, error: "You have already used a referral code" });
    }

    // Cannot use own code
    if (currentUser.referral_code === code.trim().toUpperCase()) {
      return res.status(400).json({ ok: false, error: "You cannot use your own referral code" });
    }

    // Find the referrer
    const referrer = getUserByReferralCode(code.trim());
    if (!referrer) {
      return res.status(404).json({ ok: false, error: "Invalid referral code" });
    }

    // Set referred_by on the current user
    rawDb
      .prepare("UPDATE users SET referred_by = ?, updated_at = ? WHERE id = ?")
      .run(referrer.id, Date.now(), user.id);

    // Award coins: 500 (5X) to new user, 500 (5X) to referrer
    addCoins(user.id, REFERRAL_NEW_USER_COINS, "REFERRAL", referrer.id,
      `Referral bonus — used code ${code.trim().toUpperCase()} (+${REFERRAL_NEW_USER_COINS} coins)`);
    addCoins(referrer.id, REFERRAL_INVITER_COINS, "REFERRAL", user.id,
      `Referral reward — ${user.name ?? user.email ?? "someone"} joined with your code 🎉`);

    return res.json({ ok: true, coinsEarned: REFERRAL_NEW_USER_COINS, referrerEarned: REFERRAL_INVITER_COINS });
  } catch (err) {
    console.error("[/api/rewards/referral/claim]", err);
    return res.status(500).json({ ok: false, error: "Failed to claim referral" });
  }
});

export default router;
