/**
 * IPO Predictions — API routes
 *
 * GET  /api/ipo-predictions/open           → open prediction questions
 * POST /api/ipo-predictions/:id/vote       → submit vote { answer }
 * GET  /api/ipo-predictions/history        → user's IPO prediction history
 *
 * All routes require Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser, addCoins } from "../services/coinService.ts";
import {
  IPO_PREDICTION_VOTE_COINS,
  IPO_PREDICTION_CORRECT_COINS,
} from "../services/rewardConfig.ts";
import {
  getOpenIpoPredictions,
  saveUserIpoPrediction,
} from "../../../pipeline/db.ts";
import type { IpoPrediction } from "../../../pipeline/db.ts";
import rawDb from "../../../pipeline/db.ts";

const router = Router();
router.use(requireAuth);

// ─── GET /api/ipo-predictions/open ──────────────────────────────────────────

router.get("/open", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    const predictions = getOpenIpoPredictions();

    const enriched = predictions.map((p) => {
      // Check if user already voted
      const userVote = rawDb.prepare(
        "SELECT answer, is_correct, coins_awarded FROM user_ipo_predictions WHERE user_id = ? AND ipo_prediction_id = ? LIMIT 1"
      ).get(user.id, p.id) as { answer: string; is_correct: number | null; coins_awarded: number } | undefined;

      // Community vote stats
      const voteStats = rawDb.prepare(`
        SELECT answer, COUNT(*) AS count
        FROM user_ipo_predictions
        WHERE ipo_prediction_id = ?
        GROUP BY answer
        ORDER BY count DESC
      `).all(p.id) as Array<{ answer: string; count: number }>;

      const totalVotes = voteStats.reduce((s, v) => s + v.count, 0);

      // Get IPO data for enrichment
      const ipo = rawDb.prepare(
        "SELECT price_band_low, price_band_high, gmp, lot_size, subscription_status, category FROM ipos WHERE company_name = ? LIMIT 1"
      ).get(p.ipo_name) as {
        price_band_low: number | null;
        price_band_high: number | null;
        gmp: number | null;
        lot_size: number | null;
        subscription_status: number | null;
        category: string;
      } | undefined;

      return {
        id:              p.id,
        ipoName:         p.ipo_name,
        symbol:          p.symbol,
        openDate:        p.open_date,
        listingDate:     p.listing_date,
        questionType:    p.question_type,
        priceBand:       ipo ? { low: ipo.price_band_low, high: ipo.price_band_high } : null,
        gmp:             ipo?.gmp ?? null,
        lotSize:         ipo?.lot_size ?? null,
        subscription:    ipo?.subscription_status ?? null,
        category:        ipo?.category ?? 'mainboard',
        userVote:        userVote?.answer ?? null,
        alreadyVoted:    !!userVote,
        communityStats: {
          totalVotes,
          options: voteStats.map((v) => ({
            answer:  v.answer,
            count:   v.count,
            percent: totalVotes > 0 ? Math.round((v.count / totalVotes) * 100) : 0,
          })),
        },
        voteReward:      IPO_PREDICTION_VOTE_COINS,
        correctReward:   IPO_PREDICTION_CORRECT_COINS,
      };
    });

    return res.json({ ok: true, predictions: enriched, count: enriched.length });
  } catch (err) {
    console.error("[/api/ipo-predictions/open]", err);
    return res.status(500).json({ ok: false, error: "Failed to load IPO predictions" });
  }
});

// ─── POST /api/ipo-predictions/:id/vote ─────────────────────────────────────

router.post("/:id/vote", (req, res) => {
  const user         = req.user!;
  const predictionId = Number(req.params.id);

  if (!Number.isInteger(predictionId) || predictionId < 1) {
    return res.status(400).json({ ok: false, error: "Invalid prediction id" });
  }

  const { answer } = req.body as { answer?: string };
  if (!answer || typeof answer !== "string" || !answer.trim()) {
    return res.status(400).json({ ok: false, error: "answer is required" });
  }

  ensureUser(user.id, user.name, user.email);

  try {
    // Check prediction exists and is still open
    const prediction = rawDb.prepare(
      "SELECT * FROM ipo_predictions WHERE id = ? LIMIT 1"
    ).get(predictionId) as IpoPrediction | undefined;

    if (!prediction) {
      return res.status(404).json({ ok: false, error: "IPO prediction not found" });
    }
    if (prediction.correct_answer !== null) {
      return res.status(400).json({ ok: false, error: "This prediction has already been resolved" });
    }

    // Check if already voted
    const existing = rawDb.prepare(
      "SELECT id FROM user_ipo_predictions WHERE user_id = ? AND ipo_prediction_id = ? LIMIT 1"
    ).get(user.id, predictionId);

    if (existing) {
      return res.json({ ok: true, alreadyVoted: true, coinsEarned: 0 });
    }

    // Save vote
    saveUserIpoPrediction(user.id, predictionId, answer.trim());

    // Award participation coins
    addCoins(user.id, IPO_PREDICTION_VOTE_COINS, "IPO_PREDICTION",
      String(predictionId),
      `IPO prediction vote: ${prediction.ipo_name} (+${IPO_PREDICTION_VOTE_COINS} coins)`);

    return res.json({
      ok:          true,
      alreadyVoted: false,
      coinsEarned: IPO_PREDICTION_VOTE_COINS,
    });
  } catch (err) {
    console.error("[/api/ipo-predictions/:id/vote]", err);
    return res.status(500).json({ ok: false, error: "Failed to submit vote" });
  }
});

// ─── GET /api/ipo-predictions/history ───────────────────────────────────────

router.get("/history", (req, res) => {
  const user  = req.user!;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  ensureUser(user.id, user.name, user.email);

  try {
    const rows = rawDb.prepare(`
      SELECT
        uip.ipo_prediction_id,
        ip.ipo_name,
        ip.symbol,
        ip.question_type,
        ip.listing_date,
        uip.answer          AS user_answer,
        ip.correct_answer,
        uip.is_correct,
        uip.coins_awarded,
        uip.created_at
      FROM user_ipo_predictions uip
      JOIN ipo_predictions ip ON ip.id = uip.ipo_prediction_id
      WHERE uip.user_id = ?
      ORDER BY uip.created_at DESC
      LIMIT ?
    `).all(user.id, limit) as Array<{
      ipo_prediction_id: number;
      ipo_name:          string;
      symbol:            string | null;
      question_type:     string;
      listing_date:      string | null;
      user_answer:       string;
      correct_answer:    string | null;
      is_correct:        number | null;
      coins_awarded:     number;
      created_at:        number;
    }>;

    const totalVotes   = rows.length;
    const resolved     = rows.filter((r) => r.is_correct !== null);
    const correctCount = resolved.filter((r) => r.is_correct === 1).length;
    const accuracy     = resolved.length > 0 ? Math.round((correctCount / resolved.length) * 100) : 0;

    return res.json({
      ok: true,
      totalVotes,
      correctCount,
      accuracyRate: accuracy,
      entries: rows.map((r) => ({
        ipoName:        r.ipo_name,
        symbol:         r.symbol,
        questionType:   r.question_type,
        listingDate:    r.listing_date,
        userAnswer:     r.user_answer,
        correctAnswer:  r.correct_answer,
        isCorrect:      r.is_correct === null ? null : r.is_correct === 1,
        coinsAwarded:   r.coins_awarded,
        createdAt:      r.created_at,
      })),
    });
  } catch (err) {
    console.error("[/api/ipo-predictions/history]", err);
    return res.status(500).json({ ok: false, error: "Failed to load history" });
  }
});

export default router;
