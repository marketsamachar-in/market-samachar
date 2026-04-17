/**
 * StockPriceService
 * Fetches 15-minute-delayed Indian stock prices from Yahoo Finance
 * and caches results in the stock_price_cache SQLite table.
 */

import cron from "node-cron";
import { upsertStockPrice, getStockPrice } from "../../../pipeline/db.ts";
import {
  NIFTY_50 as NIFTY_50_SYMBOLS,
  NIFTY_NEXT_50 as NIFTY_NEXT_50_SYMBOLS,
  ALL_NSE_SYMBOLS,
  NSE_SYMBOL_COUNT,
} from "../data/nse-symbols.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockPrice {
  symbol:        string;
  companyName:   string;
  currentPrice:  number;
  change:        number;
  changePercent: number;
  high:          number;
  low:           number;
  volume:        number;
  lastUpdated:   number;
  isMarketOpen:  boolean;
  staleData?:    boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS  = 15 * 60 * 1000; // 15 minutes
const YF_BASE       = "https://query1.finance.yahoo.com/v8/finance/chart";
const YF_HEADERS    = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * All tradeable NSE stocks — imported from nse-symbols.ts.
 * Covers Nifty 50, Next 50, and all other NSE-listed stocks.
 *
 * Cron refresh strategy:
 *  - Nifty 50:     every 15 min (high priority)
 *  - Nifty Next 50: every 30 min (medium priority)
 *  - All others:    on-demand via /api/stocks/:symbol (cached in SQLite)
 */
export const POPULAR_SYMBOLS: readonly string[] = ALL_NSE_SYMBOLS;

// ─── IST helpers ─────────────────────────────────────────────────────────────

/** Convert a UTC Date to IST (UTC+5:30). */
function toIST(utc: Date): Date {
  return new Date(utc.getTime() + (5 * 60 + 30) * 60 * 1000);
}

/** Return true if the NSE/BSE is currently open (Mon–Fri, 09:15–15:30 IST). */
export function isMarketOpen(): boolean {
  const ist  = toIST(new Date());
  // Use UTC accessors because `ist` is a shifted timestamp; local accessors
  // would double-apply the server's timezone offset.
  const day  = ist.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;

  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const open  = 9 * 60 + 15;   // 09:15
  const close = 15 * 60 + 30;  // 15:30
  return mins >= open && mins <= close;
}

/**
 * Return the next market open as an ISO string (IST).
 * If it's before 09:15 on a weekday → today's open.
 * If it's after 15:30 → tomorrow's open (skip weekends).
 */
export function nextMarketOpen(): string {
  const ist  = toIST(new Date());
  const day  = ist.getUTCDay();
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const openMins = 9 * 60 + 15;

  // Candidate: today's 09:15 IST
  const candidate = new Date(ist);
  candidate.setUTCHours(9, 15, 0, 0);

  // If today is a weekday and we haven't passed open yet, return today
  if (day >= 1 && day <= 5 && mins < openMins) {
    return candidate.toISOString();
  }

  // Otherwise advance by 1 day until we hit Mon–Fri
  candidate.setUTCDate(candidate.getUTCDate() + 1);
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
}

// ─── Yahoo Finance fetch ──────────────────────────────────────────────────────

interface YFChartMeta {
  symbol:                     string;
  longName?:                  string;
  shortName?:                 string;
  regularMarketPrice:         number;
  chartPreviousClose?:        number;
  regularMarketChange?:       number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?:      number;
  regularMarketDayLow?:       number;
  regularMarketVolume?:       number;
}

