/**
 * Quiz Master routes
 *
 *   GET  /api/quiz-master/daily              → today's locked 5-Q set + state
 *   POST /api/quiz-master/answer             → submit one answer
 *   GET  /api/quiz-master/practice           → fetch N unseen Qs (no XP/coins)
 *   GET  /api/quiz-master/progress           → user's XP, streak, league
 *   GET  /api/quiz-master/bank/stats         → bank counters (admin + UI)
 *   POST /api/quiz-master/bank/import        → admin-only bulk import
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import {
  getOrCreateDaily,
  submitAnswer,
  pickQuestions,
  getProgress,
  getBankStats,
  importQuestions,
  QUIZ_CATEGORIES,
} from "../services/quizMasterService.ts";

const router = Router();

// ── Public-ish: bank stats so the lobby can show "X questions in bank" ──
router.get("/bank/stats", (_req, res) => {
  try {
    res.json({ ok: true, ...getBankStats(), categories: QUIZ_CATEGORIES });
  } catch (err) {
    res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

// ── Authenticated routes below ──────────────────────────────────────────────
router.use(requireAuth);

router.get("/daily", (req: any, res) => {
  try {
    const userId: string = req.user.id;
    res.json({ ok: true, ...getOrCreateDaily(userId) });
  } catch (err) {
    res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

router.post("/answer", (req: any, res) => {
  try {
    const userId: string = req.user.id;
    const { questionId, selected, mode } = req.body ?? {};
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return res.status(400).json({ ok: false, error: "questionId required" });
    }
    if (!["A", "B", "C", "D"].includes(selected)) {
      return res.status(400).json({ ok: false, error: "selected must be A/B/C/D" });
    }
    const m = mode === "practice" ? "practice" : "daily";
    const result = submitAnswer({ userId, questionId, selected, mode: m });
    res.json({ ok: true, ...result });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Already answered" || msg === "Question not found") {
      return res.status(400).json({ ok: false, error: msg });
    }
    res.status(503).json({ ok: false, error: msg });
  }
});

router.get("/practice", (req: any, res) => {
  try {
    const userId: string = req.user.id;
    const count = clampInt(req.query.count, 5, 1, 20);
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const difficulty = req.query.difficulty
      ? clampInt(req.query.difficulty, 0, 1, 5)
      : undefined;
    const qs = pickQuestions(userId, count, {
      category,
      difficulty: difficulty || undefined,
      mode: "practice",
    });
    res.json({ ok: true, questions: qs });
  } catch (err) {
    res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

router.get("/progress", (req: any, res) => {
  try {
    res.json({ ok: true, ...getProgress(req.user.id) });
  } catch (err) {
    res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

// ── Admin-only: bulk import ────────────────────────────────────────────────
// Auth boundary: any authenticated user could hit this if we left it as is —
// gate via x-admin-token header backed by ADMIN_PASSWORD env var.
router.post("/bank/import", (req, res) => {
  const token = req.header("x-admin-token") ?? "";
  const expected = process.env.ADMIN_BULK_IMPORT_TOKEN ?? "";
  if (!expected || token !== expected) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  try {
    const rows = req.body?.questions;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ ok: false, error: "body.questions must be an array" });
    }
    const result = importQuestions(rows);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

function clampInt(v: any, dflt: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export default router;
