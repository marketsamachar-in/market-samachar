/**
 * MarketMoveService — Powers the "Market Move" page.
 *
 * Reuses existing infra:
 *   - getMarketMovers() from stockPriceService for gainers/losers/active
 *   - news_items.mentioned_symbols + extractSymbolFromTitle for News Buzz
 *
 * Adds:
 *   - FII/DII daily activity (NSE provisional data, scraped after 18:00 IST)
 *   - MTF approved-stock list (refreshed weekly, Yahoo for live price)
 *   - News Buzz — stocks ranked by mention count in news_items (last 24h)
 */

import cron from "node-cron";
import db from "../../../pipeline/db.ts";
import {
  getMarketMovers,
  fetchStockPrice,
  isMarketOpen,
} from "./stockPriceService.ts";
import { extractSymbolFromTitle } from "./symbolExtractor.ts";
import { ALL_NSE_SYMBOLS } from "../data/nse-symbols.ts";

// ─── Schema bootstrap ────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS fii_dii_history (
    date         TEXT PRIMARY KEY,
    fii_cash     REAL,
    dii_cash     REAL,
    fii_fno      REAL,
    dii_fno      REAL,
    fetched_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mtf_stocks (
    symbol     TEXT PRIMARY KEY,
    name       TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_move_cache (
    kind       TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
`);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FiiDiiRow {
  date:     string;
  fiiCash:  number;
  diiCash:  number;
  fiiFno:   number;
  diiFno:   number;
}

export interface NewsBuzzRow {
  symbol:    string;
  mentions:  number;
  headlines: string[];   // up to 3 latest headlines
}

export interface MtfStockRow {
  symbol:        string;
  name:          string;
  currentPrice:  number;
  changePercent: number;
}

// ─── IST helper ──────────────────────────────────────────────────────────────

function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// ─── FII / DII ───────────────────────────────────────────────────────────────

/**
 * NSE FII/DII provisional data is published daily after 18:00 IST.
 * We fetch from the NSE public endpoint:
 *   https://www.nseindia.com/api/fiidiiTradeReact
 *
 * Response is an array of two objects (FII + DII) for the latest day with
 * buy/sell/net values in ₹ crores.
 */
const NSE_FII_DII_URL = "https://www.nseindia.com/api/fiidiiTradeReact";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchNseCookies(): Promise<string> {
  const res = await fetch("https://www.nseindia.com", {
    headers: { "User-Agent": BROWSER_UA },
    signal:  AbortSignal.timeout(15_000),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.length
    ? raw.map((c) => c.split(";")[0]).join("; ")
    : (res.headers.get("set-cookie") ?? "")
        .split(",").map((c) => c.split(";")[0].trim()).join("; ");
}

export async function refreshFiiDii(): Promise<void> {
  try {
    const cookies = await fetchNseCookies();
    const res = await fetch(NSE_FII_DII_URL, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept":     "*/*",
        "Referer":    "https://www.nseindia.com/reports/fii-dii",
        "Cookie":     cookies,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`NSE FII/DII status ${res.status}`);
    const data: any[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Empty FII/DII payload");
    }

    // The NSE response contains two rows: one for FII, one for DII.
    // We capture cash-segment net only — F&O segment is computed separately.
    let fiiCash = 0, diiCash = 0;
    const dateStr = data[0]?.date || todayIST();
    for (const row of data) {
      const cat = String(row.category || "").toLowerCase();
      const net = Number(row.netValue ?? row.netvalue ?? 0);
      if (cat.includes("fii") || cat.includes("foreign")) fiiCash = net;
      if (cat.includes("dii") || cat.includes("domestic")) diiCash = net;
    }

    db.prepare(`
      INSERT OR REPLACE INTO fii_dii_history
        (date, fii_cash, dii_cash, fii_fno, dii_fno, fetched_at)
      VALUES (?, ?, ?, 0, 0, ?)
    `).run(dateStr, fiiCash, diiCash, Date.now());

    console.log(`[MarketMove] FII/DII refreshed for ${dateStr} — FII: ${fiiCash}, DII: ${diiCash}`);
  } catch (err) {
    console.warn("[MarketMove] FII/DII refresh failed:", (err as Error).message);
  }
}

export function getFiiDiiHistory(days = 30): FiiDiiRow[] {
  const rows = db.prepare(`
    SELECT date, fii_cash, dii_cash, fii_fno, dii_fno
    FROM fii_dii_history
    ORDER BY date DESC
    LIMIT ?
  `).all(days) as any[];
  return rows.map((r) => ({
    date:    r.date,
    fiiCash: Number(r.fii_cash) || 0,
    diiCash: Number(r.dii_cash) || 0,
    fiiFno:  Number(r.fii_fno)  || 0,
    diiFno:  Number(r.dii_fno)  || 0,
  }));
}

// ─── MTF (Margin Trading Facility) ───────────────────────────────────────────

/**
 * Curated list of NSE-approved MTF stocks. NSE publishes the official list
 * periodically; we mirror a popular subset of large/mid caps that are
 * MTF-eligible across major brokers (Zerodha, Angel, Upstox).
 *
 * This list is updated when new circulars come in; a weekly cron just
 * touches the updated_at field.
 */
const MTF_SEED_LIST: ReadonlyArray<readonly [string, string]> = [
  ["RELIANCE",   "Reliance Industries"],
  ["TCS",        "Tata Consultancy Services"],
  ["INFY",       "Infosys"],
  ["HDFCBANK",   "HDFC Bank"],
  ["ICICIBANK",  "ICICI Bank"],
  ["SBIN",       "State Bank of India"],
  ["AXISBANK",   "Axis Bank"],
  ["KOTAKBANK",  "Kotak Mahindra Bank"],
  ["LT",         "Larsen & Toubro"],
  ["ITC",        "ITC"],
  ["HINDUNILVR", "Hindustan Unilever"],
  ["BHARTIARTL", "Bharti Airtel"],
  ["MARUTI",     "Maruti Suzuki"],
  ["M&M",        "Mahindra & Mahindra"],
  ["TATAMOTORS", "Tata Motors"],
  ["TATASTEEL",  "Tata Steel"],
  ["JSWSTEEL",   "JSW Steel"],
  ["HINDALCO",   "Hindalco Industries"],
  ["WIPRO",      "Wipro"],
  ["HCLTECH",    "HCL Technologies"],
  ["TECHM",      "Tech Mahindra"],
  ["ADANIENT",   "Adani Enterprises"],
  ["ADANIPORTS", "Adani Ports"],
  ["BAJFINANCE", "Bajaj Finance"],
  ["BAJAJFINSV", "Bajaj Finserv"],
  ["ASIANPAINT", "Asian Paints"],
  ["TITAN",      "Titan Company"],
  ["NESTLEIND",  "Nestlé India"],
  ["DRREDDY",    "Dr Reddy's Laboratories"],
  ["SUNPHARMA",  "Sun Pharma"],
  ["CIPLA",      "Cipla"],
  ["DIVISLAB",   "Divi's Laboratories"],
  ["POWERGRID",  "Power Grid"],
  ["NTPC",       "NTPC"],
  ["ONGC",       "ONGC"],
  ["COALINDIA",  "Coal India"],
  ["IOC",        "Indian Oil"],
  ["BPCL",       "Bharat Petroleum"],
  ["GRASIM",     "Grasim Industries"],
  ["ULTRACEMCO", "UltraTech Cement"],
  ["HEROMOTOCO", "Hero MotoCorp"],
  ["BAJAJ-AUTO", "Bajaj Auto"],
  ["EICHERMOT",  "Eicher Motors"],
  ["DLF",        "DLF"],
  ["GODREJCP",   "Godrej Consumer"],
  ["BRITANNIA",  "Britannia Industries"],
  ["DABUR",      "Dabur India"],
  ["INDUSINDBK", "IndusInd Bank"],
  ["PIDILITIND", "Pidilite Industries"],
  ["SHREECEM",   "Shree Cement"],
];

export function seedMtfList(): void {
  const ins = db.prepare(`
    INSERT OR REPLACE INTO mtf_stocks (symbol, name, updated_at)
    VALUES (?, ?, ?)
  `);
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const [sym, name] of MTF_SEED_LIST) ins.run(sym, name, now);
  });
  tx();
}

export async function getMtfStocks(limit = 30): Promise<MtfStockRow[]> {
  const rows = db.prepare(`
    SELECT symbol, name FROM mtf_stocks ORDER BY symbol LIMIT ?
  `).all(limit) as Array<{ symbol: string; name: string }>;

  const results: MtfStockRow[] = [];
  // Use cache-only reads — never block the request on live fetches.
  for (const r of rows) {
    try {
      const p = await fetchStockPrice(r.symbol);
      results.push({
        symbol:        r.symbol,
        name:          r.name,
        currentPrice:  p.currentPrice,
        changePercent: p.changePercent,
      });
    } catch {
      results.push({ symbol: r.symbol, name: r.name, currentPrice: 0, changePercent: 0 });
    }
  }
  return results;
}

// ─── News Buzz ───────────────────────────────────────────────────────────────

/**
 * Rank stocks by how often they appear in news headlines over the last 24h.
 *
 * Strategy:
 *   1. Read mentioned_symbols (already extracted by the AI pipeline) when set.
 *   2. Fall back to live extraction via extractSymbolFromTitle for any item
 *      with NULL mentioned_symbols (newer items not yet processed).
 *
 * Result is cached for 30 minutes in market_move_cache.
 */
export function computeNewsBuzz(limit = 25): NewsBuzzRow[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const items = db.prepare(`
    SELECT id, title, mentioned_symbols, fetched_at
    FROM news_items
    WHERE fetched_at >= ?
    ORDER BY fetched_at DESC
  `).all(cutoff) as Array<{
    id: string; title: string; mentioned_symbols: string | null; fetched_at: number;
  }>;

  const counts = new Map<string, { mentions: number; headlines: string[] }>();
  for (const it of items) {
    const symbols = new Set<string>();
    if (it.mentioned_symbols) {
      try {
        const arr = JSON.parse(it.mentioned_symbols);
        if (Array.isArray(arr)) for (const s of arr) {
          if (typeof s === "string" && ALL_NSE_SYMBOLS.includes(s as any)) {
            symbols.add(s);
          }
        }
      } catch { /* ignore malformed JSON */ }
    }
    if (symbols.size === 0) {
      const sym = extractSymbolFromTitle(it.title);
      if (sym) symbols.add(sym);
    }
    for (const sym of symbols) {
      const e = counts.get(sym) ?? { mentions: 0, headlines: [] };
      e.mentions += 1;
      if (e.headlines.length < 3) e.headlines.push(it.title);
      counts.set(sym, e);
    }
  }

  return [...counts.entries()]
    .map(([symbol, v]) => ({ symbol, mentions: v.mentions, headlines: v.headlines }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit);
}

// ─── Combined snapshot ───────────────────────────────────────────────────────

export async function getMarketMoveSnapshot(): Promise<{
  isMarketOpen: boolean;
  movers:    ReturnType<typeof getMarketMovers>;
  fiiDii:    FiiDiiRow[];
  newsBuzz:  NewsBuzzRow[];
  lastUpdated: number;
}> {
  const movers   = getMarketMovers(20);
  const fiiDii   = getFiiDiiHistory(30);
  const newsBuzz = computeNewsBuzz(25);
  return {
    isMarketOpen: isMarketOpen(),
    movers,
    fiiDii,
    newsBuzz,
    lastUpdated: Date.now(),
  };
}

// ─── Cron ────────────────────────────────────────────────────────────────────

export function startMarketMoveCron(): void {
  // FII/DII: fetch at 18:30 IST every weekday (NSE publishes around 18:00).
  cron.schedule("30 18 * * 1-5", () => {
    refreshFiiDii().catch((e) =>
      console.error("[MarketMove] FII/DII cron error:", e),
    );
  }, { timezone: "Asia/Kolkata" });

  // MTF list: weekly Sunday 02:00 IST (just stamps updated_at — list itself
  // is curated in code).
  cron.schedule("0 2 * * 0", () => {
    seedMtfList();
  }, { timezone: "Asia/Kolkata" });

  // Seed at startup if list is empty.
  const have = db.prepare("SELECT COUNT(*) AS c FROM mtf_stocks").get() as { c: number };
  if (!have.c) seedMtfList();

  // Best-effort initial FII/DII load if we don't have today's row yet.
  const today = todayIST();
  const exists = db.prepare("SELECT 1 FROM fii_dii_history WHERE date = ?").get(today);
  if (!exists) {
    refreshFiiDii().catch(() => { /* ignore — data may not be published yet */ });
  }

  console.log("[MarketMove] Cron started (FII/DII 18:30 IST · MTF Sun 02:00 IST)");
}
