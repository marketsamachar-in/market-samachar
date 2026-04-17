/**
 * Paper Trading — virtual trading routes
 *
 * POST /api/trading/buy          { symbol, quantity }
 * POST /api/trading/sell         { symbol, quantity }
 * GET  /api/trading/portfolio
 * GET  /api/trading/orders       ?limit=20
 * GET  /api/trading/holdings/:symbol
 *
 * All routes require a valid Supabase Bearer JWT.
 */

import { Router } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth.ts";
import {
  buyStock,
  sellStock,
  getPortfolio,
  getOrderHistory,
  getHoldingForSymbol,
  POPULAR_SYMBOLS,
  ensureUser,
} from "../services/virtualTradingService.ts";
import { InsufficientCoinsError } from "../services/coinService.ts";
import rawDb from "../../../pipeline/db.ts";
import { getPopularStocks } from "../services/stockPriceService.ts";

const router = Router();

// ─── GET /api/trading/leaderboard (PUBLIC — must be declared before requireAuth) ─
// Top 10 traders by current portfolio value.
// "Return %" = (currentValue - 1000 starting balance) / 1000 * 100
router.get("/leaderboard", optionalAuth, (req, res) => {
  const currentUserId: string | null = req.user?.id ?? null;

  try {
    const rows = rawDb.prepare(`
      SELECT
        vp.user_id,
        u.name,
        vp.total_invested_coins,
        vp.current_value_coins,
        u.virtual_coin_balance
      FROM virtual_portfolio vp
      LEFT JOIN users u ON u.id = vp.user_id
      ORDER BY (vp.current_value_coins + u.virtual_coin_balance) DESC
      LIMIT 10
    `).all() as Array<{
      user_id:              string;
      name:                 string | null;
      total_invested_coins: number;
      current_value_coins:  number;
      virtual_coin_balance: number;
    }>;

    const prices = new Map(getPopularStocks().map((s) => [s.symbol, s.currentPrice]));

    const leaderboard = rows.map((r, i) => {
      const holdings = rawDb.prepare(
        "SELECT symbol, quantity, avg_buy_price_coins FROM virtual_holdings WHERE user_id = ?"
      ).all(r.user_id) as Array<{ symbol: string; quantity: number; avg_buy_price_coins: number }>;

      const currentValue = holdings.reduce((sum, h) => {
        const price = prices.get(h.symbol) ?? h.avg_buy_price_coins;
        return sum + Math.round(price * h.quantity);
      }, 0);

      const totalWealth    = currentValue + r.virtual_coin_balance;
      const startingWealth = 1000;
      const returnPct      = Math.round(((totalWealth - startingWealth) / startingWealth) * 10000) / 100;

      const rawName    = r.name ?? "";
      const parts      = rawName.trim().split(/\s+/);
      const displayName = parts.length >= 2
        ? `${parts[0]} ${parts[1][0]}.`
        : rawName || `Trader #${i + 1}`;

      return {
        rank:          i + 1,
        userId:        r.user_id,
        displayName,
        isCurrentUser: r.user_id === currentUserId,
        portfolioValue: currentValue,
        totalWealth,
        returnPct,
      };
    });

    let myRank: number | null = null;
    if (currentUserId) {
      const allRanks = rawDb.prepare(`
        SELECT user_id, ROW_NUMBER() OVER (
          ORDER BY (vp.current_value_coins + u.virtual_coin_balance) DESC
        ) AS rank
        FROM virtual_portfolio vp
        LEFT JOIN users u ON u.id = vp.user_id
      `).all() as Array<{ user_id: string; rank: number }>;
      myRank = allRanks.find((r) => r.user_id === currentUserId)?.rank ?? null;
    }

    return res.json({ ok: true, leaderboard, myRank });
  } catch (err) {
    console.error("[/api/trading/leaderboard]", err);
    return res.status(500).json({ ok: false, error: "Failed to load leaderboard" });
  }
});

// All remaining trading routes require auth
router.use(requireAuth);

// ─── Input validation ─────────────────────────────────────────────────────────

const ALLOWED_SYMBOLS = new Set<string>(POPULAR_SYMBOLS);
const MAX_QUANTITY    = 100;

