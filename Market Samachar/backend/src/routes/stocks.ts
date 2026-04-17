/**
 * Stock price routes
 *
 * GET /api/stocks/popular        — all 20 popular NSE stocks from cache
 * GET /api/stocks/market-status  — { isOpen, nextOpen }
 * GET /api/stocks/:symbol        — single stock price (cache-first)
 */

import { Router } from "express";
import {
  fetchStockPrice,
  getPopularStocks,
  getAllStocks,
  searchSymbols,
  isMarketOpen,
  nextMarketOpen,
} from "../services/stockPriceService.ts";

const router = Router();

// ── GET /api/stocks/popular ───────────────────────────────────────────────────
// Returns all 20 popular stocks from the SQLite cache.
// Cached data is up to 15 minutes old; staleData flag is set if older.
router.get("/popular", (_req, res) => {
  try {
    const stocks = getPopularStocks();
    res.json({
      ok:          true,
      isMarketOpen: isMarketOpen(),
      count:       stocks.length,
      stocks,
    });
  } catch (err) {
    console.error("[/api/stocks/popular] error:", err);
    res.status(503).json({ ok: false, error: "Failed to read cache", stocks: [] });
  }
});

// ── GET /api/stocks/all ───────────────────────────────────────────────────────
// Returns ALL available stocks (Nifty 50 + Next 50 + mid/small caps).
router.get("/all", (_req, res) => {
  try {
    const stocks = getAllStocks();
    res.json({
      ok:          true,
      isMarketOpen: isMarketOpen(),
      count:       stocks.length,
      stocks,
    });
  } catch (err) {
    console.error("[/api/stocks/all] error:", err);
    res.status(503).json({ ok: false, error: "Failed to read cache", stocks: [] });
  }
});

// ── POST /api/stocks/batch-refresh ───────────────────────────────────────────
// Fetch fresh prices for a list of symbols (max 20). Used by the frontend
// to keep portfolio / watchlist / visible stocks up-to-date.
router.post("/batch-refresh", async (req, res) => {
  try {
    const symbols: string[] = req.body?.symbols;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.json({ ok: true, isMarketOpen: isMarketOpen(), stocks: [] });
    }
    // Validate & cap at 20
    const clean = symbols
      .slice(0, 20)
      .map((s: any) => String(s).trim().toUpperCase().replace(/\.NS$/, ""))
      .filter((s) => /^[A-Z0-9&-]{1,20}$/.test(s));

    if (clean.length === 0) {
      return res.json({ ok: true, isMarketOpen: isMarketOpen(), stocks: [] });
    }

    // Fetch in parallel (all 20 at once — each has its own cache check)
    const results = await Promise.all(clean.map((s) => fetchStockPrice(s)));
    res.json({
      ok: true,
      isMarketOpen: isMarketOpen(),
      count: results.length,
      stocks: results,
    });
  } catch (err) {
    console.error("[/api/stocks/batch-refresh] error:", err);
    res.status(503).json({ ok: false, error: "Batch refresh failed", stocks: [] });
  }
});

// ── GET /api/stocks/search?q=REL ─────────────────────────────────────────────
// Search available symbols by prefix or substring.
router.get("/search", (req, res) => {
  const q = (req.query.q as string ?? "").trim();
  if (!q || q.length < 1) {
    return res.json({ ok: true, symbols: [] });
  }
  const symbols = searchSymbols(q);
  res.json({ ok: true, symbols });
});

// ── GET /api/stocks/market-status ─────────────────────────────────────────────
// Simple market open/closed status check.
// Must be registered BEFORE /:symbol so it isn't swallowed by the param route.
router.get("/market-status", (_req, res) => {
  const open = isMarketOpen();
  res.json({
    ok:       true,
    isOpen:   open,
    nextOpen: open ? null : nextMarketOpen(),
  });
});

// ── GET /api/stocks/:symbol ───────────────────────────────────────────────────
// Fetch a single stock price.  Cache-first; falls back to stale cache on error.
// Never returns 500 — always responds with { ok, data } shape.
router.get("/:symbol", async (req, res) => {
  const raw = req.params.symbol?.trim().toUpperCase();

  if (!raw || !/^[A-Z0-9&-]{1,20}$/.test(raw.replace(/\.NS$/, ""))) {
    return res.status(400).json({ ok: false, error: "Invalid symbol" });
  }

  try {
    const data = await fetchStockPrice(raw);
    res.json({ ok: true, data });
  } catch (err) {
    // fetchStockPrice already catches internally and returns a placeholder,
    // so this outer catch is a safety net only.
    console.error(`[/api/stocks/${raw}] unexpected error:`, err);
    res.status(200).json({
      ok:    false,
      error: "Price data temporarily unavailable",
      data:  null,
    });
  }
});

export default router;
