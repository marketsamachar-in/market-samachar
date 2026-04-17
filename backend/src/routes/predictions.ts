/**
 * Daily Forecast — prediction routes
 *
 * GET  /api/predictions/today           — today's questions + user state
 * POST /api/predictions/:id/vote        — submit a vote { answer }
 * GET  /api/predictions/history         — user's full prediction history
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import {
  submitPrediction,
  getTodayPredictions,
  getUserPredictionHistory,
} from "../services/predictionService.ts";
import { ensureUser } from "../services/coinService.ts";

const router = Router();

// All prediction routes require auth
router.use(requireAuth);

// ─── GET /api/predictions/today ───────────────────────────────────────────────

router.get("/today", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    const result = getTodayPredictions(user.id);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/predictions/today]", err);
    return res.status(500).json({ ok: false, error: "Failed to load predictions" });
  }
});

// ─── POST /api/predictions/:id/vote ──────────────────────────────────────────

router.post("/:id/vote", async (req, res) => {
  const user         = req.user!;
  const predictionId = Number(req.params.id);

  if (!Number.isInteger(predictionId) || predictionId < 1) {
    return res.status(400).json({ ok: false, error: "Invalid prediction id" });
  }

  const { answer } = req.body as { answer?: string };
  if (typeof answer !== "string" || !answer.trim()) {
    return res.status(400).json({ ok: false, error: "answer is required" });
  }
  const normalizedAnswer = answer.trim().toUpperCase();
  if (normalizedAnswer !== "A" && normalizedAnswer !== "B") {
    return res.status(400).json({ ok: false, error: "answer must be 'A' or 'B'" });
  }

  ensureUser(user.id, user.name, user.email);

  try {
    const result = await submitPrediction(user.id, predictionId, normalizedAnswer);
    return res.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Vote failed";
    // All expected errors (already resolved, duplicate) are 400
    return res.status(400).json({ ok: false, error: msg });
  }
});

// ─── GET /api/predictions/history ────────────────────────────────────────────

router.get("/history", (req, res) => {
  const user     = req.user!;
  const rawLimit = Number(req.query.limit ?? 30);
  const limit    = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;

  ensureUser(user.id, user.name, user.email);

  try {
    const history = getUserPredictionHistory(user.id, limit);
    return res.json({ ok: true, ...history });
  } catch (err) {
    console.error("[/api/predictions/history]", err);
    return res.status(500).json({ ok: false, error: "Failed to load history" });
  }
});

export default router;
