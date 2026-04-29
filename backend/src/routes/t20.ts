/**
 * DALAL STREET T20 — API routes
 *
 *   GET  /api/t20/state         → daily-cap remaining, career best, top-3 board
 *   POST /api/t20/start         → start a match, returns 36 ball packs
 *   POST /api/t20/ball          → submit a tap, server scores
 *   POST /api/t20/end           → finalize match + coin payout
 *   GET  /api/t20/leaderboard   → top-N daily leaderboard
 *
 * All routes require a valid Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser } from "../services/coinService.ts";
import {
  startMatch, playBall, endMatch,
  getDailyMatchesPlayed, getCareerBest, getDailyLeaderboard,
  getISTDateString, T20Error,
} from "../services/t20Service.ts";
import {
  T20_DAILY_MATCH_CAP,
  T20_BALLS_PER_MATCH,
  T20_WICKETS_MAX,
  T20_BALL_TIMEOUT_MS,
  T20_COINS_PER_RUN,
  T20_CENTURY_BONUS,
  T20_DOUBLE_TON_BONUS,
} from "../services/rewardConfig.ts";

const router = Router();
router.use(requireAuth);

// ─── GET /state ───────────────────────────────────────────────────────────────

router.get("/state", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const date         = getISTDateString();
    const playedToday  = getDailyMatchesPlayed(user.id, date);
    const remaining    = Math.max(0, T20_DAILY_MATCH_CAP - playedToday);
    const careerBest   = getCareerBest(user.id);
    const top3         = getDailyLeaderboard(date, 3);

    res.json({
      ok: true,
      date,
      playedToday,
      dailyCap: T20_DAILY_MATCH_CAP,
      remaining,
      careerBest,
      top3,
      config: {
        ballsPerMatch: T20_BALLS_PER_MATCH,
        wicketsMax:    T20_WICKETS_MAX,
        ballTimeoutMs: T20_BALL_TIMEOUT_MS,
        coinsPerRun:   T20_COINS_PER_RUN,
        centuryBonus:  T20_CENTURY_BONUS,
        doubleTonBonus:T20_DOUBLE_TON_BONUS,
      },
    });
  } catch (e) {
    console.error("[t20] /state error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── POST /start ──────────────────────────────────────────────────────────────

router.post("/start", async (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const result = await startMatch(user.id);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof T20Error) {
      const status = e.code === "daily_cap" ? 429 : 503;
      return res.status(status).json({ ok: false, code: e.code, error: e.message });
    }
    console.error("[t20] /start error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── POST /ball ───────────────────────────────────────────────────────────────

router.post("/ball", (req, res) => {
  try {
    const user = req.user!;
    const b    = req.body ?? {};

    const matchId   = Number(b.matchId);
    const ballNo    = Number(b.ballNo);
    const userDir   = b.userDir === "UP" || b.userDir === "DOWN" ? b.userDir : null;
    const reaction  = Number(b.reactionMs);

    if (!Number.isFinite(matchId) || !Number.isFinite(ballNo) || !Number.isFinite(reaction)) {
      return res.status(400).json({ ok: false, error: "Invalid request" });
    }

    const result = playBall(user.id, matchId, ballNo, userDir, reaction);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof T20Error) {
      const status = e.code === "forbidden" ? 403 : e.code === "not_found" || e.code === "ball_not_found" ? 404 : 409;
      return res.status(status).json({ ok: false, code: e.code, error: e.message });
    }
    console.error("[t20] /ball error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── POST /end ────────────────────────────────────────────────────────────────

router.post("/end", (req, res) => {
  try {
    const user = req.user!;
    const matchId = Number(req.body?.matchId);
    if (!Number.isFinite(matchId)) {
      return res.status(400).json({ ok: false, error: "Invalid request" });
    }

    const result = endMatch(user.id, matchId);
    const date   = getISTDateString();
    const top10  = getDailyLeaderboard(date, 10);

    // Compute the user's rank for this match, if it placed today.
    const ranked = top10.findIndex((r) => r.user_id === user.id);
    res.json({
      ok: true,
      ...result,
      todayLeaderboard: top10,
      userRankToday: ranked >= 0 ? ranked + 1 : null,
    });
  } catch (e: any) {
    if (e instanceof T20Error) {
      const status = e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : 409;
      return res.status(status).json({ ok: false, code: e.code, error: e.message });
    }
    console.error("[t20] /end error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ─── GET /leaderboard ─────────────────────────────────────────────────────────

router.get("/leaderboard", (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50));
    const date  = String(req.query.date ?? getISTDateString());
    const items = getDailyLeaderboard(date, limit);
    res.json({ ok: true, date, items });
  } catch (e) {
    console.error("[t20] /leaderboard error:", e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
