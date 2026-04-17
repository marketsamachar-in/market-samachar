/**
 * News Impact Quiz — API routes
 *
 * GET  /api/news-impact/questions     → unanswered questions for user
 * POST /api/news-impact/:id/answer    → submit answer { selected: "A"|"B"|"C"|"D" }
 * GET  /api/news-impact/stats         → user's quiz stats
 *
 * All routes require Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser, addCoins } from "../services/coinService.ts";
import { NEWS_IMPACT_CORRECT_COINS } from "../services/rewardConfig.ts";
import {
  getUnansweredNewsImpactQuestions,
  saveNewsImpactAnswer,
} from "../../../pipeline/db.ts";
import type { NewsImpactQuestion } from "../../../pipeline/db.ts";
import rawDb from "../../../pipeline/db.ts";

const router = Router();
router.use(requireAuth);

// ─── GET /api/news-impact/questions ──────────────────────────────────────────

router.get("/questions", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const questions = getUnansweredNewsImpactQuestions(user.id, limit);

    // Enrich with article title for context
    const enriched = questions.map((q) => {
      const article = rawDb
        .prepare("SELECT title, category FROM news_items WHERE id = ? LIMIT 1")
        .get(q.article_id) as { title: string; category: string } | undefined;

      return {
        id:            q.id,
        articleTitle:  article?.title ?? "Market News",
        category:      article?.category ?? "indian",
        questionText:  q.question_text,
        options: {
          A: q.option_a,
          B: q.option_b,
          C: q.option_c,
          D: q.option_d,
        },
        symbol:        q.symbol,
        expiresAt:     q.expires_at,
        reward:        NEWS_IMPACT_CORRECT_COINS,
      };
    });

    return res.json({ ok: true, questions: enriched, count: enriched.length });
  } catch (err) {
    console.error("[/api/news-impact/questions]", err);
    return res.status(500).json({ ok: false, error: "Failed to load questions" });
  }
});

// ─── POST /api/news-impact/:id/answer ────────────────────────────────────────

router.post("/:id/answer", (req, res) => {
  const user       = req.user!;
  const questionId = Number(req.params.id);

  if (!Number.isInteger(questionId) || questionId < 1) {
    return res.status(400).json({ ok: false, error: "Invalid question id" });
  }

  const { selected } = req.body as { selected?: string };
  if (!selected || !["A", "B", "C", "D"].includes(selected.toUpperCase())) {
    return res.status(400).json({ ok: false, error: "selected must be A, B, C, or D" });
  }

  ensureUser(user.id, user.name, user.email);

  try {
    const answer = selected.toUpperCase() as "A" | "B" | "C" | "D";
    const isCorrect = saveNewsImpactAnswer(user.id, questionId, answer, NEWS_IMPACT_CORRECT_COINS);

    // If correct, award coins via SQLite ledger
    if (isCorrect) {
      addCoins(user.id, NEWS_IMPACT_CORRECT_COINS, "NEWS_IMPACT_CORRECT",
        String(questionId),
        `News Impact quiz correct (+${NEWS_IMPACT_CORRECT_COINS} coins)`);
    }

    // Fetch the correct answer for feedback
    const q = rawDb
      .prepare("SELECT correct_option, option_a, option_b, option_c, option_d FROM news_impact_questions WHERE id = ? LIMIT 1")
      .get(questionId) as { correct_option: string; option_a: string; option_b: string; option_c: string; option_d: string } | undefined;

    return res.json({
      ok:          true,
      isCorrect,
      selected:    answer,
      correct:     q?.correct_option ?? null,
      coinsEarned: isCorrect ? NEWS_IMPACT_CORRECT_COINS : 0,
    });
  } catch (err) {
    console.error("[/api/news-impact/:id/answer]", err);
    return res.status(500).json({ ok: false, error: "Failed to submit answer" });
  }
});

// ─── GET /api/news-impact/stats ──────────────────────────────────────────────

router.get("/stats", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    const stats = rawDb.prepare(`
      SELECT
        COUNT(*)                          AS total_answered,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
        SUM(coins_awarded)                AS total_coins
      FROM user_news_impact_answers
      WHERE user_id = ?
    `).get(user.id) as { total_answered: number; correct_count: number; total_coins: number };

    return res.json({
      ok: true,
      totalAnswered:  stats.total_answered ?? 0,
      correctCount:   stats.correct_count ?? 0,
      accuracyRate:   stats.total_answered > 0
        ? Math.round((stats.correct_count / stats.total_answered) * 100)
        : 0,
      totalCoins:     stats.total_coins ?? 0,
    });
  } catch (err) {
    console.error("[/api/news-impact/stats]", err);
    return res.status(500).json({ ok: false, error: "Failed to load stats" });
  }
});

export default router;