function validateTradeInput(
  symbol:   unknown,
  quantity: unknown,
): { symbol: string; quantity: number } | { error: string } {
  if (typeof symbol !== "string" || !symbol.trim()) {
    return { error: "symbol is required" };
  }

  const sym = symbol.trim().toUpperCase().replace(/\.NS$/, "");

  if (!ALLOWED_SYMBOLS.has(sym as any)) {
    return {
      error: `${sym} is not in the allowed stock list. Allowed: ${[...ALLOWED_SYMBOLS].join(", ")}`,
    };
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    return { error: "quantity must be a positive integer" };
  }
  if (qty > MAX_QUANTITY) {
    return { error: `Maximum ${MAX_QUANTITY} shares per order` };
  }

  return { symbol: sym, quantity: qty };
}

// ─── POST /api/trading/buy ────────────────────────────────────────────────────

router.post("/buy", async (req, res) => {
  const user = req.user!;
  const validated = validateTradeInput(req.body?.symbol, req.body?.quantity);
  if ("error" in validated) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  const { symbol, quantity } = validated;

  // Ensure user row exists in local SQLite cache
  ensureUser(user.id, user.name, user.email);

  try {
    const result = await buyStock(user.id, symbol, quantity);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InsufficientCoinsError) {
      return res.status(402).json({
        ok:        false,
        error:     err.message,
        required:  err.required,
        available: err.available,
      });
    }
    console.error(`[/api/trading/buy] ${symbol}×${quantity} for ${user.id}:`, err);
    return res.status(400).json({
      ok:    false,
      error: err instanceof Error ? err.message : "Trade failed",
    });
  }
});

// ─── POST /api/trading/sell ───────────────────────────────────────────────────

router.post("/sell", async (req, res) => {
  const user = req.user!;
  const validated = validateTradeInput(req.body?.symbol, req.body?.quantity);
  if ("error" in validated) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  const { symbol, quantity } = validated;

  ensureUser(user.id, user.name, user.email);

  try {
    const result = await sellStock(user.id, symbol, quantity);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[/api/trading/sell] ${symbol}×${quantity} for ${user.id}:`, err);
    return res.status(400).json({
      ok:    false,
      error: err instanceof Error ? err.message : "Trade failed",
    });
  }
});

// ─── GET /api/trading/portfolio ───────────────────────────────────────────────

router.get("/portfolio", (req, res) => {
  const user = req.user!;
  ensureUser(user.id, user.name, user.email);

  try {
    const portfolio = getPortfolio(user.id);
    return res.json({ ok: true, portfolio });
  } catch (err) {
    console.error(`[/api/trading/portfolio] ${user.id}:`, err);
    return res.status(500).json({ ok: false, error: "Failed to load portfolio" });
  }
});

// ─── GET /api/trading/orders ──────────────────────────────────────────────────

router.get("/orders", (req, res) => {
  const user = req.user!;
  const rawLimit = Number(req.query.limit ?? 20);
  const limit    = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, 100)
    : 20;

  ensureUser(user.id, user.name, user.email);

  try {
    const orders = getOrderHistory(user.id, limit);
    return res.json({ ok: true, orders, count: orders.length });
  } catch (err) {
    console.error(`[/api/trading/orders] ${user.id}:`, err);
    return res.status(500).json({ ok: false, error: "Failed to load orders" });
  }
});

// ─── GET /api/trading/holdings/:symbol ───────────────────────────────────────

router.get("/holdings/:symbol", (req, res) => {
  const user = req.user!;
  const sym  = req.params.symbol?.trim().toUpperCase().replace(/\.NS$/, "");

  if (!sym || !ALLOWED_SYMBOLS.has(sym as any)) {
    return res.status(400).json({ ok: false, error: "Invalid or unsupported symbol" });
  }

  ensureUser(user.id, user.name, user.email);

  try {
    const holding = getHoldingForSymbol(user.id, sym);
    return res.json({ ok: true, holding });  // null if not held — that's fine
  } catch (err) {
    console.error(`[/api/trading/holdings/${sym}] ${user.id}:`, err);
    return res.status(500).json({ ok: false, error: "Failed to load holding" });
  }
});

export default router;
