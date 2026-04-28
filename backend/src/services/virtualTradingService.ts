/**
 * VirtualTradingService — core of the Paper Trading feature.
 *
 * Users trade Indian stocks using virtual coins (1 coin = ₹1).
 * All trades are paper trades; no real money changes hands.
 *
 * Coin flow:
 *   BUY  → deduct cost coins  + award 2-coin activity reward
 *   SELL → credit proceeds    + award 50-coin bonus if P&L > 5%
 */

import rawDb from "../../../pipeline/db.ts";
import {
  getHoldings,
  getOrCreatePortfolio,
  updatePortfolioValue,
} from "../../../pipeline/db.ts";
import type { VirtualHolding, VirtualOrder } from "../../../pipeline/db.ts";
import {
  fetchStockPrice,
  getPopularStocks,
  isMarketOpen,
  POPULAR_SYMBOLS,
} from "./stockPriceService.ts";
import {
  getVirtualBalance,
  ensureUser,
  addCoins,
  deductCoins,
  InsufficientCoinsError,
} from "./coinService.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuyResult {
  success:    true;
  order:      TradeOrder;
  newBalance: number;
}

export interface SellResult {
  success:    true;
  order:      TradeOrder;
  pnl:        PnlInfo;
  newBalance: number;
}

export interface TradeOrder {
  id:          number;
  symbol:      string;
  companyName: string;
  orderType:   "BUY" | "SELL";
  quantity:    number;
  price:       number;
  total:       number;       // coins spent (BUY) or received (SELL)
  executedAt:  number;
}

export interface PnlInfo {
  avgBuyPrice:   number;
  sellPrice:     number;
  pnlCoins:      number;
  pnlPercent:    number;
  bonusAwarded:  number;     // 0 or 50
}

export interface PortfolioHolding {
  symbol:        string;
  companyName:   string;
  quantity:      number;
  avgBuyPrice:   number;    // coins per share
  currentPrice:  number;    // coins per share (from cache)
  investedCoins: number;
  currentValue:  number;
  pnlCoins:      number;
  pnlPercent:    number;
  isStalePrice:  boolean;
}

export interface Portfolio {
  userId:           string;
  virtualBalance:   number;
  totalInvested:    number;
  currentValue:     number;
  totalPnlCoins:    number;
  totalPnlPercent:  number;
  holdings:         PortfolioHolding[];
}

// ─── Reward constants (from central config) ──────────────────────────────────

import {
  TRADE_ACTIVITY_COINS as ACTIVITY_REWARD_COINS,
  PROFIT_BONUS_COINS,
  PROFIT_BONUS_THRESHOLD,
} from "./rewardConfig.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHolding(userId: string, symbol: string): VirtualHolding | null {
  return (
    rawDb
      .prepare("SELECT * FROM virtual_holdings WHERE user_id = ? AND symbol = ? LIMIT 1")
      .get(userId, symbol) as VirtualHolding | undefined
  ) ?? null;
}

function insertOrder(
  userId:    string,
  symbol:    string,
  company:   string,
  type:      "BUY" | "SELL",
  qty:       number,
  price:     number,
  coinsUsed: number,   // positive = spent, negative = received
): TradeOrder {
  const now    = Date.now();
  const result = rawDb.prepare(`
    INSERT INTO virtual_orders
      (user_id, symbol, order_type, quantity, price_at_execution, coins_used, status, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'EXECUTED', ?)
  `).run(userId, symbol, type, qty, price, coinsUsed, now) as { lastInsertRowid: number | bigint };

  return {
    id:          Number(result.lastInsertRowid),
    symbol,
    companyName: company,
    orderType:   type,
    quantity:    qty,
    price:       Math.round(price * 100) / 100,
    total:       Math.abs(coinsUsed),
    executedAt:  now,
  };
}

