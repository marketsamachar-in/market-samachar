/**
 * COMBO CARD — Daily 5-question prediction lottery API
 *
 *   GET  /api/combo/today      → today's card state + user pick (if any)
 *   POST /api/combo/submit     → submit 5 picks (before 09:30 IST cutoff)
 *   GET  /api/combo/history    → last 10 settled cards for the user
 *
 * All routes require a valid Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser } from "../services/coinService.ts";
import {
  SECTORS,
  type Direction,
  type Sector,
  type ComboPicks,
  getCard,
  getUserPick,
  getCutoffMs,
  getISTDateString,
  getUserHistory,
  submitPicks,
  SubmissionError,
} from "../services/comboCardService.ts";
import {
  COMBO_CARD_3OF5_COINS,
  COMBO_CARD_4OF5_COINS,
  COMBO_CARD_5OF5_COINS,
} from "../services/rewardConfig.ts";

const router = Router();
router.use(requireAuth);

// ─── Validation helpers ───────────────────────────────────────────────────────

const DIRECTIONS: ReadonlySet<string> = new Set(["UP", "DOWN"]);
const SECTOR_SET: ReadonlySet<string> = new Set(SECTORS);

function isDirection(v: unknown): v is Direction {
  return typeof v === "string" && DIRECTIONS.has(v);
}
function isSector(v: unknown): v is Sector {
  return typeof v === "string" && SECTOR_SET.has(v);
}

// ─── GET /today ───────────────────────────────────────────────────────────────
// Returns:
//   { ok: true,
//     date,
//     cutoffMs,           // 09:30 IST today
//     nowMs,
//     submissionOpen,     // true if before cutoff and trading day
//     reason?,            // 'cutoff_passed' | 'non_trading_day'
//     userPick?: {...},   // user's pick row if submitted
//     answers?: {...},    // settled answers (only after 15:35 IST)
//     payouts: { x3, x4, x5 },
//     sectors: SECTORS,
//   }

router.get("/today", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const date     = getISTDateString();
    const cutoffMs = getCutoffMs(date);
    const nowMs    = Date.now();

    const dow      = new Date(date + "T00:00:00.000Z").getUTCDay();
    const isWknd   = dow === 0 || dow === 6;

    const card     = getCard(date);
    const userPick = getUserPick(user.id, date);

    let submissionOpen = !isWknd && nowMs < cutoffMs && !userPick;
    let reason: string | undefined;
    if (isWknd)            reason = "non_trading_day";
    else if (userPick)     reason = "already_submitted";
    else if (nowMs >= cutoffMs) reason = "cutoff_passed";

    res.json({
      ok: true,
      date,
      cutoffMs,
      nowMs,
      submissionOpen,
      reason,
      userPick: userPick ? {
        pick_nifty:     userPick.pick_nifty,
        pick_banknifty: userPick.pick_banknifty,
        pick_usdinr:    userPick.pick_usdinr,
        pick_gold:      userPick.pick_gold,
        pick_sector:    userPick.pick_sector,
        score:          userPick.score,
        coins_awarded:  userPick.coins_awarded,
        submitted_at:   userPick.submitted_at,
        settled:        !!userPick.settled_at,
      } : null,
      answers: card?.settled_at ? {
        nifty:     card.answer_nifty,
        banknifty: card.answer_banknifty,
        usdinr:    card.answer_usdinr,
        gold:      card.answer_gold,
        sector:    card.answer_sector,
      } : null,
      payouts: {
        x3: COMBO_CARD_3OF5_COINS,
        x4: COMBO_CARD_4OF5_COINS,
        x5: COMBO_CARD_5OF5_COINS,
      },
      sectors: SECTORS,
    });
  } catch (e) {
    console.error("[combo] /today error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── POST /submit ─────────────────────────────────────────────────────────────
// Body: { pick_nifty, pick_banknifty, pick_usdinr, pick_gold, pick_sector }

router.post("/submit", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const b = req.body ?? {};
    if (
      !isDirection(b.pick_nifty)     ||
      !isDirection(b.pick_banknifty) ||
      !isDirection(b.pick_usdinr)    ||
      !isDirection(b.pick_gold)      ||
      !isSector(b.pick_sector)
    ) {
      return res.status(400).json({ ok: false, error: "Invalid picks" });
    }

    const picks: ComboPicks = {
      pick_nifty:     b.pick_nifty,
      pick_banknifty: b.pick_banknifty,
      pick_usdinr:    b.pick_usdinr,
      pick_gold:      b.pick_gold,
      pick_sector:    b.pick_sector,
    };

    const row = submitPicks(user.id, picks);
    res.json({
      ok: true,
      pick_nifty:     row.pick_nifty,
      pick_banknifty: row.pick_banknifty,
      pick_usdinr:    row.pick_usdinr,
      pick_gold:      row.pick_gold,
      pick_sector:    row.pick_sector,
      submitted_at:   row.submitted_at,
    });
  } catch (e: any) {
    if (e instanceof SubmissionError) {
      return res.status(409).json({ ok: false, code: e.code, error: e.message });
    }
    console.error("[combo] /submit error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── GET /history ─────────────────────────────────────────────────────────────

router.get("/history", (req, res) => {
  try {
    const user  = req.user!;
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 30));
    const items = getUserHistory(user.id, limit);
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[combo] /history error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
