/**
 * Market Move routes — public, no auth required.
 *
 *   GET /api/market-move              → full snapshot (movers + FII/DII + buzz)
 *   GET /api/market-move/gainers      → gainers list
 *   GET /api/market-move/losers       → losers list
 *   GET /api/market-move/active       → most active list
 *   GET /api/market-move/fii-dii      → 30-day FII/DII history
 *   GET /api/market-move/mtf          → MTF stocks (live prices via cache)
 *   GET /api/market-move/news-buzz    → stocks ranked by news mentions (24h)
 */

import { Router } from "express";
import {
  getMarketMoveSnapshot,
  getFiiDiiHistory,
  getMtfStocks,
  computeNewsBuzz,
} from "../services/marketMoveService.ts";
import { getMarketMovers } from "../services/stockPriceService.ts";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const snap = await getMarketMoveSnapshot();
    res.json({ ok: true, ...snap });
  } catch (err) {
    console.error("[/api/market-move] error:", err);
    res.status(503).json({ ok: false, error: "snapshot failed" });
  }
});

router.get("/gainers", (req, res) => {
  const limit = clampLimit(req.query.limit, 20, 50);
  res.json({ ok: true, ...getMarketMovers(limit) });
});

router.get("/losers", (req, res) => {
  const limit = clampLimit(req.query.limit, 20, 50);
  res.json({ ok: true, ...getMarketMovers(limit) });
});

router.get("/active", (req, res) => {
  const limit = clampLimit(req.query.limit, 20, 50);
  res.json({ ok: true, ...getMarketMovers(limit) });
});

router.get("/fii-dii", (req, res) => {
  const days = clampLimit(req.query.days, 30, 90);
  res.json({ ok: true, history: getFiiDiiHistory(days) });
});

router.get("/mtf", async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit, 30, 100);
    const stocks = await getMtfStocks(limit);
    res.json({ ok: true, count: stocks.length, stocks });
  } catch (err) {
    console.error("[/api/market-move/mtf] error:", err);
    res.status(503).json({ ok: false, error: "MTF fetch failed" });
  }
});

router.get("/news-buzz", (req, res) => {
  const limit = clampLimit(req.query.limit, 25, 50);
  res.json({ ok: true, buzz: computeNewsBuzz(limit) });
});

function clampLimit(v: any, dflt: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Math.floor(n), max);
}

export default router;