/** Recompute portfolio totals and persist to virtual_portfolio table. */
function refreshPortfolioTotals(userId: string): void {
  const holdings = getHoldings(userId);
  const totalInvested = holdings.reduce(
    (sum, h) => sum + Math.round(h.avg_buy_price_coins * h.quantity),
    0,
  );

  // Current value: use cached price where available, fall back to avg buy price
  const popular = getPopularStocks();
  const priceMap = new Map<string, number>(popular.map((s) => [s.symbol, s.currentPrice]));

  const currentValue = holdings.reduce((sum, h) => {
    const cached = priceMap.get(h.symbol);
    // Treat 0/missing as unknown — use avg buy price so portfolio doesn't
    // collapse to zero when the price cache hasn't populated yet.
    const price  = cached && cached > 0 ? cached : h.avg_buy_price_coins;
    return sum + Math.round(price * h.quantity);
  }, 0);

  getOrCreatePortfolio(userId); // ensure row exists
  updatePortfolioValue(userId, totalInvested, currentValue);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Buy shares of a stock.
 *
 * 1. Fetch current price from StockPriceService
 * 2. Deduct coins (cost = price × qty)
 * 3. Upsert virtual_holdings (recalculates avg buy price)
 * 4. Insert virtual_orders record
 * 5. Award 2-coin activity reward
 */
export async function buyStock(
  userId:   string,
  symbol:   string,
  quantity: number,
): Promise<BuyResult> {
  if (!isMarketOpen()) {
    throw new Error("Market is closed. Trading is allowed Mon-Fri, 9:15 AM – 3:30 PM IST.");
  }

  // Fetch live price (falls back to stale cache, never throws)
  const priceData = await fetchStockPrice(symbol);
  const price     = priceData.currentPrice;
  const company   = priceData.companyName;

  if (price <= 0) {
    throw new Error(`Price unavailable for ${symbol}. Market may be closed or data is delayed. Try again later.`);
  }

  const totalCost = Math.round(price * quantity);

  // All coin + holding ops in one SQLite transaction for atomicity
  const result = rawDb.transaction((): BuyResult => {
    // ── 1. Deduct cost coins ──────────────────────────────────────────────
    const balanceAfterCost = deductCoins(
      userId, totalCost, "VIRTUAL_TRADE",
      undefined,
      `BUY ${quantity}×${symbol} @ ₹${price}`,
    );

    // ── 2. Upsert holding ─────────────────────────────────────────────────
    const existing = getHolding(userId, symbol);
    if (existing) {
      const newQty = existing.quantity + quantity;
      const newAvg = (
        (existing.avg_buy_price_coins * existing.quantity) + (price * quantity)
      ) / newQty;
      rawDb.prepare(
        "UPDATE virtual_holdings SET quantity = ?, avg_buy_price_coins = ? WHERE user_id = ? AND symbol = ?"
      ).run(newQty, newAvg, userId, symbol);
    } else {
      rawDb.prepare(`
        INSERT INTO virtual_holdings
          (user_id, symbol, company_name, quantity, avg_buy_price_coins, bought_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, symbol, company, quantity, price, Date.now());
    }

    // ── 3. Record order ───────────────────────────────────────────────────
    const order = insertOrder(userId, symbol, company, "BUY", quantity, price, totalCost);

    // ── 4. Award activity reward ──────────────────────────────────────────
    const newBalance = addCoins(
      userId, ACTIVITY_REWARD_COINS, "VIRTUAL_TRADE",
      String(order.id),
      `Trading activity reward`,
    );

    return { success: true, order, newBalance };
  })();

  // Refresh aggregate portfolio totals (outside the main txn — non-critical)
  try { refreshPortfolioTotals(userId); } catch {}

  return result;
}

/**
 * Sell shares of a stock.
 *
 * 1. Verify the user holds enough shares
 * 2. Fetch current price
 * 3. Credit proceeds coins
 * 4. Update/delete virtual_holdings
 * 5. Insert virtual_orders record
 * 6. If P&L > 5%, award 50-coin bonus
 */
export async function sellStock(
  userId:   string,
  symbol:   string,
  quantity: number,
): Promise<SellResult> {
  if (!isMarketOpen()) {
    throw new Error("Market is closed. Trading is allowed Mon-Fri, 9:15 AM – 3:30 PM IST.");
  }

  // Check holdings before the async price fetch to fail fast
  const holding = getHolding(userId, symbol);
  if (!holding) {
    throw new Error(`You don't hold any ${symbol}`);
  }
  if (holding.quantity < quantity) {
    throw new Error(
      `Insufficient shares: holding ${holding.quantity}, selling ${quantity}`,
    );
  }

  const avgBuyPrice = holding.avg_buy_price_coins;

  // Fetch live price
  const priceData = await fetchStockPrice(symbol);
  const price     = priceData.currentPrice;
  const company   = priceData.companyName;

  if (price <= 0) {
    throw new Error(`Price unavailable for ${symbol}. Market may be closed or data is delayed. Try again later.`);
  }

  const proceeds  = Math.round(price * quantity);

  // P&L calculations
  const pnlCoins   = Math.round((price - avgBuyPrice) * quantity);
  const pnlPercent = avgBuyPrice > 0
    ? Math.round(((price - avgBuyPrice) / avgBuyPrice) * 10000) / 100
    : 0;
  const isProfitable = pnlPercent >= PROFIT_BONUS_THRESHOLD * 100;

  const result = rawDb.transaction((): SellResult => {
    // ── 1. Credit proceeds ────────────────────────────────────────────────
    let newBalance = addCoins(
      userId, proceeds, "VIRTUAL_TRADE",
      undefined,
      `SELL ${quantity}×${symbol} @ ₹${price}`,
    );

    // ── 2. Update / delete holding ────────────────────────────────────────
    if (holding.quantity === quantity) {
      rawDb.prepare(
        "DELETE FROM virtual_holdings WHERE user_id = ? AND symbol = ?"
      ).run(userId, symbol);
    } else {
      rawDb.prepare(
        "UPDATE virtual_holdings SET quantity = ? WHERE user_id = ? AND symbol = ?"
      ).run(holding.quantity - quantity, userId, symbol);
    }

    // ── 3. Record order ───────────────────────────────────────────────────
    const order = insertOrder(userId, symbol, company, "SELL", quantity, price, -proceeds);

    // ── 4. Profit bonus ───────────────────────────────────────────────────
    let bonusAwarded = 0;
    if (isProfitable) {
      newBalance = addCoins(
        userId, PROFIT_BONUS_COINS, "PORTFOLIO_PROFIT",
        String(order.id),
        `Profit bonus: ${pnlPercent.toFixed(1)}% gain on ${symbol}`,
      );
      bonusAwarded = PROFIT_BONUS_COINS;
    }

    return {
      success: true,
      order,
      pnl: { avgBuyPrice, sellPrice: price, pnlCoins, pnlPercent, bonusAwarded },
      newBalance,
    };
  })();

  try { refreshPortfolioTotals(userId); } catch {}

  return result;
}

/**
 * Return the user's portfolio: aggregate summary + per-holding breakdown.
 * Prices come from the SQLite cache (synchronous, no network call).
 */
export function getPortfolio(userId: string): Portfolio {
  const holdings = getHoldings(userId);
  const balance  = getVirtualBalance(userId);

  // Build a price map from the popular-stocks cache (synchronous)
  const popular  = getPopularStocks();
  const priceMap = new Map<string, { price: number; name: string; stale: boolean }>(
    popular.map((s) => [s.symbol, {
      price: s.currentPrice,
      name:  s.companyName,
      stale: s.staleData === true,
    }]),
  );

  let totalInvested = 0;
  let currentValue  = 0;

  const enriched: PortfolioHolding[] = holdings.map((h) => {
    const cached      = priceMap.get(h.symbol);
    // Treat 0/negative as missing — when stockPriceService can't reach Yahoo
    // and has no cache, it returns currentPrice:0 (placeholder). Falling back
    // to the user's avg buy price keeps the portfolio visible after market
    // close instead of collapsing the row to zero.
    const cachedPrice = cached && cached.price > 0 ? cached.price : null;
    const curPrice    = cachedPrice ?? h.avg_buy_price_coins;
    const isStale     = cachedPrice == null || cached?.stale === true;

    const invested   = Math.round(h.avg_buy_price_coins * h.quantity);
    const value      = Math.round(curPrice * h.quantity);
    const pnlCoins   = value - invested;
    const pnlPercent = invested > 0
      ? Math.round((pnlCoins / invested) * 10000) / 100
      : 0;

    totalInvested += invested;
    currentValue  += value;

    return {
      symbol:        h.symbol,
      companyName:   cached?.name ?? h.company_name,
      quantity:      h.quantity,
      avgBuyPrice:   Math.round(h.avg_buy_price_coins * 100) / 100,
      currentPrice:  Math.round(curPrice * 100) / 100,
      investedCoins: invested,
      currentValue:  value,
      pnlCoins,
      pnlPercent,
      isStalePrice:  isStale,
    };
  });

  const totalPnlCoins   = currentValue - totalInvested;
  const totalPnlPercent = totalInvested > 0
    ? Math.round((totalPnlCoins / totalInvested) * 10000) / 100
    : 0;

  return {
    userId,
    virtualBalance:  balance,
    totalInvested,
    currentValue,
    totalPnlCoins,
    totalPnlPercent,
    holdings:        enriched,
  };
}

/**
 * Return recent orders, joining company name from holdings/price cache.
 */
export function getOrderHistory(userId: string, limit = 20): TradeOrder[] {
  const rows = rawDb.prepare(`
    SELECT * FROM virtual_orders
    WHERE user_id = ?
    ORDER BY executed_at DESC
    LIMIT ?
  `).all(userId, limit) as Array<{
    id: number;
    symbol: string;
    order_type: string;
    quantity: number;
    price_at_execution: number;
    coins_used: number;
    executed_at: number;
  }>;

  // Resolve company names from price cache (best-effort)
  const popular  = getPopularStocks();
  const nameMap  = new Map<string, string>(popular.map((s) => [s.symbol, s.companyName]));

  return rows.map((r) => ({
    id:          r.id,
    symbol:      r.symbol,
    companyName: nameMap.get(r.symbol) ?? r.symbol,
    orderType:   r.order_type as "BUY" | "SELL",
    quantity:    r.quantity,
    price:       Math.round(r.price_at_execution * 100) / 100,
    total:       Math.abs(r.coins_used),
    executedAt:  r.executed_at,
  }));
}

/**
 * Return a single holding for a specific symbol, or null.
 * Used by the /holdings/:symbol endpoint for the trade UI.
 */
export function getHoldingForSymbol(userId: string, symbol: string): PortfolioHolding | null {
  const holding = getHolding(userId, symbol);
  if (!holding) return null;

  const popular     = getPopularStocks();
  const cached      = popular.find((s) => s.symbol === symbol);
  const cachedPrice = cached && cached.currentPrice > 0 ? cached.currentPrice : null;
  const curPrice    = cachedPrice ?? holding.avg_buy_price_coins;
  const isStale     = cachedPrice == null || cached?.staleData === true;

  const invested   = Math.round(holding.avg_buy_price_coins * holding.quantity);
  const value      = Math.round(curPrice * holding.quantity);
  const pnlCoins   = value - invested;
  const pnlPercent = invested > 0
    ? Math.round((pnlCoins / invested) * 10000) / 100
    : 0;

  return {
    symbol:        holding.symbol,
    companyName:   cached?.companyName ?? holding.company_name,
    quantity:      holding.quantity,
    avgBuyPrice:   Math.round(holding.avg_buy_price_coins * 100) / 100,
    currentPrice:  Math.round(curPrice * 100) / 100,
    investedCoins: invested,
    currentValue:  value,
    pnlCoins,
    pnlPercent,
    isStalePrice:  isStale,
  };
}

// Re-export POPULAR_SYMBOLS for route-level validation
export { POPULAR_SYMBOLS, ensureUser };
