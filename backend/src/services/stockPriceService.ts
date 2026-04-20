/**
 * StockPriceService
 * Fetches Indian stock prices from NSE India's official API
 * and caches results in the stock_price_cache SQLite table.
 *
 * NSE India is free, official, and works from cloud servers (Railway, etc.)
 * unlike Yahoo Finance which blocks datacenter IPs with ETIMEDOUT.
 *
 * NSE requires a cookie session: hit the homepage first, then use those
 * cookies on subsequent API calls. Session is refreshed every 25 minutes.
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

const CACHE_TTL_MS    = 15 * 60 * 1000; // 15 minutes
const NSE_BASE        = "https://www.nseindia.com";
const NSE_SESSION_TTL = 25 * 60 * 1000; // refresh cookies every 25 min
const BROWSER_UA      =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

// ─── NSE India session management ────────────────────────────────────────────

interface NseSession {
  cookies:   string;
  fetchedAt: number;
}

let _nseSession: NseSession | null = null;

/**
 * Refresh NSE cookies by hitting the homepage.
 * NSE requires a valid cookie (nsit/nseappid) on every API call.
 */
async function refreshNseSession(): Promise<string> {
  const res = await fetch(NSE_BASE, {
    headers: {
      "User-Agent":      BROWSER_UA,
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    },
    signal: AbortSignal.timeout(15_000),
  });

  // Parse all Set-Cookie headers into a single cookie string
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookieStr = raw.length
    ? raw.map((c) => c.split(";")[0]).join("; ")
    : (res.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0].trim()).join("; ");

  _nseSession = { cookies: cookieStr, fetchedAt: Date.now() };
  console.log(`[StockPriceService] NSE session refreshed (${raw.length || "?"} cookies)`);
  return cookieStr;
}

async function getNseCookies(): Promise<string> {
  if (_nseSession && Date.now() - _nseSession.fetchedAt < NSE_SESSION_TTL) {
    return _nseSession.cookies;
  }
  return refreshNseSession();
}

// ─── NSE India fetch ──────────────────────────────────────────────────────────

async function fetchFromNSE(symbol: string): Promise<StockPrice> {
  const baseSymbol = symbol.toUpperCase().replace(/\.NS$/, "");
  const cookies    = await getNseCookies();

  const url = `${NSE_BASE}/api/quote-equity?symbol=${encodeURIComponent(baseSymbol)}`;
  const res  = await fetch(url, {
    headers: {
      "User-Agent":      BROWSER_UA,
      "Accept":          "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer":         `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(baseSymbol)}`,
      "Cookie":          cookies,
    },
    signal: AbortSignal.timeout(10_000),
  });

  // If session expired, clear it and retry once with fresh cookies
  if (res.status === 401 || res.status === 403) {
    _nseSession = null;
    const freshCookies = await refreshNseSession();
    const retry = await fetch(url, {
      headers: {
        "User-Agent":      BROWSER_UA,
        "Accept":          "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer":         `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(baseSymbol)}`,
        "Cookie":          freshCookies,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!retry.ok) throw new Error(`NSE returned ${retry.status} for ${baseSymbol}`);
    return parseNseResponse(await retry.json(), baseSymbol);
  }

  if (!res.ok) throw new Error(`NSE returned ${res.status} for ${baseSymbol}`);
  return parseNseResponse(await res.json(), baseSymbol);
}

function parseNseResponse(data: any, baseSymbol: string): StockPrice {
  const price = data?.priceInfo?.lastPrice;
  if (!price) throw new Error(`No price in NSE response for ${baseSymbol}`);

  const prevClose = data.priceInfo.previousClose ?? price;
  const change    = data.priceInfo.change    ?? (price - prevClose);
  const changePct = data.priceInfo.pChange   ?? ((change / prevClose) * 100);
  const high      = data.priceInfo.intraDayHighLow?.max ?? price;
  const low       = data.priceInfo.intraDayHighLow?.min ?? price;
  const volume    = data.marketDeptOrderBook?.tradeInfo?.totalTradedVolume ?? 0;
  const name      = data.info?.companyName ?? baseSymbol;

  return {
    symbol:        baseSymbol,
    companyName:   name,
    currentPrice:  Math.round(price    * 100) / 100,
    change:        Math.round(change   * 100) / 100,
    changePercent: Math.round(changePct * 100) / 100,
    high:          Math.round(high     * 100) / 100,
    low:           Math.round(low      * 100) / 100,
    volume,
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

  // ── 2. Fetch from NSE India ───────────────────────────────────────────────
  try {
    const price = await fetchFromNSE(baseSymbol);
    upsertStockPrice(price.symbol, price.companyName, price.currentPrice, price.changePercent);
    return price;
  } catch (err) {
    console.error(`[StockPriceService] NSE fetch error for ${baseSymbol}:`, (err as Error).message);

    // ── 3. Fallback: stale cache is better than nothing ───────────────────
    const stale = getStockPrice(baseSymbol, Infinity);
    if (stale) {
      return { ...cacheToStockPrice(stale), isMarketOpen: isMarketOpen(), staleData: true };
    }

    // Last resort: zero placeholder so caller never gets a 500
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
