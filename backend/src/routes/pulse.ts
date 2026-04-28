/**
 * PULSE — Bull/Bear News Swiper API
 *
 *   GET  /api/pulse/feed              → next batch of unswiped news cards
 *   POST /api/pulse/swipe             → record a swipe + award instant +5 coins
 *   GET  /api/pulse/stats             → user's pulse stats (today, streak, accuracy)
 *
 * All routes require a valid Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser, addCoins, getVirtualBalance } from "../services/coinService.ts";
import rawDb from "../../../pipeline/db.ts";
import { extractSymbolFromTitle } from "../services/symbolExtractor.ts";
import { fetchStockPrice } from "../services/stockPriceService.ts";
import {
  PULSE_SWIPE_COINS,
  PULSE_DAILY_SWIPE_CAP,
} from "../services/rewardConfig.ts";

const router = Router();
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** IST date string "YYYY-MM-DD" */
function istDateStr(tsMs: number): string {
  return new Date(tsMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Count today's coin-paying swipes for cap enforcement (IST day). */
function countSwipesToday(userId: string): number {
  const istNowMs   = Date.now() + 5.5 * 60 * 60 * 1000;
  const istMidnight = new Date(istNowMs);
  istMidnight.setUTCHours(0, 0, 0, 0);
  const startMs    = istMidnight.getTime() - 5.5 * 60 * 60 * 1000;
  const row = rawDb.prepare(
    "SELECT COUNT(*) AS c FROM pulse_swipes WHERE user_id = ? AND swiped_at >= ?"
  ).get(userId, startMs) as { c: number };
  return row.c;
}

// ─── GET /feed ────────────────────────────────────────────────────────────────
// Returns up to 20 news cards that the user hasn't swiped yet.
// Shuffled for variety; only articles from the last 7 days.

router.get("/feed", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);

    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const rows = rawDb.prepare(`
      SELECT id, title, link, source, category, content_snippet, fetched_at
      FROM news_items
      WHERE fetched_at >= ?
        AND id NOT IN (
          SELECT article_id FROM pulse_swipes WHERE user_id = ?
        )
      ORDER BY RANDOM()
      LIMIT ?
    `).all(sevenDaysAgo, user.id, limit) as Array<{
      id: string; title: string; link: string;
      source: string; category: string;
      content_snippet: string | null; fetched_at: number;
    }>;

    // Attach extracted symbol (may be null)
    const cards = rows.map((r) => ({
      articleId:      r.id,
      title:          r.title,
      source:         r.source,
      category:       r.category,
      snippet:        r.content_snippet ?? "",
      fetchedAt:      r.fetched_at,
      symbol:         extractSymbolFromTitle(r.title),
    }));

    res.json({ ok: true, count: cards.length, cards });
  } catch (err) {
    console.error("[/api/pulse/feed] error:", err);
    res.status(500).json({ ok: false, error: "Failed to load feed" });
  }
});

// ─── POST /swipe ──────────────────────────────────────────────────────────────
// Body: { articleId, direction: "BULL" | "BEAR" }

router.post("/swipe", async (req, res) => {
  try {
    const user = req.user!;
    const { articleId, direction } = req.body as { articleId?: string; direction?: string };

    if (!articleId || typeof articleId !== "string") {
      return res.status(400).json({ ok: false, error: "articleId required" });
    }
    if (direction !== "BULL" && direction !== "BEAR") {
      return res.status(400).json({ ok: false, error: "direction must be BULL or BEAR" });
    }

    ensureUser(user.id, user.name, user.email);

    // Verify article exists + get title for symbol extraction
    const article = rawDb.prepare(
      "SELECT id, title FROM news_items WHERE id = ? LIMIT 1"
    ).get(articleId) as { id: string; title: string } | undefined;
    if (!article) {
      return res.status(404).json({ ok: false, error: "Article not found" });
    }

    const symbol = extractSymbolFromTitle(article.title);

    // Snapshot price if we have a symbol — used later for 24h resolution.
    let swipePrice: number | null = null;
    if (symbol) {
      try {
        const sp = await fetchStockPrice(symbol);
        if (sp.currentPrice > 0 && !sp.staleData) swipePrice = sp.currentPrice;
      } catch { /* non-fatal */ }
    }

    // Check daily cap BEFORE inserting (so we still record the swipe but skip coins)
    const swipesToday = countSwipesToday(user.id);
    const overCap     = swipesToday >= PULSE_DAILY_SWIPE_CAP;

    // Insert (UNIQUE on user_id+article_id prevents double-swipes)
    let inserted = false;
    try {
      rawDb.prepare(`
        INSERT INTO pulse_swipes (user_id, article_id, symbol, direction, swiped_at, swipe_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.id, articleId, symbol, direction, Date.now(), swipePrice);
      inserted = true;
    } catch (e: any) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ ok: false, error: "Already swiped this article" });
      }
      throw e;
    }

    let newBalance = getVirtualBalance(user.id);
    let coinsAwarded = 0;
    if (inserted && !overCap) {
      newBalance   = addCoins(user.id, PULSE_SWIPE_COINS, "PULSE_SWIPE", articleId, `${direction} swipe`);
      coinsAwarded = PULSE_SWIPE_COINS;
    }

    res.json({
      ok:           true,
      coinsAwarded,
      balance:      newBalance,
      symbol,
      capReached:   overCap,
      swipesToday:  swipesToday + 1,
      dailyCap:     PULSE_DAILY_SWIPE_CAP,
    });
  } catch (err) {
    console.error("[/api/pulse/swipe] error:", err);
    res.status(500).json({ ok: false, error: "Swipe failed" });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────

router.get("/stats", (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const swipesToday = countSwipesToday(user.id);

    const totals = rawDb.prepare(`
      SELECT
        COUNT(*)                                                 AS total_swipes,
        SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END)         AS correct,
        SUM(CASE WHEN was_correct IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
        COALESCE(SUM(bonus_coins), 0)                            AS bonus_total
      FROM pulse_swipes
      WHERE user_id = ?
    `).get(user.id) as { total_swipes: number; correct: number; resolved: number; bonus_total: number };

    const accuracy = totals.resolved > 0
      ? Math.round((totals.correct / totals.resolved) * 100)
      : null;

    res.json({
      ok:            true,
      swipesToday,
      dailyCap:      PULSE_DAILY_SWIPE_CAP,
      totalSwipes:   totals.total_swipes,
      resolved:      totals.resolved,
      correct:       totals.correct,
      accuracyPct:   accuracy,
      bonusTotal:    totals.bonus_total,
    });
  } catch (err) {
    console.error("[/api/pulse/stats] error:", err);
    res.status(500).json({ ok: false, error: "Failed to load stats" });
  }
});

export default router;