async function fetchFromYahoo(nseSymbol: string): Promise<StockPrice> {
  const url = `${YF_BASE}/${encodeURIComponent(nseSymbol)}?interval=1d&range=1d`;
  const res  = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(10_000) });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status} for ${nseSymbol}`);
  }

  const json: any = await res.json();
  const meta: YFChartMeta = json?.chart?.result?.[0]?.meta;

  if (!meta || !meta.regularMarketPrice) {
    throw new Error(`No price data in Yahoo Finance response for ${nseSymbol}`);
  }

  const prev   = meta.chartPreviousClose ?? meta.regularMarketPrice;
  const change = meta.regularMarketChange        ?? (meta.regularMarketPrice - prev);
  const changePct = meta.regularMarketChangePercent ?? (change / prev) * 100;
  const baseSymbol = nseSymbol.replace(/\.NS$/, "");

  return {
    symbol:        baseSymbol,
    companyName:   meta.longName ?? meta.shortName ?? baseSymbol,
    currentPrice:  Math.round(meta.regularMarketPrice  * 100) / 100,
    change:        Math.round(change    * 100) / 100,
    changePercent: Math.round(changePct * 100) / 100,
    high:          Math.round((meta.regularMarketDayHigh  ?? meta.regularMarketPrice) * 100) / 100,
    low:           Math.round((meta.regularMarketDayLow   ?? meta.regularMarketPrice) * 100) / 100,
    volume:        meta.regularMarketVolume ?? 0,
    lastUpdated:   Date.now(),
    isMarketOpen:  isMarketOpen(),
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function cacheToStockPrice(cached: ReturnType<typeof getStockPrice>): StockPrice {
  return {
    symbol:        cached!.symbol,
    companyName:   cached!.company_name,
    currentPrice:  cached!.current_price,
    change:        (cached as any).change ?? 0,
    changePercent: cached!.change_percent,
    high:          (cached as any).high ?? cached!.current_price,
    low:           (cached as any).low  ?? cached!.current_price,
    volume:        (cached as any).volume ?? 0,
    lastUpdated:   cached!.last_updated,
    isMarketOpen:  isMarketOpen(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the current price for a single NSE symbol.
 * Returns cached data if < 15 min old, or if market is closed.
 * Falls back to stale cache on Yahoo Finance errors rather than throwing.
 */
export async function fetchStockPrice(symbol: string): Promise<StockPrice> {
  const nseSymbol = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;
  const baseSymbol = symbol.toUpperCase().replace(/\.NS$/, "");

  // ── 1. Check cache ────────────────────────────────────────────────────────
  const cached = getStockPrice(baseSymbol, CACHE_TTL_MS);

  // If market is closed, serve cache regardless of age (no new data until open)
  if (!isMarketOpen() && cached) {
    return { ...cacheToStockPrice(cached), isMarketOpen: false };
  }

  // Fresh cache hit during market hours
  if (cached) {
    return cacheToStockPrice(cached);
  }

  // ── 2. Fetch from Yahoo Finance ───────────────────────────────────────────
  try {
    const price = await fetchFromYahoo(nseSymbol);

    // Persist to SQLite cache
    upsertStockPrice(
      price.symbol,
      price.companyName,
      price.currentPrice,
      price.changePercent,
    );

    // Also store extended fields using rawDb for the extra columns we need
    // (change, high, low, volume are not in the base upsertStockPrice signature;
    //  they live only in the returned object — SQLite cache stores what it has)
    return price;
  } catch (err) {
    console.error(`[StockPriceService] fetch error for ${nseSymbol}:`, err);

    // ── 3. Fallback: stale cache is better than nothing ───────────────────
    const stale = getStockPrice(baseSymbol, Infinity);
    if (stale) {
      return { ...cacheToStockPrice(stale), isMarketOpen: isMarketOpen(), staleData: true };
    }

    // Last resort: return a zero-value placeholder so the caller never gets a 500
    return {
      symbol:        baseSymbol,
      companyName:   baseSymbol,
      currentPrice:  0,
      change:        0,
      changePercent: 0,
      high:          0,
      low:           0,
      volume:        0,
      lastUpdated:   Date.now(),
      isMarketOpen:  isMarketOpen(),
      staleData:     true,
    };
  }
}

/**
 * Fetch up to 10 symbols in parallel, each with its own cache check.
 */
export async function fetchMultipleStocks(symbols: string[]): Promise<StockPrice[]> {
  const batch = symbols.slice(0, 10);
  return Promise.all(batch.map((s) => fetchStockPrice(s)));
}

/**
 * Return Nifty 50 + Nifty Next 50 (always included, even without cache),
 * plus any other NSE stock that has been fetched at least once.
 */
export function getAllStocks(): StockPrice[] {
  const coreSymbols = [...NIFTY_50_SYMBOLS, ...NIFTY_NEXT_50_SYMBOLS];
  const coreSet = new Set(coreSymbols);
  const open = isMarketOpen();

  // Always include Nifty 50 + Next 50 (placeholder if no cache yet)
  const results: StockPrice[] = coreSymbols.map((sym) => {
    const cached = getStockPrice(sym, Infinity);
    if (!cached) {
      return {
        symbol: sym, companyName: sym, currentPrice: 0, change: 0,
        changePercent: 0, high: 0, low: 0, volume: 0, lastUpdated: 0,
        isMarketOpen: open, staleData: true,
      };
    }
    const isStale = (Date.now() - cached.last_updated) > CACHE_TTL_MS;
    return { ...cacheToStockPrice(cached), staleData: isStale || undefined };
  });

  // Add any other NSE stock that has cached data
  for (const sym of ALL_NSE_SYMBOLS) {
    if (coreSet.has(sym)) continue;
    const cached = getStockPrice(sym, Infinity);
    if (!cached) continue;
    const isStale = (Date.now() - cached.last_updated) > CACHE_TTL_MS;
    results.push({ ...cacheToStockPrice(cached), staleData: isStale || undefined });
  }

  return results;
}

/**
 * Search symbols by prefix or substring (case-insensitive).
 * Searches across all NSE symbols. Prefix matches rank first.
 */
export function searchSymbols(query: string): string[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];

  const prefixMatches: string[] = [];
  const substringMatches: string[] = [];

  for (const s of ALL_NSE_SYMBOLS) {
    if (s.startsWith(q)) prefixMatches.push(s);
    else if (s.includes(q)) substringMatches.push(s);
  }

  return [...prefixMatches, ...substringMatches].slice(0, 30);
}

/**
 * Return Nifty 50 + Next 50 stocks from the SQLite cache.
 * Prices may be stale if the background job hasn't run yet —
 * staleData: true is set for entries older than 15 min.
 */
export function getPopularStocks(): StockPrice[] {
  const coreSymbols = [...NIFTY_50_SYMBOLS, ...NIFTY_NEXT_50_SYMBOLS];
  const open = isMarketOpen();

  return coreSymbols.map((sym) => {
    const cached = getStockPrice(sym, Infinity);
    if (!cached) {
      return {
        symbol: sym, companyName: sym, currentPrice: 0, change: 0,
        changePercent: 0, high: 0, low: 0, volume: 0, lastUpdated: 0,
        isMarketOpen: open, staleData: true,
      };
    }
    const isStale = (Date.now() - cached.last_updated) > CACHE_TTL_MS;
    return { ...cacheToStockPrice(cached), staleData: isStale || undefined };
  });
}

// ─── Background refresh ───────────────────────────────────────────────────────

let _refreshRunning = false;

/** Nifty 50 stocks — refreshed every 15 min (high priority). */
const NIFTY_50 = NIFTY_50_SYMBOLS;

/**
 * Refresh stocks in batches to avoid rate limits.
 * Batch size of 10 with a 2s delay between batches.
 */
async function refreshBatch(symbols: readonly string[]): Promise<{ fresh: number; cached: number; errors: number }> {
  const BATCH_SIZE = 10;
  let fresh = 0, cached = 0, errors = 0;

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(s => fetchStockPrice(s)));

    for (const r of results) {
      if (r.status === "rejected") errors++;
      else if (r.value.staleData) errors++;
      else {
        const age = Date.now() - r.value.lastUpdated;
        age < 5000 ? fresh++ : cached++;
      }
    }

    // Pause between batches to respect rate limits
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { fresh, cached, errors };
}

/**
 * Refresh Nifty 50 stocks (high priority, every 15 min).
 */
export async function refreshPopularStocks(): Promise<void> {
  if (_refreshRunning) return;
  _refreshRunning = true;

  try {
    const { fresh, cached, errors } = await refreshBatch(NIFTY_50);
    console.log(
      `[StockPriceService] Nifty 50 refresh — fresh: ${fresh}, cache-hit: ${cached}, errors: ${errors}`,
    );
  } finally {
    _refreshRunning = false;
  }
}

/**
 * Refresh all stocks beyond Nifty 50 (lower priority, every 30 min).
 */
export async function refreshExtendedStocks(): Promise<void> {
  if (_refreshRunning) return;
  _refreshRunning = true;

  try {
    const extended = NIFTY_NEXT_50_SYMBOLS;
    const { fresh, cached, errors } = await refreshBatch(extended);
    console.log(
      `[StockPriceService] Extended stocks refresh (${extended.length}) — fresh: ${fresh}, cache-hit: ${cached}, errors: ${errors}`,
    );
  } finally {
    _refreshRunning = false;
  }
}

/**
 * Schedule the background refresh job.
 * Runs every 15 minutes, but only executes the fetch when the market is open.
 * Call once at server startup.
 */
export function startStockPriceCron(): void {
  // Nifty 50: every 15 minutes
  cron.schedule("0,15,30,45 * * * *", async () => {
    if (!isMarketOpen()) return;
    console.log("[StockPriceService] Nifty 50 refresh…");
    await refreshPopularStocks().catch((e) =>
      console.error("[StockPriceService] Nifty 50 cron error:", e),
    );
  }, { timezone: "Asia/Kolkata" });

  // Extended stocks: every 30 minutes (offset by 7 min to avoid overlap)
  cron.schedule("7,37 * * * *", async () => {
    if (!isMarketOpen()) return;
    console.log("[StockPriceService] Extended stocks refresh…");
    await refreshExtendedStocks().catch((e) =>
      console.error("[StockPriceService] extended cron error:", e),
    );
  }, { timezone: "Asia/Kolkata" });

  console.log(`[StockPriceService] Cron started — Nifty 50 (15 min) + Nifty Next 50 (30 min) | Total symbols: ${NSE_SYMBOL_COUNT}`);

  // Warm cache at startup (Nifty 50 only — extended will load on-demand)
  refreshPopularStocks().catch((e) =>
    console.error("[StockPriceService] startup refresh error:", e),
  );
}
