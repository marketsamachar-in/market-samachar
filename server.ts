import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" }); // load .env.local first (dev secrets)
dotenvConfig();                        // also load .env as fallback (production)
import express from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { createServer as createViteServer } from "vite";
import path from "path";
import Parser from "rss-parser";
import { format, subMinutes } from "date-fns";
import crypto from "crypto";
import axios from "axios";
import YahooFinance from "yahoo-finance2";
import { setGlobalDispatcher, Agent } from "undici";
import { GoogleGenAI, Type } from "@google/genai";
import { geminiCall, geminiStructuredCall, getGeminiClient, getKeyStatus, hasAvailableKey } from "./backend/src/services/geminiKeyManager.ts";
import rateLimit from "express-rate-limit";
import fs from "fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
// Razorpay removed — using Instamojo
import QRCode from "qrcode";
import firebaseAdmin from "firebase-admin";

// Extend express-session with our custom fields
declare module "express-session" {
  interface SessionData {
    isAdmin?: boolean;
  }
}

// Increase max header size for fetch to handle large headers from Yahoo Finance
setGlobalDispatcher(new Agent({ maxHeaderSize: 65536 }));

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import {
  saveBatch, getBatch,
  getRecentBatches, getTodayStats,
  saveQuizForDate, getQuizForDate,
  saveLocalAttempt, getLocalAttempt,
  getQuizSession, upsertQuizSession, deleteQuizSession,
  savePrediction, getPrediction, resolvePredictionsForDate,
  savePayment, markPaymentSuccess, markPaymentFailed, getPaymentById,
  getAllPayments, updatePaymentUTR,
  addRewardLog, getRewardLogs,
  getAttemptsForDate,
  upsertIPO, getAllIPOs, getIPOById, deleteIPO, updateIPOGMP,
  updateMentionedSymbols, updateNewsPriceImpact,
  getArticlesNeedingSymbols, getArticlesForImpactCheck, getNewsById,
  upsertMysteryStock, getMysteryStockForDate,
  getArticlesNeedingAiProcessing, saveArticleAiData, getAiDataBatch,
  getArticleAiData,
  saveNewsImpactQuestion, createIpoPrediction, getOpenIpoPredictions,
} from "./pipeline/db.ts";
import { renderAdminDashboard } from "./admin/dashboard.ts";
import rawDb from "./pipeline/db.ts";
import type { NewsItem as DbNewsItem, QuizQuestion, IPORecord, AiArticleData } from "./pipeline/db.ts";
import { calculateQuizIQDelta, clampIQ, IQ_BASE, getIQTierMultiplier } from "./src/lib/iq-calculator.ts";
import cron              from "node-cron";
import stocksRouter      from "./backend/src/routes/stocks.ts";
import tradingRouter     from "./backend/src/routes/trading.ts";
import predictionsRouter from "./backend/src/routes/predictions.ts";
import rewardsRouter        from "./backend/src/routes/rewards.ts";
import newsImpactRouter     from "./backend/src/routes/newsImpact.ts";
import ipoPredictionsRouter from "./backend/src/routes/ipoPredictions.ts";
import readingRewardsRouter from "./backend/src/routes/readingRewards.ts";
import authSyncRouter       from "./backend/src/routes/authSync.ts";
import pulseRouter          from "./backend/src/routes/pulse.ts";
import chartguessrRouter    from "./backend/src/routes/chartguessr.ts";
import referralsRouter      from "./backend/src/routes/referrals.ts";
import { resolvePulseSwipes } from "./backend/src/services/pulseResolver.ts";
import { startStockPriceCron } from "./backend/src/services/stockPriceService.ts";
import { createDailyPredictions, resolvePredictions } from "./backend/src/services/predictionService.ts";
import { addCoins, ensureUser as ensureSqliteUser } from "./backend/src/services/coinService.ts";
import { requireAuth } from "./backend/src/middleware/auth.ts";
import {
  POLL_VOTE_COINS, SHARE_ARTICLE_COINS,
  POLL_VOTE_DAILY_CAP, POLL_STREAK_5_BONUS_COINS, POLL_STREAK_15_BONUS_COINS,
  SHARE_ARTICLE_DAILY_CAP, SHARE_STREAK_5_BONUS_COINS, SHARE_MULTI_PLATFORM_BONUS,
} from "./backend/src/services/rewardConfig.ts";
import {
  QUIZ_CORRECT_COINS,
  QUIZ_PERFECT_BONUS,
  QUIZ_PODIUM_PRIZES,
} from "./backend/src/services/rewardConfig.ts";

const yahooFinance = new YahooFinance();
const app = express();
const PORT = 3000;

// ── Instamojo helper ──────────────────────────────────────────────────────────
const INSTAMOJO_BASE = process.env.NODE_ENV === 'production'
  ? 'https://api.instamojo.com/api/1.1'
  : 'https://test.instamojo.com/api/1.1';

async function instamojoRequest(
  method: 'GET' | 'POST',
  path: string,
  data?: Record<string, string>,
): Promise<any> {
  const apiKey   = process.env.INSTAMOJO_API_KEY;
  const authToken = process.env.INSTAMOJO_AUTH_TOKEN;
  if (!apiKey || !authToken) throw new Error('Instamojo credentials not configured');

  const res = await axios({
    method,
    url: `${INSTAMOJO_BASE}${path}`,
    headers: {
      'X-Api-Key':    apiKey,
      'X-Auth-Token': authToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: data ? new URLSearchParams(data).toString() : undefined,
  });
  return res.data;
}

// ── RSS snippet cleaner ───────────────────────────────────────────────────────
// Strip HTML, raw URLs, and HTML entities from RSS contentSnippet fields, and
// reject anything too short or that's just a domain stub. Applied before
// inserting items into the news_items SQLite table.
function cleanSnippet(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/<[^>]*>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 40) return '';
  if (/^[A-Z0-9\-.]+\.[A-Z]{2,4}$/i.test(cleaned)) return '';
  return cleaned;
}

// ── Server-side Supabase client (service role — NEVER expose to frontend) ─────
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// ── Firebase Admin SDK (FCM push notifications) ───────────────────────────────
let _fcmReady = false;
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (!firebaseAdmin.apps.length) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
    }
    _fcmReady = true;
    console.log('[startup] Firebase Admin: ✅ loaded');
  } else {
    console.log('[startup] Firebase Admin: ⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
  }
} catch (err) {
  console.warn('[startup] Firebase Admin init failed:', (err as Error).message);
}

/**
 * Send a push notification to one or more FCM tokens.
 * Silently ignores invalid/expired tokens.
 */
async function sendFcmNotification(
  tokens: string[],
  title: string,
  body: string,
  link: string = '/',
): Promise<void> {
  if (!_fcmReady || tokens.length === 0) return;
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

    for (const chunk of chunks) {
      await firebaseAdmin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        webpush: {
          notification: { icon: '/ms-icon-192.svg', badge: '/ms-favicon.svg' },
          fcmOptions:   { link },
        },
      });
    }
  } catch (err) {
    console.error('[fcm] sendFcmNotification error:', (err as Error).message);
  }
}

/** Fetch all FCM tokens for users who match a Supabase filter. */
async function getFcmTokens(filter?: { column: string; value: string | number | boolean }): Promise<string[]> {
  if (!supabaseAdmin) return [];
  let q = supabaseAdmin.from('profiles').select('fcm_token').not('fcm_token', 'is', null);
  if (filter) q = (q as any).eq(filter.column, filter.value);
  const { data } = await q;
  return (data ?? []).map((r: any) => r.fcm_token as string).filter(Boolean);
}

// Startup diagnostics — quiet in production, verbose in dev
const _geminiKeys = process.env.GEMINI_API_KEYS;
const _geminiKey = process.env.GEMINI_API_KEY;
if (process.env.NODE_ENV !== "production") {
  console.log(`[startup] GEMINI_API_KEY(S): ${(_geminiKeys || _geminiKey) ? "✅ loaded" : "❌ NOT SET — translation and summarization will not work"}`);
  console.log(`[startup] FINNHUB_API_KEY:   ${process.env.FINNHUB_API_KEY   ? "✅ loaded" : "❌ NOT SET"}`);
  console.log(`[startup] NEWSAPI_API_KEY:   ${process.env.NEWSAPI_API_KEY   ? "✅ loaded" : "❌ NOT SET"}`);
  console.log(`[startup] MARKETAUX_API_KEY: ${process.env.MARKETAUX_API_KEY ? "✅ loaded" : "❌ NOT SET"}`);
  console.log(`[startup] SESSION_SECRET:    ${process.env.SESSION_SECRET    ? "✅ loaded" : "⚠️  NOT SET — using insecure fallback"}`);
  console.log(`[startup] ADMIN_PASSWORD:    ${process.env.ADMIN_PASSWORD    ? "✅ loaded" : "⚠️  NOT SET — visit /admin/setup to create one"}`);
} else {
  // In production, only warn about critical missing secrets.
  if (!_geminiKeys && !_geminiKey) console.warn("[startup] GEMINI_API_KEY(S) not set — AI features disabled");
  if (!process.env.SESSION_SECRET) console.warn("[startup] SESSION_SECRET not set — sessions insecure");
  if (!process.env.ADMIN_PASSWORD) console.warn("[startup] ADMIN_PASSWORD not set — /admin/setup available on loopback only");
}

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "application/rss+xml, application/rdf+xml;q=0.8, application/atom+xml;q=0.6, application/xml;q=0.4, text/xml;q=0.4"
  }
});

const LANG_MAP: Record<string, string> = {
  'en': 'English',
  'hi': 'Hindi',
  'mr': 'Marathi',
  'ta': 'Tamil',
  'te': 'Telugu',
  'bn': 'Bengali',
  'kn': 'Kannada'
};

type Category = 'all' | 'companies' | 'indian' | 'global' | 'commodity' | 'crypto' | 'ipo' | 'economy' | 'banking';

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: Category;
  contentSnippet?: string;
  content?: string;
}

// RSS Feeds
const FEEDS = [
  // Indian Market
  { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", category: "indian" },
  { url: "https://www.moneycontrol.com/rss/latestnews.xml", category: "indian" },
  { url: "https://www.livemint.com/rss/markets", category: "indian" },
  { url: "https://www.business-standard.com/rss/markets-106.rss", category: "indian" },
  { url: "https://www.financialexpress.com/market/rss/", category: "indian" },
  { url: "https://www.zeebiz.com/latest.xml/feed", category: "indian" },
  { url: "https://feeds.feedburner.com/ndtvprofit-latest", category: "indian" },
  { url: "https://www.thehindu.com/business/markets/feeder/default.rss", category: "indian" },
  // Companies
  { url: "https://www.moneycontrol.com/rss/business.xml", category: "companies" },
  { url: "https://economictimes.indiatimes.com/news/company/rssfeeds/2146842.cms", category: "companies" },
  { url: "https://www.financialexpress.com/companies/rss/", category: "companies" },
  { url: "https://www.thehindu.com/business/companies/feeder/default.rss", category: "companies" },
  // Global
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", category: "global" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "global" },
  { url: "https://rss.app/feeds/ttHL5BGRQH7OArRM.xml", category: "global" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147", category: "global" },
  { url: "https://www.ft.com/rss/home", category: "global" },
  // Commodity
  { url: "https://www.moneycontrol.com/rss/commodities.xml", category: "commodity" },
  { url: "https://economictimes.indiatimes.com/markets/commodities/rssfeeds/119053.cms", category: "commodity" },
  { url: "https://commoditynews.in/feed/", category: "commodity" },
  { url: "https://www.financialexpress.com/market/commodities/rss/", category: "commodity" },
  // Crypto
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "crypto" },
  { url: "https://cointelegraph.com/rss", category: "crypto" },
  { url: "https://decrypt.co/feed", category: "crypto" },
  // IPO
  { url: "https://www.chittorgarh.com/rss/ipo_news_rss.asp", category: "ipo" },
  // Economy
  // Banking
  { url: "https://www.financialexpress.com/money/rss/", category: "banking" },
  { url: "https://economictimes.indiatimes.com/industry/banking/finance/rssfeeds/13358270.cms", category: "banking" },
];

const REGULATORY_FEEDS = [
  { url: "https://www.sebi.gov.in/rss/pressreleases.xml",        category: "sebi" },
  { url: "https://www.rbi.org.in/Scripts/RSSFeed.aspx?Id=3",     category: "rbi"  },
];

let regulatoryCache: { data: any[]; fetchedAt: number } | null = null;

let newsCache: NewsItem[] = [];
let lastFetchTime = 0;
let isFetching = false;

// ── Market Data ───────────────────────────────────────────────────────────────

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number | null;
  low: number | null;
}

const MARKET_SYMBOLS = ['^NSEI', '^BSESN', '^NSEBANK', 'GC=F', 'CL=F', 'USDINR=X', '^CNXIT'];

const SYMBOL_NAMES: Record<string, string> = {
  '^NSEI':    'NIFTY 50',
  '^BSESN':   'SENSEX',
  '^NSEBANK': 'BANK NIFTY',
  'GC=F':     'GOLD',
  'CL=F':     'CRUDE OIL',
  'USDINR=X': 'USD/INR',
  '^CNXIT':   'NIFTY IT',
};

let marketCache: { data: MarketQuote[]; fetchedAt: number } | null = null;

function isMarketHours(): boolean {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const t = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return t >= 9 * 60 + 15 && t <= 15 * 60 + 30;
}

const CACHE_FILE = "news-cache.json";

// Load persisted cache on startup
try {
  if (fs.existsSync(CACHE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    newsCache = saved.newsCache || [];
    lastFetchTime = saved.lastFetchTime || 0;
    console.log(`[${new Date().toISOString()}] Loaded ${newsCache.length} items from ${CACHE_FILE}`);
  }
} catch (err) {
  console.error("Failed to load news cache from disk:", err);
}

// Seed newsCache from SQLite if still empty (handles Railway restarts where news-cache.json is gone)
if (newsCache.length === 0) {
  try {
    const rows = rawDb.prepare(`
      SELECT id, title, link, pub_date, source, category, content_snippet
      FROM news_items
      ORDER BY fetched_at DESC
      LIMIT 500
    `).all() as Array<{
      id: string; title: string; link: string; pub_date: string;
      source: string; category: string; content_snippet: string | null;
    }>;

    newsCache = rows.map(row => ({
      id:             row.id,
      title:          row.title,
      link:           row.link,
      pubDate:        row.pub_date,
      source:         row.source,
      category:       row.category as Category,
      contentSnippet: row.content_snippet ?? undefined,
    }));

    if (newsCache.length > 0) {
      console.log(`[startup] Seeded newsCache with ${newsCache.length} articles from SQLite (news-cache.json was missing)`);
    }
  } catch (err) {
    console.error("[startup] Failed to seed newsCache from SQLite:", err);
  }
}

// Helper to generate a unique ID based on title to deduplicate
function generateId(title: string): string {
  return crypto.createHash("md5").update(title.trim().toLowerCase()).digest("hex");
}

async function fetchNews() {
  if (isFetching) return;
  isFetching = true;
  console.log(`[${new Date().toISOString()}] Fetching news from RSS feeds and APIs...`);

  try {
    const newItems: NewsItem[] = [];
    const fetchPromises: Promise<void>[] = [];

    // 1. Fetch from RSS Feeds
    for (const feedObj of FEEDS) {
      fetchPromises.push((async () => {
        try {
          const response = await fetch(feedObj.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              "Accept": "application/rss+xml, application/rdf+xml;q=0.8, application/atom+xml;q=0.6, application/xml;q=0.4, text/xml;q=0.4"
            },
            signal: AbortSignal.timeout(10000)
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const xml = await response.text();
          const feed = await parser.parseString(xml);
          const source = feed.title || new URL(feedObj.url).hostname;

          feed.items.forEach((item) => {
            if (item.title && item.link) {
              newItems.push({
                id: generateId(item.title),
                title: item.title,
                link: item.link,
                pubDate: item.pubDate || new Date().toISOString(),
                source: source,
                category: feedObj.category as Category,
                contentSnippet: item.contentSnippet,
                content: item.content || item['content:encoded'],
              });
            }
          });
        } catch (err: any) {
          console.warn(`[rss] skipped ${feedObj.url}: ${err?.message ?? err}`);
        }
      })());
    }

    // 2. Fetch from Yahoo Finance (No API Key Required)
    fetchPromises.push((async () => {
      const symbols: { symbol: string; category: Category }[] = [
        { symbol: '^BSESN',   category: 'indian' },
        { symbol: '^NSEI',    category: 'indian' },
        { symbol: '^NSEBANK', category: 'banking' },
        { symbol: 'GC=F',     category: 'commodity' },
        { symbol: 'CL=F',     category: 'commodity' },
        { symbol: 'USDINR=X', category: 'economy' },
      ];

      const results = await Promise.allSettled(
        symbols.map(({ symbol }) => yahooFinance.search(symbol))
      );

      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(`Yahoo Finance error for ${symbols[i].symbol}:`, result.reason);
          return;
        }
        const news = (result.value as any).news;
        if (!news) return;
        news.forEach((n: any) => {
          if (n.title && n.link) {
            newItems.push({
              id: generateId(n.title),
              title: n.title,
              link: n.link,
              pubDate: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : new Date().toISOString(),
              source: n.publisher || 'Yahoo Finance',
              category: symbols[i].category,
              contentSnippet: n.summary || '',
            });
          }
        });
      });
    })());

    // 3. Fetch from Finnhub (If API Key is provided)
    if (process.env.FINNHUB_API_KEY) {
      fetchPromises.push((async () => {
        try {
          const res = await axios.get(`https://finnhub.io/api/v1/news?category=general&token=${process.env.FINNHUB_API_KEY}`);
          res.data.slice(0, 20).forEach((n: any) => {
            if (n.headline && n.url) {
              newItems.push({
                id: generateId(n.headline),
                title: n.headline,
                link: n.url,
                pubDate: new Date(n.datetime * 1000).toISOString(),
                source: n.source || 'Finnhub',
                category: 'global',
                contentSnippet: n.summary
              });
            }
          });
        } catch (e) {
          console.error('Finnhub error:', e);
        }
      })());
    }

    // 4. Fetch from MarketAux (If API Key is provided)
    if (process.env.MARKETAUX_API_KEY) {
      fetchPromises.push((async () => {
        try {
          const res = await axios.get(`https://api.marketaux.com/v1/news/all?language=en&api_token=${process.env.MARKETAUX_API_KEY}`);
          res.data.data.forEach((n: any) => {
            if (n.title && n.url) {
              newItems.push({
                id: generateId(n.title),
                title: n.title,
                link: n.url,
                pubDate: n.published_at,
                source: n.source || 'MarketAux',
                category: 'global',
                contentSnippet: n.snippet
              });
            }
          });
        } catch (e) {
          console.error('MarketAux error:', e);
        }
      })());
    }

    // 5. Fetch from NewsAPI (If API Key is provided)
    if (process.env.NEWSAPI_API_KEY) {
      fetchPromises.push((async () => {
        try {
          const res = await axios.get(`https://newsapi.org/v2/top-headlines?category=business&language=en&apiKey=${process.env.NEWSAPI_API_KEY}`);
          res.data.articles.forEach((n: any) => {
            if (n.title && n.url) {
              newItems.push({
                id: generateId(n.title),
                title: n.title,
                link: n.url,
                pubDate: n.publishedAt,
                source: n.source?.name || 'NewsAPI',
                category: 'global',
                contentSnippet: n.description,
                content: n.content
              });
            }
          });
        } catch (e) {
          console.error('NewsAPI error:', e);
        }
      })());
    }

    // Wait for all fetches to complete
    await Promise.allSettled(fetchPromises);

    // Deduplicate new items
    const allUniqueItems = Array.from(new Map(newItems.map((item) => [item.id, item])).values());

    // Filter: keep articles from the last 3 days (IST) — prevents ancient backlog but keeps yesterday's news
    const nowIST = Date.now() + 5.5 * 60 * 60 * 1000;
    const threeDaysAgoMs = nowIST - 3 * 24 * 60 * 60 * 1000;
    const uniqueNewItems = allUniqueItems.filter(item => {
      try {
        const articleMs = new Date(item.pubDate).getTime() + 5.5 * 60 * 60 * 1000;
        return articleMs >= threeDaysAgoMs;
      } catch { return true; } // keep if date can't be parsed
    });
    if (allUniqueItems.length !== uniqueNewItems.length) {
      console.log(`[fetch] Filtered out ${allUniqueItems.length - uniqueNewItems.length} articles older than 3 days`);
    }

    // Merge with existing cache and deduplicate again
    const merged = [...uniqueNewItems, ...newsCache];
    const uniqueMerged = Array.from(new Map(merged.map((item) => [item.id, item])).values());

    // Sort by pubDate descending
    uniqueMerged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // Keep only the latest 500 items
    newsCache = uniqueMerged.slice(0, 500);
    lastFetchTime = Date.now();
    console.log(`[${new Date().toISOString()}] Successfully fetched and updated news cache. Total items: ${newsCache.length}`);

    // Persist cache to disk
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ newsCache, lastFetchTime }));
    } catch (err) {
      console.error("Failed to persist news cache to disk:", err);
    }

    // ── Content pipeline ──────────────────────────────────────────────────────
    try {
      const batchId = `batch_${Date.now()}`;

      // Map server NewsItem (camelCase) → db NewsItem (snake_case)
      const dbItems: DbNewsItem[] = uniqueNewItems.map((item) => ({
        id:              item.id,
        title:           item.title,
        link:            item.link,
        pub_date:        item.pubDate,
        source:          item.source,
        category:        item.category,
        content_snippet: cleanSnippet(item.contentSnippet),
      }));

      const newCount = saveBatch(batchId, dbItems);

      // Kick off symbol extraction for articles that don't have it yet (non-blocking)
      setTimeout(() => extractPendingSymbols().catch(e => console.error('[impact] post-fetch symbols:', e)), 2000);

      // INLINE AI processing DISABLED — Gemini is now called on-demand only
      // summaries for articles no user reads, which was driving runaway costs.

      // ── Breaking news push notification ────────────────────────────────────
      // Detect headlines that start with "BREAKING" or contain "BREAKING NEWS"
      const BREAKING_RE = /^BREAKING[:\s]|BREAKING NEWS/i;
      const breakingItems = uniqueNewItems.filter((item) => BREAKING_RE.test(item.title));
      if (breakingItems.length > 0) {
        const headline = breakingItems[0].title.replace(BREAKING_RE, '').trim();
        getFcmTokens()
          .then((tokens) => sendFcmNotification(tokens, '🚨 Breaking News', headline, '/'))
          .catch((e) => console.error('[fcm] breaking news push:', e));
      }

      if (newCount > 0) {
        console.log(`[fetchNews] ${newCount} new items saved for batch ${batchId}`);
      }
    } catch (pipelineErr) {
      console.error("[fetchNews] Unexpected error:", pipelineErr);
    }
    // ─────────────────────────────────────────────────────────────────────────

  } catch (error) {
    console.error("Error in fetchNews:", error);
  } finally {
    isFetching = false;
  }
}

// Smart interval logic
function checkAndFetch() {
  const now = new Date();
  
  // Convert to IST (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const timeInMinutes = hours * 60 + minutes;

  let requiredIntervalMinutes = 60; // default 1 hour

  if (timeInMinutes >= 9 * 60 + 15 && timeInMinutes <= 15 * 60 + 30) {
    // Market Hours: 9:15 AM to 3:30 PM
    requiredIntervalMinutes = 30;
  } else if (timeInMinutes >= 6 * 60 && timeInMinutes <= 20 * 60) {
    // Daytime: 6:00 AM to 8:00 PM (excluding market hours handled above)
    requiredIntervalMinutes = 60;
  } else {
    // Nighttime: 8:00 PM to 6:00 AM
    requiredIntervalMinutes = 5 * 60;
  }

  const timeSinceLastFetchMinutes = (Date.now() - lastFetchTime) / (1000 * 60);

  if (timeSinceLastFetchMinutes >= requiredIntervalMinutes || lastFetchTime === 0) {
    fetchNews();
  }
}

// Initial fetch
checkAndFetch();

// Check every minute if we need to fetch
setInterval(checkAndFetch, 60 * 1000);

// ─── Article AI Pre-processing ────────────────────────────────────────────────

// ─── Weekly AI Report Scheduler ───────────────────────────────────────────────

let weeklyReportLastRun = '';   // YYYY-MM-DD of last Sunday we generated

/** ISO week number helper */
function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Generate or refresh weekly reports for all active Pro users. */
async function generateWeeklyReports(sundayDateIST: string) {
  if (!supabaseAdmin) return;
  if (!hasAvailableKey()) { console.warn('[weekly-report] No Gemini keys available — skipping'); return; }

  console.log(`[weekly-report] Generating reports for week ending ${sundayDateIST}…`);

  // Week boundaries: Monday → Sunday (in IST dates)
  const sunday    = new Date(sundayDateIST + 'T00:00:00Z');
  const monday    = new Date(sunday.getTime() - 6 * 86_400_000);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd   = sundayDateIST;
  const weekTag   = `${sunday.getUTCFullYear()}-W${String(getISOWeek(sunday)).padStart(2, '0')}`;

  // Fetch all active Pro users
  const { data: proUsers } = await supabaseAdmin
    .from('profiles')
    .select('id, name, investor_iq, streak_count')
    .eq('is_pro', true)
    .gt('pro_expires_at', new Date().toISOString());

  if (!proUsers?.length) { console.log('[weekly-report] No active Pro users.'); return; }

  let generated = 0;

  for (const user of proUsers) {
    try {
      const reportId = `${weekTag}-${user.id.slice(0, 8)}`;

      // Skip if already generated
      const { data: exists } = await supabaseAdmin
        .from('weekly_reports').select('id').eq('id', reportId).maybeSingle();
      if (exists) continue;

      // Fetch this week's quiz attempts
      const { data: attempts } = await supabaseAdmin
        .from('quiz_attempts')
        .select('date, score, time_taken_secs, answers_json')
        .eq('user_id', user.id)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date', { ascending: true });

      if (!attempts?.length) continue;  // No activity this week — skip

      // ── Compute stats ──────────────────────────────────────────────────────
      const scores       = attempts.map(a => a.score as number);
      const totalCorrect = scores.reduce((s, x) => s + x, 0);
      const totalQs      = scores.length * 5;
      const accuracyPct  = Math.round((totalCorrect / totalQs) * 100 * 100) / 100;

      // Category analysis from answers_json
      const catStats: Record<string, { correct: number; total: number }> = {};
      for (const attempt of attempts) {
        const answers: any[] = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
        for (const a of answers) {
          const cat = a.category ?? 'general';
          if (!catStats[cat]) catStats[cat] = { correct: 0, total: 0 };
          catStats[cat].total++;
          if (a.correct) catStats[cat].correct++;
        }
      }
      const catEntries  = Object.entries(catStats).filter(([, s]) => s.total >= 2);
      const strongCats  = catEntries.filter(([, s]) => s.correct / s.total >= 0.7).map(([c]) => c);
      const weakCats    = catEntries.filter(([, s]) => s.correct / s.total < 0.5).map(([c]) => c);

      // IQ change: approximate from current IQ minus estimated delta
      const iqEnd = user.investor_iq ?? 300;
      const totalDelta = scores.reduce((sum, score) => {
        const delta = score * 15 - (5 - score) * 5;
        return sum + delta;
      }, 0);
      const iqStart = Math.max(100, iqEnd - totalDelta);

      // Weekly rank (by total score among all users this week)
      const { count: rankCount } = await supabaseAdmin
        .from('quiz_attempts')
        .select('user_id', { count: 'exact', head: true })
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .gt('score', totalCorrect / scores.length);    // rough: users with higher avg
      const rankWeekly = (rankCount ?? 0) + 1;

      // ── Gemini prompt ──────────────────────────────────────────────────────
      const prompt =
        `User ${user.name ?? 'Anonymous'} took ${scores.length} quiz${scores.length > 1 ? 'zes' : ''} this week on Market Samachar's Market Quiz.\n` +
        `Scores: ${scores.join(', ')} out of 5.\n` +
        `Strong categories: ${strongCats.length ? strongCats.join(', ') : 'none identified'}.\n` +
        `Weak categories: ${weakCats.length ? weakCats.join(', ') : 'none identified'}.\n` +
        `Investor IQ change this week: ${iqStart} → ${iqEnd} (${iqEnd >= iqStart ? '+' : ''}${iqEnd - iqStart} points).\n\n` +
        `Write a short, encouraging, personalized 2-paragraph market knowledge performance review.\n` +
        `Include 1 specific tip to improve weak areas.\n` +
        `End with what to focus on next week.\n` +
        `Tone: Like a friendly market mentor. Max 150 words. No bullet points. Plain paragraphs only.`;

      const aiReport = (await geminiCall(prompt)).trim() || 'Great work this week! Keep building your market knowledge every day.';

      // ── Save report ────────────────────────────────────────────────────────
      await supabaseAdmin.from('weekly_reports').insert({
        id:               reportId,
        user_id:          user.id,
        week_start:       weekStart,
        week_end:         weekEnd,
        quizzes_taken:    scores.length,
        quizzes_possible: 7,
        scores_json:      JSON.stringify(scores),
        accuracy_pct:     accuracyPct,
        iq_start:         iqStart,
        iq_end:           iqEnd,
        rank_weekly:      rankWeekly,
        strong_cats:      JSON.stringify(strongCats),
        weak_cats:        JSON.stringify(weakCats),
        ai_report:        aiReport,
        is_read:          false,
      });

      generated++;
      // Throttle to avoid Gemini rate limits
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.error(`[weekly-report] Error for user ${user.id}:`, err);
    }
  }

  console.log(`[weekly-report] Done — ${generated} report(s) generated for ${sundayDateIST}.`);
}

/** Runs once per minute; generates weekly reports only on Sunday 20:xx IST */
function checkWeeklyReport() {
  const ist     = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day     = ist.getUTCDay();      // 0 = Sunday
  const hour    = ist.getUTCHours();
  const today   = ist.toISOString().slice(0, 10);

  if (day !== 0 || hour !== 20) return;
  if (weeklyReportLastRun === today) return;

  weeklyReportLastRun = today;
  generateWeeklyReports(today).catch(e => console.error('[weekly-report] Fatal:', e));
}

// Piggyback on the existing per-minute ticker
const _origInterval = setInterval; // already set above; add weekly check separately
setInterval(checkWeeklyReport, 60 * 1000);

// ─── News Impact Tracker ──────────────────────────────────────────────────────

/**
 * Call Gemini to extract NSE stock ticker symbols from a news headline.
 * Returns an array like ["RELIANCE", "TCS"] — empty if no stocks mentioned.
 */
async function extractSymbolsFromHeadline(title: string): Promise<string[]> {
  if (!hasAvailableKey()) return [];
  try {
    const raw = await geminiCall([{
      role: 'user',
      parts: [{ text: `Extract NSE stock ticker symbols (e.g. RELIANCE, TCS, INFY) from this Indian financial news headline. Return ONLY a JSON array of uppercase symbols. Do NOT include index names like NIFTY, SENSEX, or BANKNIFTY. If no specific company stocks are mentioned, return [].

Headline: ${title}` }],
    }]);
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.filter((s: any) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Background job: pick up articles whose symbols haven't been extracted yet,
 * call Gemini for each, and save results.  Processes up to 20 per call.
 */
async function extractPendingSymbols(): Promise<void> {
  const articles = getArticlesNeedingSymbols();
  for (const article of articles) {
    try {
      const symbols = await extractSymbolsFromHeadline(article.title);
      updateMentionedSymbols(article.id, symbols);
    } catch (e) {
      console.error('[impact] symbol extraction failed for', article.id, e);
    }
    // Small delay to avoid Gemini rate-limit
    await new Promise(r => setTimeout(r, 300));
  }
}

/**
 * Fetch the closing price of an NSE-listed stock on a given date using Yahoo Finance.
 * Falls back to a range ±1 day around `date` to handle weekends/holidays.
 */
async function fetchPriceOnDate(symbol: string, date: Date): Promise<number | null> {
  try {
    const from = new Date(date.getTime() - 2 * 86_400_000);
    const to   = new Date(date.getTime() + 2 * 86_400_000);
    const result = await yahooFinance.chart(`${symbol}.NS`, {
      period1: from, period2: to, interval: '1d',
    } as any);
    const quotes = result?.quotes ?? [];
    if (quotes.length === 0) return null;
    // Pick the quote closest to `date`
    const target = date.getTime();
    const sorted = [...quotes].sort((a, b) =>
      Math.abs(new Date(a.date).getTime() - target) -
      Math.abs(new Date(b.date).getTime() - target)
    );
    return (sorted[0] as any).close ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch current market price for an NSE symbol.
 */
async function fetchPriceNow(symbol: string): Promise<number | null> {
  try {
    const q = await yahooFinance.quote(`${symbol}.NS`) as any;
    return q?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

/**
 * Daily cron: for articles 1, 3, and 7 days old that have symbols,
 * fetch price data and store/update price_impact_json.
 */
async function updatePriceImpacts(): Promise<void> {
  const DAY = 86_400_000;
  const now  = Date.now();
  const cutoff = now - 8 * DAY; // only look back 8 days

  const articles = getArticlesForImpactCheck(cutoff);

  for (const article of articles) {
    const symbols: string[] = JSON.parse(article.mentioned_symbols!);
    if (symbols.length === 0) continue;

    const ageMs   = now - article.fetched_at;
    const ageDays = ageMs / DAY;

    // Determine which checkpoint applies (with ±6h tolerance)
    let checkpoint: 'd1' | 'd3' | 'd7' | null = null;
    if      (ageDays >= 0.75 && ageDays < 2)  checkpoint = 'd1';
    else if (ageDays >= 2.75 && ageDays < 4)  checkpoint = 'd3';
    else if (ageDays >= 6.75 && ageDays < 8)  checkpoint = 'd7';

    if (!checkpoint) continue;

    // Parse existing impact (if any)
    const existing: Record<string, any> = article.price_impact_json
      ? JSON.parse(article.price_impact_json)
      : {};

    // Skip if checkpoint already recorded for every symbol
    const allDone = symbols.every(s => existing[s]?.[checkpoint] !== undefined);
    if (allDone) continue;

    const articleDate = new Date(article.fetched_at);
    const updated: Record<string, any> = { ...existing };

    for (const symbol of symbols) {
      // "then" price — cached from first run
      let thenPrice: number | null = existing[symbol]?.then ?? null;
      if (thenPrice === null) {
        thenPrice = await fetchPriceOnDate(symbol, articleDate);
        if (!thenPrice) continue;
      }

      const nowPrice = await fetchPriceNow(symbol);
      if (!nowPrice) continue;

      updated[symbol] = {
        ...(existing[symbol] ?? {}),
        then: thenPrice,
        [checkpoint]: nowPrice,
      };

      // Throttle Yahoo Finance requests
      await new Promise(r => setTimeout(r, 200));
    }

    updateNewsPriceImpact(article.id, JSON.stringify(updated));
  }
  console.log(`[impact] updatePriceImpacts done — checked ${articles.length} article(s)`);
}

// Run symbol extraction 5 minutes after boot, then every 30 minutes
setTimeout(() => extractPendingSymbols().catch(e => console.error('[impact] extractPendingSymbols:', e)), 5 * 60 * 1000);
setInterval(() => extractPendingSymbols().catch(e => console.error('[impact] extractPendingSymbols:', e)), 30 * 60 * 1000);

// Run price impact update daily at 18:30 IST (when market has been closed ~3 hrs)
let impactLastRun = '';
setInterval(() => {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const hhmm = `${String(ist.getUTCHours()).padStart(2,'0')}:${String(ist.getUTCMinutes()).padStart(2,'0')}`;
  const today = ist.toISOString().slice(0, 10);
  if (hhmm >= '18:30' && hhmm < '18:32' && impactLastRun !== today) {
    impactLastRun = today;
    updatePriceImpacts().catch(e => console.error('[impact] updatePriceImpacts:', e));
  }
}, 60 * 1000);

// ─── Mystery Stock ────────────────────────────────────────────────────────────

import stockDbRaw from "./stockDatabase.json" assert { type: "json" };

interface StockRecord {
  symbol:           string;
  name:             string;
  sector:           string;
  founded:          number;
  city:             string;
  employees_approx: number;
  fun_fact:         string;
  founder:          string;
  index_member:     string;
}

const STOCK_DB: StockRecord[] = stockDbRaw as StockRecord[];

/** Deterministic stock selection for a given IST date string (YYYY-MM-DD). */
function getStockForDate(dateStr: string): StockRecord {
  const hash = crypto.createHash('md5').update('stockkaun-' + dateStr).digest('hex');
  const idx  = parseInt(hash.slice(0, 8), 16) % STOCK_DB.length;
  return STOCK_DB[idx];
}

/** Call Gemini to generate 5 progressively specific clues about a stock. */
async function generateCluesForStock(stock: StockRecord): Promise<string[]> {
  const prompt = `You are generating clues for "Mystery Stock" — a daily Indian stock guessing game.

Company: ${stock.name} (NSE: ${stock.symbol})
Sector: ${stock.sector}
Founded: ${stock.founded}
HQ City: ${stock.city}
Employees: ~${stock.employees_approx.toLocaleString()}
Fun Fact: ${stock.fun_fact}
Founder: ${stock.founder}
Index: ${stock.index_member}

Generate exactly 5 clues in increasing order of specificity. Rules:
- Clue 1: Mention only the broad sector category and whether it's large/mid/small cap. NO company-specific details. Very vague.
- Clue 2: One historical fact about when/how this company started — no company name or ticker.
- Clue 3: A hint about what product or service this company is most famous for — no company name.
- Clue 4: Mention the exact city of headquarters and the decade it was founded (e.g. "1980s"). No company name.
- Clue 5: Give only the FIRST LETTER of the founder's surname (e.g. "Founder's surname starts with 'A'").

Return ONLY a valid JSON array of exactly 5 strings. No markdown, no explanation.`;

  const raw = await geminiCall([{ role: 'user', parts: [{ text: prompt }] }]);
  const match = raw.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('Gemini did not return a JSON array');

  const clues = JSON.parse(match[0]) as string[];
  if (!Array.isArray(clues) || clues.length !== 5) throw new Error('Expected 5 clues');
  return clues;
}

/** Get (or generate & cache) today's Mystery Stock data. */
async function getTodayMysteryStock(): Promise<{ date: string; symbol: string; clues: string[] }> {
  const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const cached = getMysteryStockForDate(todayIST);
  if (cached) {
    return { date: todayIST, symbol: cached.symbol, clues: JSON.parse(cached.clues_json) };
  }

  const stock  = getStockForDate(todayIST);
  const clues  = await generateCluesForStock(stock);
  upsertMysteryStock(todayIST, stock.symbol, clues);
  console.log(`[mystery-stock] Generated clues for ${todayIST} → ${stock.symbol}`);
  return { date: todayIST, symbol: stock.symbol, clues };
}

// Pre-generate today's clues on boot (non-blocking)
setTimeout(() => {
  getTodayMysteryStock().catch(e => console.error('[mystery-stock] pre-gen failed:', e));
}, 10 * 1000);

// Regenerate daily at 00:01 IST
let mysteryStockLastRun = '';
setInterval(() => {
  const ist   = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const hhmm  = `${String(ist.getUTCHours()).padStart(2,'0')}:${String(ist.getUTCMinutes()).padStart(2,'0')}`;
  const today = ist.toISOString().slice(0, 10);
  if (hhmm >= '00:01' && hhmm < '00:03' && mysteryStockLastRun !== today) {
    mysteryStockLastRun = today;
    getTodayMysteryStock().catch(e => console.error('[mystery-stock] midnight gen failed:', e));
  }
}, 60 * 1000);

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.isAdmin === true) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.redirect("/admin/login");
}

// ─── IPO scraper ─────────────────────────────────────────────────────────────

/** Parse dates like "01 Apr 2026", "Apr 01, 2026", "01-Apr-2026" → "YYYY-MM-DD" */
function parseIPODate(raw: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const s = raw.trim();
  // "01 Apr 2026" or "01-Apr-2026"
  const m1 = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})[\s\-\/,]*(\d{4})/);
  if (m1) {
    const mo = months[m1[2].toLowerCase()];
    if (mo) return `${m1[3]}-${mo}-${m1[1].padStart(2, '0')}`;
  }
  // "Apr 01, 2026"
  const m2 = s.match(/^([A-Za-z]{3})[\s\-\/,]+(\d{1,2})[\s\-\/,]+(\d{4})/);
  if (m2) {
    const mo = months[m2[1].toLowerCase()];
    if (mo) return `${m2[3]}-${mo}-${m2[2].padStart(2, '0')}`;
  }
  // Already ISO: "2026-04-01"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** Parse a price string like "₹100 to ₹120" or "100-120" → [low, high] */
function parsePriceBand(raw: string): [number | null, number | null] {
  const nums = raw.replace(/[₹,\s]/g, '').match(/\d+/g);
  if (!nums) return [null, null];
  if (nums.length === 1) return [parseInt(nums[0]), parseInt(nums[0])];
  return [parseInt(nums[0]), parseInt(nums[nums.length - 1])];
}

async function scrapeAndSaveIPOs(): Promise<number> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Referer':         'https://www.google.com/',
    'Cache-Control':   'no-cache',
  };

  let saved = 0;

  // ── Scrape upcoming IPOs ───────────────────────────────────────────────────
  try {
    const res  = await axios.get('https://www.chittorgarh.com/report/upcoming-ipo-in-india-2026/76/', { headers, timeout: 20000 });
    const dom  = new JSDOM(res.data);
    const doc  = dom.window.document;
    const rows = Array.from(doc.querySelectorAll('table tbody tr'));

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 4) continue;

      const nameCell  = cells[0]?.textContent?.trim().replace(/ IPO$/i, '').trim();
      const datesCell = cells[1]?.textContent?.trim() ?? '';
      const priceCell = cells[2]?.textContent?.trim() ?? '';
      const lotCell   = cells[3]?.textContent?.trim() ?? '';
      const typeCell  = cells[4]?.textContent?.trim().toLowerCase() ?? 'mainboard';

      if (!nameCell || nameCell.length < 2) continue;

      // Date range: "Apr 01, 2026 to Apr 03, 2026"
      const dateParts = datesCell.split(/\s+to\s+/i);
      const openDate  = dateParts[0] ? parseIPODate(dateParts[0]) : null;
      const closeDate = dateParts[1] ? parseIPODate(dateParts[1]) : openDate;

      const [priceLow, priceHigh] = parsePriceBand(priceCell);
      const lot = parseInt(lotCell.replace(/[^0-9]/g, '')) || null;
      const isSME = typeCell.includes('sme') || typeCell.includes('bse sme') || typeCell.includes('nse sme');

      const id = crypto
        .createHash('md5')
        .update((nameCell + (openDate ?? '')).toLowerCase())
        .digest('hex')
        .slice(0, 12);

      upsertIPO({
        id,
        company_name:        nameCell,
        symbol:              null,
        open_date:           openDate,
        close_date:          closeDate,
        allotment_date:      null,
        listing_date:        null,
        price_band_low:      priceLow,
        price_band_high:     priceHigh,
        lot_size:            lot,
        gmp:                 null,
        subscription_status: null,
        category:            isSME ? 'sme' : 'mainboard',
      });
      saved++;
    }
  } catch (err: any) {
    console.warn('[ipo-scraper] upcoming page failed:', err.message);
  }

  // ── Scrape GMP ────────────────────────────────────────────────────────────
  try {
    const res  = await axios.get('https://www.chittorgarh.com/report/ipo-gmp-ipo-grey-market-premium/141/', { headers, timeout: 20000 });
    const dom  = new JSDOM(res.data);
    const doc  = dom.window.document;
    const rows = Array.from(doc.querySelectorAll('table tbody tr'));

    for (const row of rows) {
      const cells  = Array.from(row.querySelectorAll('td'));
      if (cells.length < 2) continue;
      const name   = cells[0]?.textContent?.trim().replace(/ IPO$/i, '').trim();
      const gmpRaw = cells[1]?.textContent?.trim().replace(/[₹,\+\s]/g, '');
      const gmp    = parseInt(gmpRaw ?? '') || 0;
      if (!name || isNaN(gmp)) continue;

      // Find matching IPO by company name (fuzzy: first 12 chars)
      const all = getAllIPOs();
      const match = all.find(i =>
        i.company_name.toLowerCase().startsWith(name.toLowerCase().slice(0, 12)) ||
        name.toLowerCase().startsWith(i.company_name.toLowerCase().slice(0, 12)),
      );
      if (match) updateIPOGMP(match.id, gmp);
    }
  } catch (err: any) {
    console.warn('[ipo-scraper] GMP page failed:', err.message);
  }

  console.log(`[ipo-scraper] Saved/updated ${saved} IPOs`);
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  app.use(express.json());

  // ── Session middleware ──
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.error("[FATAL] SESSION_SECRET env var is required in production");
    process.exit(1);
  }
  app.set("trust proxy", 1);
  app.use(
    session({
      secret:            process.env.SESSION_SECRET ?? "dev-only-fallback-secret",
      resave:            false,
      saveUninitialized: false,
      cookie: {
        secure:   process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge:   24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // Security headers
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://*.firebaseio.com https://fcm.googleapis.com https://query1.finance.yahoo.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", CSP);
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // CORS headers for API routes — locked to known origins
  const allowedOrigins = new Set(
    [
      process.env.APP_URL,
      process.env.APP_URL?.replace(/^https?:\/\//, "https://www."),
      process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null,
      process.env.NODE_ENV !== "production" ? "http://localhost:5173" : null,
    ].filter((v): v is string => Boolean(v) && v !== "MY_APP_URL")
  );
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ── Rate limiters (defined before routers so they actually apply) ─────────
  const articleLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  const refreshLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many refresh requests, please try again later." },
  });

  // General API rate limiter — applies to all /api routes
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api", apiLimiter);

  // ── Stock price routes (/api/stocks/...) ──
  app.use("/api/stocks", stocksRouter);

  // ── Paper Trading virtual trading routes (/api/trading/...) ──
  app.use("/api/trading", tradingRouter);

  // ── Daily Forecast prediction routes (/api/predictions/...) ──
  app.use("/api/predictions", predictionsRouter);

  // ── Rewards Hub routes (/api/rewards/...) ──
  app.use("/api/rewards", rewardsRouter);
  app.use("/api/news-impact", newsImpactRouter);
  app.use("/api/ipo-predictions", ipoPredictionsRouter);
  app.use("/api/reading-rewards", readingRewardsRouter);
  app.use("/api/auth", authSyncRouter);
  app.use("/api/pulse", pulseRouter);
  app.use("/api/chartguessr", chartguessrRouter);
  app.use("/api/referrals", referralsRouter);

  // Stricter limiter for Gemini-powered routes (cost-bearing)
  app.use("/api/news/article", articleLimiter);

  // ── Admin auth routes (public — no requireAdmin) ──────────────────────────

  /**
   * Defense-in-depth: /admin/setup must only be reachable from the local
   * machine. Use socket.remoteAddress (ignores X-Forwarded-For so a proxy
   * can't spoof loopback) and also require no forwarding header.
   */
  const isLoopback = (req: Request): boolean => {
    if (req.headers["x-forwarded-for"]) return false;
    const raw = req.socket.remoteAddress ?? "";
    const ip = raw.replace(/^::ffff:/, "");
    return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
  };

  /** First-time setup: GET shows form, POST processes password. */
  app.get("/admin/setup", (req, res) => {
    if (!isLoopback(req)) {
      res.status(404).send("Not found");
      return;
    }
    if (process.env.ADMIN_PASSWORD) {
      res.status(403).send("Setup already complete. Remove ADMIN_PASSWORD from env to re-run.");
      return;
    }
    res.send(`
      <!doctype html><html><body style="background:#07070e;color:#ccc;font-family:monospace;padding:2rem">
      <h2 style="color:#00ff88">Admin Setup</h2>
      <form method="POST" action="/admin/setup">
        <label>Password: <input type="password" name="password" required minlength="8" style="background:#111;color:#00ff88;border:1px solid #333;padding:8px;border-radius:4px;margin:0 8px" /></label>
        <button type="submit" style="background:#00ff88;color:#000;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold">Generate Hash</button>
      </form>
      <p style="margin-top:1rem;color:#888">Then set <code>ADMIN_PASSWORD=&lt;hash&gt;</code> in your .env and restart.</p>
      </body></html>
    `);
  });

  app.post("/admin/setup", async (req, res) => {
    if (!isLoopback(req)) {
      res.status(404).send("Not found");
      return;
    }
    if (process.env.ADMIN_PASSWORD) {
      res.status(403).send("Setup already complete.");
      return;
    }
    const password = req.body?.password;
    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).send(`
        <!doctype html><html><body style="background:#07070e;color:#ff6b6b;font-family:monospace;padding:2rem">
        <h2>Error</h2><p>Password must be at least 8 characters.</p>
        <a href="/admin/setup" style="color:#00ff88">← Back</a>
        </body></html>
      `);
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    console.log("[admin/setup] Hash generated — user should add it to .env");
    res.send(`
      <!doctype html><html><body style="background:#07070e;color:#ccc;font-family:monospace;padding:2rem">
      <h2 style="color:#00ff88">Hash generated</h2>
      <p>Add this to your <code>.env</code> and restart the server:</p>
      <pre style="background:#111;padding:1rem;border-radius:4px;word-break:break-all;color:#00ff88">ADMIN_PASSWORD="${hash}"</pre>
      <p style="color:#ff6b6b">This page will be disabled once ADMIN_PASSWORD is set.</p>
      </body></html>
    `);
  });

  /** Login page */
  app.get("/admin/login", (req, res) => {
    const error = req.query.error === "1";
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Market Samachar Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #07070e;
      font-family: 'DM Sans', system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }

    .card {
      width: 320px;
      background: #0d0d1a;
      border: 1px solid #1a1a2e;
      border-radius: 12px;
      padding: 2.25rem 1.75rem 2rem;
    }

    /* ── Logo row ── */
    .logo-row {
      margin-bottom: .5rem;
    }

    .subtitle {
      font-size: .78rem;
      color: #4a5568;
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-bottom: 2rem;
      padding-left: calc(32px + .65rem);
    }

    /* ── Error banner ── */
    .error {
      display: flex;
      align-items: center;
      gap: .5rem;
      background: rgba(239, 68, 68, .08);
      border: 1px solid rgba(239, 68, 68, .25);
      border-radius: 6px;
      color: #f87171;
      font-size: .82rem;
      padding: .6rem .75rem;
      margin-bottom: 1.25rem;
    }
    .error::before {
      content: '⚠';
      font-size: .9rem;
      flex-shrink: 0;
    }

    /* ── Form ── */
    label {
      display: block;
      font-size: .72rem;
      font-weight: 500;
      color: #6b7280;
      letter-spacing: .07em;
      text-transform: uppercase;
      margin-bottom: .45rem;
    }

    input[type=password] {
      width: 100%;
      background: #07070e;
      border: 1px solid #1a1a2e;
      border-radius: 6px;
      color: #e6edf3;
      font-family: 'DM Mono', monospace;
      font-size: .9rem;
      padding: .65rem .85rem;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
      letter-spacing: .05em;
    }
    input[type=password]::placeholder { color: #2a2a4a; }
    input[type=password]:focus {
      border-color: #00ff88;
      box-shadow: 0 0 0 3px rgba(0, 255, 136, .08);
    }

    button {
      width: 100%;
      margin-top: 1.1rem;
      background: #00ff88;
      border: none;
      border-radius: 6px;
      color: #07070e;
      cursor: pointer;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: .9rem;
      font-weight: 600;
      letter-spacing: .02em;
      padding: .72rem;
      transition: background .15s, transform .1s;
    }
    button:hover  { background: #00e67a; }
    button:active { transform: scale(.98); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <img src="/ms-login.svg" alt="Market Samachar" style="height:40px">
    </div>
    <div class="subtitle">Admin Access</div>

    ${error ? '<div class="error">Invalid password. Try again.</div>' : ""}

    <form method="POST" action="/admin/login">
      <label for="pw">Password</label>
      <input
        type="password"
        id="pw"
        name="password"
        placeholder="••••••••••••"
        autofocus
        autocomplete="current-password"
      >
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`);
  });

  /** Login form submission */
  app.post("/admin/login", express.urlencoded({ extended: false }), async (req, res) => {
    const { password } = req.body as { password?: string };
    const hash = process.env.ADMIN_PASSWORD ?? "";

    if (!hash) {
      res.send("ADMIN_PASSWORD not configured. Visit /admin/setup first.");
      return;
    }

    const ok = password ? await bcrypt.compare(password, hash) : false;
    if (ok) {
      req.session.isAdmin = true;
      res.redirect("/admin");
    } else {
      res.redirect("/admin/login?error=1");
    }
  });

  /** Logout */
  app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  // ── Admin dashboard ─────────────────────────────────────────────────────────

  /** Main admin dashboard — redirect / to /admin/dashboard */
  app.get("/admin", requireAdmin, (req, res) => {
    res.redirect("/admin/dashboard");
  });

  app.get("/admin/dashboard", requireAdmin, (_req, res) => {
    res.send(renderAdminDashboard());
  });

  // ── Admin API — stats ────────────────────────────────────────────────────────

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Users from Supabase
      let totalUsers = 0, proUsers = 0, activeToday = 0;
      if (supabaseAdmin) {
        const [{ count: total }, { count: pro }, { count: active }] = await Promise.all([
          supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_pro', true),
          supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('streak_last_date', today),
        ]);
        totalUsers = total ?? 0;
        proUsers   = pro   ?? 0;
        activeToday = active ?? 0;
      }

      // Revenue today from SQLite payments
      const todayStart = new Date(today + 'T00:00:00+05:30').getTime();
      const paymentsToday = getAllPayments(500).filter(
        p => p.status === 'success' && p.created_at >= todayStart
      );
      const revenueToday = paymentsToday.reduce((s, p) => s + (p.amount ?? 0), 0);

      // Quizzes today from SQLite
      const attemptsToday = getAttemptsForDate(today);
      const quizzesToday  = attemptsToday.length;

      // Pipeline stats
      const recentBatches = getRecentBatches(1);
      const lastBatch     = recentBatches[0] ?? null;
      const pipelineStatus = lastBatch?.status ?? 'no data';
      const lastFetchAgo = lastBatch
        ? Math.round((Date.now() - lastBatch.fetched_at) / 60000) + 'm ago'
        : '—';

      return res.json({
        totalUsers, proUsers, activeToday,
        revenueToday, quizzesToday,
        articlesCached: newsCache.length,
        pipelineStatus, lastFetchAgo,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/batches", requireAdmin, (req, res) => {
    const batches = getRecentBatches(20);
    return res.json(batches);
  });

  // ── Admin API — payments ─────────────────────────────────────────────────────

  app.get("/api/admin/payments", requireAdmin, (req, res) => {
    const status = req.query.status as string;
    let payments = getAllPayments(200);
    if (status && status !== 'all') {
      payments = payments.filter(p => p.status === status);
    }
    return res.json(payments);
  });

  app.post("/api/admin/payments/:id/activate", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const payment = getPaymentById(id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    try {
      if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' });

      // Determine Pro duration from plan
      const daysMap: Record<string, number> = { daily: 1, monthly: 30, yearly: 365 };
      const days = daysMap[payment.plan] ?? 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      await supabaseAdmin.from('profiles').update({
        is_pro: true,
        pro_expires_at: expiresAt,
      }).eq('id', payment.user_id);

      markPaymentSuccess(id, 'manual-admin');

      // Log reward
      addRewardLog({
        user_id: payment.user_id,
        email:   payment.email,
        days,
        reason:  'admin_grant',
        granted_by: 'admin (payment activation)',
        created_at: Date.now(),
      });

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Admin API — users ────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json([]);
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' });

    try {
      // Search by email in auth.users, then join with profiles
      const isPhone = /^\+?[0-9]{7,15}$/.test(q);
      let profileData: any[] = [];

      if (isPhone) {
        const { data } = await supabaseAdmin.from('profiles')
          .select('*').ilike('phone', '%' + q + '%').limit(20);
        profileData = data ?? [];
      } else if (q.includes('@')) {
        // Email search via auth.admin
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 10 });
        const matchedUsers = (authData?.users ?? []).filter(u =>
          u.email?.toLowerCase().includes(q.toLowerCase())
        );
        if (matchedUsers.length > 0) {
          const ids = matchedUsers.map(u => u.id);
          const { data } = await supabaseAdmin.from('profiles').select('*').in('id', ids);
          profileData = (data ?? []).map(p => {
            const authUser = matchedUsers.find(u => u.id === p.id);
            return { ...p, email: authUser?.email ?? null };
          });
        }
      } else {
        // Try user ID prefix or name
        const { data: byId } = await supabaseAdmin.from('profiles')
          .select('*').ilike('id', q + '%').limit(5);
        const { data: byName } = await supabaseAdmin.from('profiles')
          .select('*').ilike('name', '%' + q + '%').limit(15);
        profileData = [...(byId ?? []), ...(byName ?? [])];
      }

      return res.json(profileData);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:id/grant-pro", requireAdmin, async (req, res) => {
    const userId = decodeURIComponent(req.params.id);
    const { days = 30, reason = 'admin_grant' } = req.body as { days?: number; reason?: string };

    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' });

    try {
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      // Find profile — userId might be an email or phone
      let profileId = userId;
      if (userId.includes('@') || /^\+?[0-9]/.test(userId)) {
        // Look up by email via auth
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const match = (authData?.users ?? []).find(u =>
          u.email === userId || u.phone === userId
        );
        if (match) profileId = match.id;
      }

      const { error, data } = await supabaseAdmin.from('profiles').update({
        is_pro: true,
        pro_expires_at: expiresAt,
      }).eq('id', profileId).select('email, phone').single();

      if (error) return res.status(500).json({ error: error.message });

      // Get email for log
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profileId);
      const email = authUser?.user?.email ?? null;

      addRewardLog({
        user_id:    profileId,
        email:      email ?? (data as any)?.phone ?? null,
        days,
        reason,
        granted_by: 'admin',
        created_at: Date.now(),
      });

      // Send push notification if user has FCM token
      const { data: prof } = await supabaseAdmin.from('profiles').select('fcm_token').eq('id', profileId).single();
      if (prof?.fcm_token) {
        sendFcmNotification(
          [prof.fcm_token as string],
          '🎉 Pro Access Granted!',
          `${days} days Pro unlocked! Enjoy unlimited access.`,
          '/',
        ).catch(() => {});
      }

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:id/remove-pro", requireAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' });
    const { error } = await supabaseAdmin.from('profiles').update({
      is_pro: false,
      pro_expires_at: null,
    }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  });

  app.post("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' });
    try {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
        ban_duration: '876000h',  // ~100 years
      });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:id/adjust-coins", requireAdmin, async (req, res) => {
    const { delta } = req.body as { delta: number };
    if (!delta || typeof delta !== 'number') return res.status(400).json({ error: 'Invalid delta' });
    if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' });
    // RPC increment so we don't overwrite concurrent changes
    const { data: current } = await supabaseAdmin.from('profiles').select('coins').eq('id', req.params.id).single();
    const newCoins = Math.max(0, ((current as any)?.coins ?? 0) + delta);
    const { error } = await supabaseAdmin.from('profiles').update({ coins: newCoins }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, coins: newCoins });
  });

  // ── Admin API — quiz ─────────────────────────────────────────────────────────

  app.get("/api/admin/quiz/today", requireAdmin, (req, res) => {
    const today     = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const questions = getQuizForDate(today) ?? [];
    const attempts  = getAttemptsForDate(today);
    return res.json({ questions, attempts, date: today });
  });

  app.post("/api/admin/quiz/regenerate", requireAdmin, async (req, res) => {
    try {
      const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      // Delete existing quiz so generateOrGetQuiz will recreate it
      rawDb.prepare('DELETE FROM quiz_questions WHERE date = ?').run(today);
      await generateOrGetQuiz();
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Admin API — rewards ──────────────────────────────────────────────────────

  app.get("/api/admin/rewards", requireAdmin, (req, res) => {
    return res.json(getRewardLogs(200));
  });


  // ── Admin API — news browser ─────────────────────────────────────────────────

  app.get('/api/admin/news', requireAdmin, (req: Request, res: Response) => {
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit    = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset   = (page - 1) * limit;
    const category = (req.query.category as string) || '';

    let where = '1=1';
    const params: any[] = [];
    if (category) { where += ' AND category = ?'; params.push(category); }

    const total    = (rawDb.prepare('SELECT COUNT(*) as c FROM news_items WHERE ' + where).get(...params) as any).c;
    const articles = rawDb.prepare(
      'SELECT id, title, link, source, category, pub_date, fetched_at, content_snippet ' +
      'FROM news_items WHERE ' + where + ' ORDER BY fetched_at DESC LIMIT ? OFFSET ?'
    ).all(...params, limit, offset);

    res.json({ articles, total, page, pages: Math.ceil(total / limit) });
  });

  // ── Admin API — virtual trading overview ─────────────────────────────────────

  app.get('/api/admin/trading', requireAdmin, (req: Request, res: Response) => {
    const totalOrders  = (rawDb.prepare('SELECT COUNT(*) as c FROM virtual_orders').get() as any).c;
    const totalBuys    = (rawDb.prepare('SELECT COUNT(*) as c FROM virtual_orders WHERE order_type="BUY"').get() as any).c;
    const totalSells   = (rawDb.prepare('SELECT COUNT(*) as c FROM virtual_orders WHERE order_type="SELL"').get() as any).c;
    const totalTraders = (rawDb.prepare('SELECT COUNT(DISTINCT user_id) as c FROM virtual_orders').get() as any).c;
    const leaderboard  = rawDb.prepare(
      'SELECT user_id, total_invested_coins, current_value_coins, realised_pnl_coins, updated_at ' +
      'FROM virtual_portfolio ORDER BY current_value_coins DESC LIMIT 20'
    ).all();
    const recentOrders = rawDb.prepare(
      'SELECT * FROM virtual_orders ORDER BY created_at DESC LIMIT 30'
    ).all();
    res.json({ totalOrders, totalBuys, totalSells, totalTraders, leaderboard, recentOrders });
  });

  // ── Admin API — daily predictions overview ───────────────────────────────────

  app.get('/api/admin/predictions', requireAdmin, (req: Request, res: Response) => {
    const predictions  = rawDb.prepare('SELECT * FROM daily_predictions ORDER BY created_at DESC LIMIT 30').all();
    const totalVotes   = (rawDb.prepare('SELECT COUNT(*) as c FROM user_predictions').get() as any).c;
    const correctVotes = (rawDb.prepare('SELECT COUNT(*) as c FROM user_predictions WHERE is_correct=1').get() as any).c;
    res.json({ predictions, totalVotes, correctVotes });
  });

  // ── Admin API — samachar coins ledger ────────────────────────────────────────

  app.get('/api/admin/coins', requireAdmin, (req: Request, res: Response) => {
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const total  = (rawDb.prepare('SELECT COUNT(*) as c FROM samachar_coins').get() as any).c;
    const totalCoinsIssued = (rawDb.prepare('SELECT COALESCE(SUM(amount),0) as s FROM samachar_coins WHERE amount > 0').get() as any).s;
    const ledger = rawDb.prepare('SELECT * FROM samachar_coins ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    res.json({ ledger, total, totalCoinsIssued });
  });

  // ── End admin dashboard routes ───────────────────────────────────────────────

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/news", async (req, res) => {
    const category = req.query.category as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    let filteredItems = newsCache;
    if (category && category !== 'all') {
      filteredItems = newsCache.filter(item => item.category === category);
    }

    let pageItems = filteredItems.slice(offset, offset + limit);
    let totalCount = filteredItems.length;

    // ── Fall through to SQLite when caller paginates past the in-memory
    // cache. The cache is capped at 500 items but news_items keeps 30 days,
    // so older articles must come from disk.
    if (pageItems.length < limit) {
      try {
        const remaining = limit - pageItems.length;
        const dbOffset  = Math.max(0, offset - filteredItems.length);
        const cacheIds  = new Set(filteredItems.map(i => i.id));

        const where = category && category !== 'all' ? 'WHERE category = ?' : '';
        const params: any[] = category && category !== 'all' ? [category] : [];

        // Total count for accurate "Load more" UX
        const countRow = rawDb.prepare(
          `SELECT COUNT(*) AS c FROM news_items ${where}`
        ).get(...params) as { c: number };
        totalCount = Math.max(totalCount, countRow.c);

        // Pull a generous slice — we may need to skip cached duplicates
        const slice = rawDb.prepare(`
          SELECT id, title, link, pub_date, source, category, content_snippet
          FROM news_items
          ${where}
          ORDER BY pub_date DESC
          LIMIT ? OFFSET ?
        `).all(...params, remaining + 50, dbOffset) as Array<{
          id: string; title: string; link: string; pub_date: string;
          source: string; category: string; content_snippet: string | null;
        }>;

        const olderItems = slice
          .filter(r => !cacheIds.has(r.id))
          .slice(0, remaining)
          .map(r => ({
            id:             r.id,
            title:          r.title,
            link:           r.link,
            pubDate:        r.pub_date,
            source:         r.source,
            category:       r.category as any,
            contentSnippet: r.content_snippet ?? undefined,
          }));

        pageItems = [...pageItems, ...olderItems];
      } catch (err) {
        console.error('[/api/news] db fallthrough failed:', err);
      }
    }

    // Enrich with pre-computed AI data from DB (best-effort — never blocks the response)
    let aiMap: ReturnType<typeof getAiDataBatch> = {};
    try {
      aiMap = getAiDataBatch(pageItems.map(i => i.id));
    } catch (_) {}

    const enriched = pageItems.map(item => {
      const ai = aiMap[item.id];
      if (!ai) return item;
      return {
        ...item,
        aiSummary:      ai.ai_summary ?? undefined,
        summaryBullets: ai.summary_bullets ? JSON.parse(ai.summary_bullets) : [],
        sentiment:      ai.sentiment ?? 'neutral',
        impactSectors:  ai.impact_sectors ? JSON.parse(ai.impact_sectors) : [],
        keyNumbers:     ai.key_numbers ? JSON.parse(ai.key_numbers) : [],
        translations:   ai.translations ? JSON.parse(ai.translations) : {},
      };
    });

    res.json({
      lastFetchTime,
      items: enriched,
      total: totalCount,
    });
  });

  // Public refresh: header button in the app hits this; refreshLimiter caps
  // to 5 req/min per IP so it can't be abused to hammer RSS feeds.
  app.post("/api/news/refresh", refreshLimiter, async (req, res) => {
    await fetchNews();
    res.json({ success: true, lastFetchTime });
  });

  app.get("/api/news/article", articleLimiter, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return res.status(400).json({ error: "URL must start with http:// or https://" });
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();

      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return res.status(404).json({ error: "Could not parse article content" });
      }

      res.json({
        title: article.title,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt,
        byline: article.byline,
        dir: article.dir,
      });
    } catch (error) {
      console.error(`Error fetching article from ${url}:`, error);
      res.status(500).json({ error: "Failed to fetch article content" });
    }
  });

  // GET /api/social/articles
  // Protected — requires X-Social-Key header matching SOCIAL_API_KEY env var
  // Query params:
  //   since (required) — Unix timestamp in ms, returns articles fetched after this time
  //   category (optional) — filter by category
  // Returns articles that have ai_summary data, with all AI fields included
  app.get('/api/social/articles', (req: Request, res: Response) => {
    const key = req.headers['x-social-key'];
    const expectedKey = process.env.SOCIAL_API_KEY;
    if (!expectedKey || key !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const since = parseInt(req.query.since as string) || 0;
    const category = req.query.category as string | undefined;

    try {
      const db = rawDb;
      let query = `
        SELECT
          n.id, n.title, n.link, n.pub_date, n.source, n.category,
          n.content_snippet, n.fetched_at, n.batch_id,
          n.ai_summary, n.summary_bullets, n.sentiment,
          n.impact_sectors, n.key_numbers, n.translations
        FROM news_items n
        WHERE n.fetched_at > ?
          AND n.ai_summary IS NOT NULL
          AND n.ai_summary != ''
      `;
      const params: any[] = [since];

      if (category && category !== 'all') {
        query += ` AND n.category = ?`;
        params.push(category);
      }

      query += ` ORDER BY n.fetched_at DESC`;

      const rows = (db as any).prepare(query).all(...params);

      const articles = rows.map((row: any) => ({
        id:             row.id,
        title:          row.title,
        link:           row.link,
        pubDate:        row.pub_date,
        source:         row.source,
        category:       row.category,
        contentSnippet: row.content_snippet,
        fetchedAt:      row.fetched_at,
        batchId:        row.batch_id,
        aiSummary:      row.ai_summary,
        summaryBullets: row.summary_bullets ? JSON.parse(row.summary_bullets) : [],
        sentiment:      row.sentiment ?? 'neutral',
        impactSectors:  row.impact_sectors ? JSON.parse(row.impact_sectors) : [],
        keyNumbers:     row.key_numbers ? JSON.parse(row.key_numbers) : [],
        translations:   row.translations ? JSON.parse(row.translations) : {},
      }));

      res.json({ count: articles.length, articles });
    } catch (err) {
      res.status(500).json({ error: 'DB query failed', detail: (err as Error).message });
    }
  });

  app.get("/api/market-data", async (req, res) => {
    const ttl = isMarketHours() ? 30_000 : 60_000;
    if (marketCache && Date.now() - marketCache.fetchedAt < ttl) {
      return res.json(marketCache.data);
    }
    try {
      const results = await Promise.allSettled(
        MARKET_SYMBOLS.map((sym) => yahooFinance.quote(sym))
      );
      const data: MarketQuote[] = results
        .map((result, i) => {
          if (result.status !== "fulfilled") {
            console.error(`[market-data] ${MARKET_SYMBOLS[i]} failed:`, (result as PromiseRejectedResult).reason);
            return null;
          }
          const q = result.value as any;
          return {
            symbol: MARKET_SYMBOLS[i],
            name: SYMBOL_NAMES[MARKET_SYMBOLS[i]] || q.shortName || MARKET_SYMBOLS[i],
            price: q.regularMarketPrice ?? 0,
            change: q.regularMarketChange ?? 0,
            changePercent: q.regularMarketChangePercent ?? 0,
            high: q.regularMarketDayHigh ?? null,
            low: q.regularMarketDayLow ?? null,
          };
        })
        .filter((q): q is MarketQuote => q !== null);
      marketCache = { data, fetchedAt: Date.now() };
      res.json(data);
    } catch (err) {
      console.error("[market-data] fetch error:", err);
      if (marketCache) return res.json(marketCache.data);
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  // ── /api/chart ──────────────────────────────────────────────────────────
  // Historical price series for indices (^NSEI, ^BSESN, ...) or NSE stocks.
  // Stock symbols are auto-suffixed with `.NS`. Indices (start with ^) and
  // futures/FX (contain = or /) are passed through unchanged.
  // Returns: { symbol, range, points: [{ t, c }] }   t=ms, c=close price
  type ChartRange = '1d' | '5d' | '1mo' | '6mo' | '1y';
  const RANGE_MAP: Record<ChartRange, { period: number; interval: string }> = {
    '1d':  { period:       86_400_000, interval: '5m'  },  // 1 day, 5-min bars
    '5d':  { period:   5 * 86_400_000, interval: '15m' },
    '1mo': { period:  31 * 86_400_000, interval: '1d'  },
    '6mo': { period: 186 * 86_400_000, interval: '1d'  },
    '1y':  { period: 366 * 86_400_000, interval: '1wk' },
  };
  const chartCache = new Map<string, { data: any; fetchedAt: number }>();

  app.get("/api/chart", async (req, res) => {
    const rawSym = String(req.query.symbol ?? '').trim().toUpperCase();
    const range  = (String(req.query.range ?? '1d') as ChartRange);

    if (!rawSym || !/^[\^A-Z0-9&=\.\-/]{1,20}$/.test(rawSym)) {
      return res.status(400).json({ ok: false, error: 'Invalid symbol' });
    }
    if (!RANGE_MAP[range]) {
      return res.status(400).json({ ok: false, error: 'Invalid range' });
    }

    // Auto-append .NS for plain NSE stock symbols
    const ySymbol = (rawSym.startsWith('^') || rawSym.includes('=') || rawSym.includes('.'))
      ? rawSym
      : `${rawSym}.NS`;

    const cacheKey = `${ySymbol}:${range}`;
    // Cache: 5 min during market hours for intraday, longer for >=1mo
    const cacheTtl = range === '1d' || range === '5d'
      ? (isMarketHours() ? 5 * 60_000 : 30 * 60_000)
      : 6 * 60 * 60_000;

    const cached = chartCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
      return res.json(cached.data);
    }

    try {
      const { period, interval } = RANGE_MAP[range];
      const period2 = new Date();
      const period1 = new Date(period2.getTime() - period);
      const result  = await yahooFinance.chart(ySymbol, {
        period1, period2, interval: interval as any,
      } as any);

      const quotes = (result?.quotes ?? []) as any[];
      const points = quotes
        .filter((q) => q && q.close != null)
        .map((q) => ({
          t: new Date(q.date).getTime(),
          c: Math.round(q.close * 100) / 100,
        }));

      const payload = { ok: true, symbol: rawSym, range, points };
      chartCache.set(cacheKey, { data: payload, fetchedAt: Date.now() });
      res.json(payload);
    } catch (err) {
      console.error(`[/api/chart] ${ySymbol} ${range}:`, (err as Error).message);
      // Serve stale cache if available
      if (cached) return res.json(cached.data);
      res.status(200).json({ ok: false, symbol: rawSym, range, points: [] });
    }
  });

  app.get("/api/regulatory", async (req, res) => {
    // Cache for 10 minutes — regulatory updates are infrequent
    if (regulatoryCache && Date.now() - regulatoryCache.fetchedAt < 10 * 60_000) {
      return res.json(regulatoryCache.data);
    }
    try {
      const items: any[] = [];
      await Promise.allSettled(
        REGULATORY_FEEDS.map(async (feed) => {
          try {
            const response = await fetch(feed.url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Accept": "application/rss+xml, application/rdf+xml;q=0.8, application/atom+xml;q=0.6, application/xml;q=0.4, text/xml;q=0.4",
              },
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) return;
            const xml = await response.text();
            const parsed = await parser.parseString(xml);
            parsed.items.forEach((item: any) => {
              if (item.title && item.link) {
                items.push({
                  id: generateId(item.title),
                  title: item.title,
                  link: item.link,
                  pubDate: item.pubDate || new Date().toISOString(),
                  source: feed.category, // "sebi" | "rbi"
                });
              }
            });
          } catch (err) {
            console.error(`[regulatory] Error fetching ${feed.url}:`, err);
          }
        })
      );
      items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      const data = items.slice(0, 10);
      regulatoryCache = { data, fetchedAt: Date.now() };
      res.json(data);
    } catch (err) {
      console.error("[regulatory] fetch error:", err);
      if (regulatoryCache) return res.json(regulatoryCache.data);
      res.status(500).json({ error: "Failed to fetch regulatory feeds" });
    }
  });

  // ── Market Quiz ────────────────────────────────────────────────────────────

  /** Returns today's date in IST as YYYY-MM-DD */
  function getISTDate(): string {
    return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  /** Extract and validate a Supabase Bearer JWT from the Authorization header. */
  async function getAuthUser(req: Request): Promise<{ id: string; email?: string; name?: string } | null> {
    if (!supabaseAdmin) return null;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    const meta = data.user.user_metadata ?? {};
    return {
      id:    data.user.id,
      email: data.user.email,
      name:  meta.full_name || meta.name || data.user.phone || data.user.email || "Anonymous",
    };
  }

  /**
   * Evergreen market-literacy fallback used when Gemini keys are exhausted
   * or the news cache is empty. Persisted once per day so everyone sees the
   * same set, and so the /check and /submit endpoints stay consistent.
   */
  function getFallbackQuiz(today: string): QuizQuestion[] {
    const FALLBACK: Omit<QuizQuestion, "id">[] = [
      { question: "What does 'Nifty 50' represent on the NSE?",
        options: ["50 largest Indian banks", "Top 50 Indian companies by free-float market cap", "50 mid-cap stocks", "50 PSU stocks"],
        correct_index: 1, explanation: "Nifty 50 tracks the 50 largest, most liquid Indian companies weighted by free-float market cap across sectors.",
        news_source_url: "https://www.nseindia.com/", category: "indian", difficulty: "easy" },
      { question: "What is the 'GMP' in the context of an IPO?",
        options: ["Guaranteed Minimum Price", "Grey Market Premium", "Global Market Price", "Government-Mandated Price"],
        correct_index: 1, explanation: "GMP is the unofficial premium at which IPO shares trade in the grey market before listing — it's a sentiment indicator, not a guarantee.",
        news_source_url: "https://www.chittorgarh.com/", category: "ipo", difficulty: "easy" },
      { question: "Which regulator oversees the Indian securities market?",
        options: ["RBI", "SEBI", "IRDAI", "PFRDA"],
        correct_index: 1, explanation: "SEBI (Securities and Exchange Board of India) is the statutory regulator for stock exchanges, brokers, and listed companies.",
        news_source_url: "https://www.sebi.gov.in/", category: "sebi", difficulty: "easy" },
      { question: "A P/E ratio tells you...",
        options: ["The dividend yield", "Price paid per rupee of annual earnings", "Debt-to-equity ratio", "Book value per share"],
        correct_index: 1, explanation: "Price-to-Earnings = Price ÷ EPS. It shows how much investors are paying for each ₹1 of the company's annual earnings.",
        news_source_url: "https://www.moneycontrol.com/", category: "companies", difficulty: "medium" },
      { question: "What happens to bond prices when interest rates rise?",
        options: ["They rise", "They fall", "They stay the same", "Only coupon changes"],
        correct_index: 1, explanation: "Bond prices move inversely to interest rates. Newly issued bonds at higher yields make existing lower-coupon bonds less attractive.",
        news_source_url: "https://www.rbi.org.in/", category: "economy", difficulty: "medium" },
      { question: "'Circuit filter' in Indian markets refers to...",
        options: ["Trading fee tier", "Daily price movement limit before trading halts", "Brokerage discount", "Margin requirement"],
        correct_index: 1, explanation: "Exchanges apply upper/lower circuits (e.g. 5%, 10%, 20%) to individual stocks to prevent runaway moves; trading pauses when hit.",
        news_source_url: "https://www.nseindia.com/", category: "indian", difficulty: "medium" },
      { question: "Which of these is a defensive sector?",
        options: ["Real estate", "Consumer staples (FMCG)", "Auto", "Metals"],
        correct_index: 1, explanation: "FMCG/consumer-staples demand holds up during downturns (people keep buying soap & food), so they're classed as 'defensive'.",
        news_source_url: "https://www.livemint.com/", category: "companies", difficulty: "medium" },
      { question: "What does RBI's 'repo rate' directly influence?",
        options: ["Stock dividends", "Short-term cost of bank borrowing from RBI", "Gold import duty", "GST rates"],
        correct_index: 1, explanation: "The repo rate is what RBI charges commercial banks for short-term loans — it's the anchor for lending & deposit rates across the economy.",
        news_source_url: "https://www.rbi.org.in/", category: "rbi", difficulty: "medium" },
      { question: "A 'bull market' is characterised by...",
        options: ["Falling prices and pessimism", "Sustained rising prices and optimism", "Flat prices", "High volatility only"],
        correct_index: 1, explanation: "Bull = rising trend + positive sentiment over a sustained period (typically 20%+ rally from recent lows).",
        news_source_url: "https://economictimes.indiatimes.com/", category: "global", difficulty: "easy" },
      { question: "What is 'T+1 settlement' on Indian exchanges?",
        options: ["Trade settles the same day", "Trade settles 1 business day after execution", "Trade settles 2 days later", "Trade settles 1 week later"],
        correct_index: 1, explanation: "India moved to T+1 in 2023 — shares/funds move to buyer/seller one business day after the trade. Fastest retail settlement cycle globally.",
        news_source_url: "https://www.sebi.gov.in/", category: "sebi", difficulty: "hard" },

      { question: "What is 'SEBI' and what does it regulate?",
        options: ["State Electricity Board of India — power sector", "Securities and Exchange Board of India — stock markets", "Small Enterprises Business Initiative — SME loans", "State Export Bureau of India — exports"],
        correct_index: 1, explanation: "SEBI is India's capital market regulator. It oversees stock exchanges, listed companies, brokers, mutual funds, and investor protection.",
        news_source_url: "https://www.sebi.gov.in/", category: "sebi", difficulty: "easy" },

      { question: "What does 'FII' stand for in Indian markets?",
        options: ["Fixed Income Investment", "Foreign Institutional Investor", "Financial Inclusion Index", "Futures and Index Instrument"],
        correct_index: 1, explanation: "FIIs are overseas institutions (hedge funds, pension funds, insurance companies) that invest in Indian stocks and bonds. Their buying/selling significantly moves the market.",
        news_source_url: "https://www.sebi.gov.in/", category: "indian", difficulty: "easy" },

      { question: "What is a 'stop-loss' order?",
        options: ["An order to buy at market open", "An order that automatically sells if price falls below a set level", "A guaranteed profit target", "A block on further trading"],
        correct_index: 1, explanation: "A stop-loss triggers a sell automatically when a stock falls to a predefined price, limiting your downside without constant monitoring.",
        news_source_url: "https://www.nseindia.com/", category: "indian", difficulty: "medium" },

      { question: "What does 'upper circuit' mean for a stock?",
        options: ["Stock has reached its 52-week high", "Trading pauses because price rose by the daily limit", "The stock has been promoted to a higher index", "Broker margin requirement has increased"],
        correct_index: 1, explanation: "When a stock hits its upper circuit (e.g. +10% or +20%), buying orders freeze temporarily. It signals very strong demand but also prevents runaway speculation.",
        news_source_url: "https://www.nseindia.com/", category: "indian", difficulty: "medium" },

      { question: "What is 'market capitalisation'?",
        options: ["The total debt of a company", "Current share price × total shares outstanding", "Annual profit of the company", "Book value of all assets"],
        correct_index: 1, explanation: "Market cap = Price × Shares Outstanding. It tells you the total market value of a company. Large-cap in India is typically above ₹20,000 crore.",
        news_source_url: "https://www.bseindia.com/", category: "companies", difficulty: "easy" },

      { question: "What is a 'rights issue'?",
        options: ["Legal action by a shareholder", "Existing shareholders get the right to buy new shares at a discount", "Company buying back its own shares", "Merger with another company"],
        correct_index: 1, explanation: "In a rights issue, a company offers new shares to existing shareholders at a discounted price proportional to their current holding, raising fresh capital.",
        news_source_url: "https://www.sebi.gov.in/", category: "companies", difficulty: "medium" },

      { question: "Which of these is a commodity traded on MCX?",
        options: ["TCS shares", "Gold futures", "Government bonds", "Mutual fund units"],
        correct_index: 1, explanation: "MCX (Multi Commodity Exchange) trades futures in gold, silver, crude oil, copper, and agricultural products — not equities or bonds.",
        news_source_url: "https://www.mcxindia.com/", category: "commodity", difficulty: "easy" },

      { question: "What does a 'hawkish' central bank stance mean?",
        options: ["It plans to cut interest rates", "It leans toward raising rates to control inflation", "It will print more money", "It supports stock market growth"],
        correct_index: 1, explanation: "Hawkish = inflation-fighting mode. The central bank prefers higher interest rates to cool inflation, even if it slows growth. Opposite of 'dovish'.",
        news_source_url: "https://www.rbi.org.in/", category: "economy", difficulty: "hard" },

      { question: "What is 'short selling'?",
        options: ["Selling shares you own quickly", "Borrowing shares to sell, hoping to buy back cheaper later", "Selling fractional shares", "A type of futures contract"],
        correct_index: 1, explanation: "Short sellers borrow shares and sell them, betting the price will fall. They profit if they can repurchase at a lower price before returning the borrowed shares.",
        news_source_url: "https://www.sebi.gov.in/", category: "indian", difficulty: "hard" },

      { question: "What is the 'Sensex' based on?",
        options: ["100 BSE listed companies", "30 financially sound large-cap companies on BSE", "All companies on BSE", "Top 50 NSE companies"],
        correct_index: 1, explanation: "Sensex (BSE Sensitive Index) tracks 30 large, established companies on the Bombay Stock Exchange. It is India's oldest stock market index, launched in 1986.",
        news_source_url: "https://www.bseindia.com/", category: "indian", difficulty: "easy" },
    ];
    // Seed shuffle using today's date so order differs each day
    // but stays consistent for all users on the same day
    const dateNum = today.replace(/-/g, '');
    const seed = parseInt(dateNum.slice(-4), 10);
    const shuffled = [...FALLBACK].sort((a, b) => {
      const hashA = (a.question.charCodeAt(0) * seed) % 97;
      const hashB = (b.question.charCodeAt(0) * seed) % 97;
      return hashA - hashB;
    });

    const questions: QuizQuestion[] = shuffled.map((q, i) => ({
      ...q,
      id: `${today}_fallback_q${i + 1}`,
    }));
    return questions;
  }

  /**
   * Generate (or return cached) today's quiz from the live news cache.
   * Called internally by both /generate and /today.
   * Falls back to a static evergreen set if Gemini keys are exhausted or news is empty.
   */
  async function generateOrGetQuiz(): Promise<QuizQuestion[]> {
    const today = getISTDate();
    const cached = getQuizForDate(today);
    if (cached) return cached;

    if (!hasAvailableKey()) {
      const fallback = getFallbackQuiz(today);
      saveQuizForDate(today, fallback);
      console.log(`[quiz] Gemini unavailable — served ${fallback.length} fallback questions for ${today}`);
      return fallback;
    }

    // Pick up to 20 recent headlines (spread across categories for variety)
    const headlines = newsCache
      .slice(0, 60)
      .filter((n, i, arr) => arr.findIndex((x) => x.category === n.category) === i || i < 20)
      .slice(0, 20)
      .map((n) => ({ title: n.title, url: n.link, category: n.category }));

    if (headlines.length === 0) {
      const fallback = getFallbackQuiz(today);
      saveQuizForDate(today, fallback);
      console.log(`[quiz] No news available — served ${fallback.length} fallback questions for ${today}`);
      return fallback;
    }

    // Fetch yesterday's question topics to avoid repeating them
    const yesterday = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - 86_400_000)
      .toISOString().slice(0, 10);
    const yesterdayQuiz = getQuizForDate(yesterday);
    const usedTopics = yesterdayQuiz
      ? yesterdayQuiz.slice(0, 5).map(q => `- ${q.question.slice(0, 80)}`).join('\n')
      : 'None';

    const prompt = `Based on these financial news headlines from today:
${headlines.map((h, i) => `${i + 1}. [${h.category.toUpperCase()}] ${h.title} (${h.url})`).join('\n')}

Generate exactly 20 multiple choice questions testing market knowledge. Mix difficulty (4 easy, 8 medium, 8 hard). Rules:
- Each question must relate to one of the headlines above
- Include the source article URL in news_source_url
- Options must be plausible (no obviously wrong distractors)
- Explanation should teach the reader something useful
- Category must be one of: indian, global, companies, economy, banking, commodity, crypto, ipo
- IMPORTANT: Do NOT repeat or closely rephrase these topics from yesterday's quiz:
${usedTopics}

Return a JSON array of exactly 20 objects.`;

    try {
      const responseText = await geminiStructuredCall(prompt, {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question:        { type: Type.STRING },
              options:         { type: Type.ARRAY, items: { type: Type.STRING } },
              correct_index:   { type: Type.INTEGER },
              explanation:     { type: Type.STRING },
              news_source_url: { type: Type.STRING },
              category:        { type: Type.STRING },
              difficulty:      { type: Type.STRING },
            },
            required: ["question", "options", "correct_index", "explanation", "news_source_url", "category", "difficulty"],
          },
        },
      });

      const raw = JSON.parse(responseText || "[]") as QuizQuestion[];
      if (raw.length === 0) throw new Error("Empty Gemini response");
      const questions: QuizQuestion[] = raw.slice(0, 20).map((q, i) => ({
        ...q,
        id: `${today}_q${i + 1}`,
        options: q.options.slice(0, 4),
        correct_index: Math.max(0, Math.min(3, q.correct_index)),
        difficulty: (["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium") as QuizQuestion["difficulty"],
      }));

      saveQuizForDate(today, questions);
      console.log(`[quiz] Generated ${questions.length} questions for ${today}`);
      return questions;
    } catch (err: any) {
      console.error(`[quiz] Generation failed (${err?.message ?? err}) — serving fallback`);
      const fallback = getFallbackQuiz(today);
      saveQuizForDate(today, fallback);
      return fallback;
    }
  }

  /**
   * POST /api/quiz/generate — force-generate today's quiz (admin only).
   * Pass ?force=1 to regenerate even if a quiz already exists for today.
   */
  app.post("/api/quiz/generate", requireAdmin, async (req, res) => {
    const today = getISTDate();
    if (req.query.force !== "1") {
      const existing = getQuizForDate(today);
      if (existing) return res.json({ cached: true, date: today, count: existing.length, questions: existing });
    }

    try {
      const questions = await generateOrGetQuiz();
      res.json({ cached: false, date: today, count: questions.length, questions });
    } catch (err: any) {
      console.error("[quiz/generate]", err);
      res.status(500).json({ error: err.message ?? "Generation failed" });
    }
  });

  /**
   * GET /api/quiz/today — returns today's 5 questions WITHOUT correct answers.
   * Auto-generates on first request of the day.
   */
  app.get("/api/quiz/today", async (req, res) => {
    try {
      const questions = await generateOrGetQuiz();
      const today = getISTDate();

      // Strip answers before sending to client
      const safe = questions.map(({ correct_index: _ci, explanation: _ex, ...rest }) => rest);

      // Return session state for authenticated users (auth-optional)
      let sessionState: { current_q: number; answers: any[]; coins_so_far: number } | null = null;
      try {
        const sessionUser = await getAuthUser(req);
        if (sessionUser) {
          const alreadyDone = getLocalAttempt(sessionUser.id, today);
          if (!alreadyDone) {
            const sess = getQuizSession(sessionUser.id, today);
            if (sess) {
              sessionState = {
                current_q:    sess.current_q,
                answers:      JSON.parse(sess.answers_json),
                coins_so_far: sess.coins_so_far,
              };
            }
          }
        }
      } catch { /* non-fatal — session lookup failure shouldn't break the quiz */ }

      res.json({ date: today, count: safe.length, questions: safe, session: sessionState });
    } catch (err: any) {
      console.error("[quiz/today]", err);
      res.status(503).json({ error: err.message ?? "Quiz unavailable" });
    }
  });

  /* ─── Per-user rate limiter for quiz check endpoint ───
   * Prevents coin-farming abuse by limiting answer reveals.
   * Sliding window: max 20 requests per user per hour.
   * Cleanup runs every 10 minutes to prevent memory leaks. */
  const QUIZ_RATE_LIMIT   = 30;            // max requests per window (30 > 20 questions)
  const QUIZ_RATE_WINDOW  = 60 * 60 * 1000; // 1 hour in ms
  const quizRateBuckets   = new Map<string, number[]>(); // userId → sorted timestamps

  // Periodic cleanup: drop entries older than the window
  setInterval(() => {
    const cutoff = Date.now() - QUIZ_RATE_WINDOW;
    for (const [uid, timestamps] of quizRateBuckets) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) quizRateBuckets.delete(uid);
      else quizRateBuckets.set(uid, fresh);
    }
  }, 10 * 60 * 1000); // every 10 min

  /**
   * POST /api/quiz/check — reveal the correct answer for a single question.
   * Called immediately after the user selects an option, so the UI can show green/red feedback.
   * Requires auth so answers can't be pre-fetched anonymously.
   * Body: { question_id: string, answer_index: number }
   */
  app.post("/api/quiz/check", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to reveal answers" });

    // ── Per-user sliding-window rate limit ──
    const now = Date.now();
    const cutoff = now - QUIZ_RATE_WINDOW;
    let timestamps = quizRateBuckets.get(user.id) || [];
    timestamps = timestamps.filter((t) => t > cutoff); // drop expired
    if (timestamps.length >= QUIZ_RATE_LIMIT) {
      const retryAfterSecs = Math.ceil((timestamps[0] + QUIZ_RATE_WINDOW - now) / 1000);
      res.set("Retry-After", String(retryAfterSecs));
      return res.status(429).json({
        error: "Too many quiz answer requests. Try again later.",
        retry_after_secs: retryAfterSecs,
      });
    }
    timestamps.push(now);
    quizRateBuckets.set(user.id, timestamps);

    const { question_id, answer_index } = req.body as {
      question_id?: string;
      answer_index?: number;
    };
    if (!question_id || typeof answer_index !== "number") {
      return res.status(400).json({ error: "question_id and answer_index required" });
    }

    const today = getISTDate();
    const questions = getQuizForDate(today);
    if (!questions) return res.status(404).json({ error: "No quiz for today" });

    const q = questions.find((q) => q.id === question_id);
    if (!q) return res.status(404).json({ error: "Question not found" });

    const isCorrect = answer_index === q.correct_index;
    const qIdx      = questions.findIndex((x) => x.id === question_id);

    // ── Guard: return stored result if already answered (prevents double coin earn on resume) ──
    const existingSession  = getQuizSession(user.id, today);
    const sessionAnswers: any[] = existingSession ? JSON.parse(existingSession.answers_json) : [];
    if (sessionAnswers[qIdx]) {
      return res.json({
        correct_index:   q.correct_index,
        correct:         sessionAnswers[qIdx].correct as boolean,
        explanation:     q.explanation,
        news_source_url: q.news_source_url,
        coins_awarded:   0,
      });
    }

    // ── Award coins immediately for correct answers ─────────────────────────
    let coins_awarded = 0;
    if (isCorrect && supabaseAdmin) {
      try {
        const { data: prof } = await supabaseAdmin
          .from("profiles").select("investor_iq").eq("id", user.id).maybeSingle();
        const tierMult   = getIQTierMultiplier(prof?.investor_iq ?? IQ_BASE);
        const perCorrect = Math.round(QUIZ_CORRECT_COINS * tierMult);
        ensureSqliteUser(user.id, user.name ?? undefined, user.email ?? undefined);
        addCoins(user.id, perCorrect, "QUIZ_CORRECT", today,
          `Quiz Q${qIdx + 1} correct · ${tierMult}× (+${perCorrect})`);
        coins_awarded = perCorrect;
      } catch (e) {
        console.error("[quiz/check] coin award error:", e);
      }
    }

    // ── Persist answer to session ────────────────────────────────────────────
    try {
      sessionAnswers[qIdx] = { q_id: question_id, q_idx: qIdx, selected: answer_index, correct: isCorrect };
      upsertQuizSession({
        user_id:      user.id,
        date:         today,
        answers_json: JSON.stringify(sessionAnswers),
        current_q:    qIdx + 1,   // store N (past end) when last Q answered — avoids resume landing back on it
        coins_so_far: (existingSession?.coins_so_far ?? 0) + coins_awarded,
        started_at:   existingSession?.started_at ?? Date.now(),
        updated_at:   Date.now(),
      });
    } catch (e) {
      console.error("[quiz/check] session save error:", e);
    }

    res.json({
      correct_index:   q.correct_index,
      correct:         isCorrect,
      explanation:     q.explanation,
      news_source_url: q.news_source_url,
      coins_awarded,
    });
  });

  /**
   * POST /api/quiz/submit — grade answers, update investor_iq / streak / coins.
   * Body: { answers: number[], time_taken_secs: number }
   * Header: Authorization: Bearer <supabase_jwt>
   */
  app.post("/api/quiz/submit", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to submit answers" });
    if (!supabaseAdmin) return res.status(503).json({ error: "Auth service unavailable" });

    const { answers, time_taken_secs } = req.body as { answers?: number[]; time_taken_secs?: number };
    if (!Array.isArray(answers) || answers.length === 0)
      return res.status(400).json({ error: "answers must be a non-empty array of indices" });
    if (typeof time_taken_secs !== "number" || time_taken_secs <= 0)
      return res.status(400).json({ error: "time_taken_secs must be a positive number" });

    const today = getISTDate();
    const questions = getQuizForDate(today);
    if (!questions) return res.status(404).json({ error: "No quiz available for today" });

    if (answers.length !== questions.length)
      return res.status(400).json({ error: `answers must be an array of ${questions.length} indices` });

    // Dedup check — SQLite first (always available, no Supabase dependency)
    const existingLocal = getLocalAttempt(user.id, today);
    if (existingLocal) {
      return res.status(409).json({ error: "Already submitted today", score: existingLocal.score });
    }

    // Grade answers
    const results = questions.map((q, i) => ({
      question_id:    q.id,
      selected_index: answers[i],
      correct_index:  q.correct_index,
      correct:        answers[i] === q.correct_index,
      explanation:    q.explanation,
      question:       q.question,
      options:        q.options,
      category:       q.category,
    }));
    const score = results.filter((r) => r.correct).length;

    // Fetch current profile for IQ/streak/tier calc (non-fatal if missing)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("investor_iq, streak_count, streak_last_date, coins")
      .eq("id", user.id)
      .maybeSingle();

    const currentIQ    = profile?.investor_iq ?? IQ_BASE;
    const tierMult     = getIQTierMultiplier(currentIQ);
    const perCorrect   = Math.round(QUIZ_CORRECT_COINS * tierMult);
    const perfectBonus = score === questions.length ? Math.round(QUIZ_PERFECT_BONUS * tierMult) : 0;
    const perQTotal    = score * perCorrect;

    // Coins already awarded per-question via check endpoint
    const sess           = getQuizSession(user.id, today);
    const alreadyAwarded = sess?.coins_so_far ?? 0;
    const remainingCoins = Math.max(0, perQTotal - alreadyAwarded);
    const coins_earned   = remainingCoins + perfectBonus;

    let newStreak = 1;
    if (profile?.streak_last_date) {
      const yesterday = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - 86_400_000)
        .toISOString()
        .slice(0, 10);
      newStreak = profile.streak_last_date === yesterday ? (profile.streak_count ?? 0) + 1 : 1;
    }

    const iqDelta = calculateQuizIQDelta({
      correct:         score,
      wrong:           questions.length - score,
      streak_days:     newStreak,
      time_taken_secs: time_taken_secs ?? 600,
      question_count:  questions.length,
    });
    const newIQ    = clampIQ(currentIQ + iqDelta);
    const newCoins = (profile?.coins ?? 0) + alreadyAwarded + coins_earned;

    // ── 1. Save to SQLite FIRST — source of truth, never fails ────────────
    saveLocalAttempt({
      user_id:      user.id,
      date:         today,
      score,
      time_secs:    time_taken_secs,
      answers_json: JSON.stringify(results),
      coins_earned: perQTotal + perfectBonus,  // record total for history
      iq_change:    iqDelta,
      created_at:   Date.now(),
    });

    // ── 2. Award remaining coins (top-up from partial session + perfect bonus) ─
    try {
      ensureSqliteUser(user.id, user.name ?? undefined, user.email ?? undefined);
      if (remainingCoins > 0) {
        addCoins(user.id, remainingCoins, "QUIZ_CORRECT", today,
          `Market Quiz top-up: ${score}/${questions.length} correct · ${tierMult}× (+${remainingCoins})`);
      }
      if (perfectBonus > 0) {
        addCoins(user.id, perfectBonus, "QUIZ_BONUS", today,
          `🧠 Perfect Score · ${tierMult}× tier (+${perfectBonus} coins)`);
      }
    } catch (coinErr) {
      console.error("[quiz/submit] coin ledger error:", coinErr);
    }

    // ── 2b. Clear the in-progress session ─────────────────────────────────
    try { deleteQuizSession(user.id, today); } catch { /* non-fatal */ }

    // ── 3. Sync to Supabase (best-effort — non-fatal if schema is stale) ──
    try {
      const { error: insertErr } = await supabaseAdmin.from("quiz_attempts").insert({
        user_id:         user.id,
        date:            today,
        score,
        time_taken_secs,
        answers_json:    results,
        coins_earned,
        iq_change:       iqDelta,
      });
      if (insertErr) {
        console.error("[quiz/submit] Supabase sync failed (non-fatal):", insertErr.message, insertErr.code);
      } else {
        await supabaseAdmin.from("profiles").update({
          investor_iq:      newIQ,
          streak_count:     newStreak,
          streak_last_date: today,
          coins:            newCoins,
        }).eq("id", user.id);
      }
    } catch (sbErr) {
      console.error("[quiz/submit] Supabase sync error (non-fatal):", sbErr);
    }

    // ── 4. Always respond success — SQLite is authoritative ───────────────
    res.json({
      date:            today,
      score,
      total:           questions.length,
      coins_earned:    perQTotal + perfectBonus,  // total including check-awarded
      tier_multiplier: tierMult,
      new_iq:          newIQ,
      new_streak:      newStreak,
      results,
    });
  });

  /**
   * GET /api/quiz/leaderboard?period=daily|weekly|alltime
   * Returns top 20 users for the requested period.
   */
  app.get("/api/quiz/leaderboard", async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Auth service unavailable" });

    const period = (req.query.period as string) || "daily";
    const today  = getISTDate();

    try {
      if (period === "daily") {
        // Rank by IQ delta earned today — IQ bakes in correctness + speed + streak.
        // Score + time kept as tie-breakers and for UI context.
        const { data, error } = await supabaseAdmin
          .from("quiz_attempts")
          .select("user_id, score, iq_change, time_taken_secs, coins_earned, profiles(name, avatar, investor_iq)")
          .eq("date", today)
          .order("iq_change", { ascending: false })
          .order("score",     { ascending: false })
          .order("time_taken_secs", { ascending: true })
          .limit(20);
        if (error) throw error;
        return res.json({ period, date: today, leaderboard: data ?? [] });
      }

      // Weekly / monthly / all-time: fetch raw attempts and aggregate in JS
      let sinceDate: string;
      if (period === "weekly") {
        sinceDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - 7 * 86_400_000).toISOString().slice(0, 10);
      } else if (period === "monthly") {
        // First day of the current IST month
        const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        sinceDate = `${ist.toISOString().slice(0, 7)}-01`;
      } else {
        sinceDate = "2000-01-01";
      }

      const { data, error } = await supabaseAdmin
        .from("quiz_attempts")
        .select("user_id, score, iq_change, coins_earned, date, profiles(name, avatar, investor_iq)")
        .gte("date", sinceDate)
        .limit(500);
      if (error) throw error;

      // Aggregate by user — rank by total IQ gained, fall back to score then days played
      const byUser: Record<string, {
        name: string; avatar: string | null; investor_iq: number;
        total_iq_gained: number; total_score: number; days_played: number; total_coins: number;
      }> = {};
      for (const row of (data ?? [])) {
        const p = (row as any).profiles;
        if (!byUser[row.user_id]) {
          byUser[row.user_id] = { name: p?.name ?? "?", avatar: p?.avatar ?? null, investor_iq: p?.investor_iq ?? 0, total_iq_gained: 0, total_score: 0, days_played: 0, total_coins: 0 };
        }
        byUser[row.user_id].total_iq_gained += row.iq_change ?? 0;
        byUser[row.user_id].total_score     += row.score;
        byUser[row.user_id].days_played     += 1;
        byUser[row.user_id].total_coins     += row.coins_earned;
      }

      const leaderboard = Object.entries(byUser)
        .map(([user_id, s]) => ({ user_id, ...s }))
        .sort((a, b) =>
          b.total_iq_gained - a.total_iq_gained ||
          b.total_score     - a.total_score     ||
          b.days_played     - a.days_played
        )
        .slice(0, 20);

      res.json({ period, since: sinceDate, leaderboard });
    } catch (err: any) {
      console.error("[quiz/leaderboard]", err);
      res.status(500).json({ error: err.message ?? "Leaderboard unavailable" });
    }
  });

  // ── End Market Quiz ─────────────────────────────────────────────────────────

  // ── Nifty Predictions ─────────────────────────────────────────────────────────

  /**
   * POST /api/quiz/predict
   * Submit today's Nifty 50 up/down prediction.
   * Body: { prediction: "up" | "down" }
   * Auth: Bearer JWT
   */
  app.post("/api/quiz/predict", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to submit a prediction" });

    const { prediction } = req.body as { prediction?: string };
    if (prediction !== "up" && prediction !== "down")
      return res.status(400).json({ error: "prediction must be 'up' or 'down'" });

    const today = getISTDate();
    const existing = getPrediction(user.id, today);
    if (existing) {
      return res.status(409).json({
        error:      "Already predicted today",
        prediction: existing.prediction,
        result:     existing.result,
      });
    }

    savePrediction({ user_id: user.id, date: today, prediction });
    res.json({
      date:    today,
      prediction,
      result:  "pending",
      message: "Prediction saved! Results released at 3:30 PM IST after market close.",
    });
  });

  /**
   * GET /api/quiz/predict/result
   * Returns yesterday's resolved prediction and today's pending prediction for the caller.
   * Auth: Bearer JWT
   */
  app.get("/api/quiz/predict/result", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to view your prediction" });

    const istNow    = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const today     = istNow.toISOString().slice(0, 10);
    const yesterday = new Date(+istNow - 86_400_000).toISOString().slice(0, 10);

    res.json({
      today:     getPrediction(user.id, today)     ?? null,
      yesterday: getPrediction(user.id, yesterday) ?? null,
    });
  });

  // ── End Nifty Predictions ─────────────────────────────────────────────────────

  // ── Instamojo Payment ─────────────────────────────────────────────────────────

  const PAYMENT_PLANS = {
    daily:   { amount: 1,   label: 'Daily',   durationMs: 1   * 24 * 60 * 60 * 1000 },
    monthly: { amount: 30,  label: 'Monthly', durationMs: 30  * 24 * 60 * 60 * 1000 },
    yearly:  { amount: 299, label: 'Yearly',  durationMs: 365 * 24 * 60 * 60 * 1000 },
  } as const;
  type PlanKey = keyof typeof PAYMENT_PLANS;

  async function activateProForUser(
    userId: string,
    plan: PlanKey,
  ): Promise<string> {
    if (!supabaseAdmin) throw new Error("Auth service unavailable");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("pro_expires_at")
      .eq("id", userId)
      .single();
    const base = profile?.pro_expires_at
      ? Math.max(Date.now(), new Date(profile.pro_expires_at).getTime())
      : Date.now();
    const newExpiry = new Date(base + PAYMENT_PLANS[plan].durationMs).toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_pro: true, pro_expires_at: newExpiry })
      .eq("id", userId);
    if (error) throw new Error("Profile update failed");
    return newExpiry;
  }

  /**
   * POST /api/payment/create-link
   * Creates an Instamojo payment request and returns a redirect URL.
   * Body: { plan: 'daily'|'monthly'|'yearly', user_id, email }
   * Auth: Bearer JWT (or pass user_id from frontend after auth)
   */
  app.post("/api/payment/create-link", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to subscribe" });
    if (!supabaseAdmin) return res.status(503).json({ error: "Auth service unavailable" });

    const { plan } = req.body as { plan?: string };
    if (!plan || !(plan in PAYMENT_PLANS)) {
      return res.status(400).json({ error: "Invalid plan. Choose: daily, monthly, yearly" });
    }
    const { amount, label } = PAYMENT_PLANS[plan as PlanKey];
    const appUrl = process.env.APP_URL ?? "https://marketsamachar.in";

    // Fetch email from profile/user
    const email = user.email ?? req.body.email ?? "";
    if (!email) return res.status(400).json({ error: "Email required for payment" });

    try {
      const data = await instamojoRequest("POST", "/payment-requests/", {
        purpose:                `Market Samachar PRO — ${label}`,
        amount:                 String(amount),
        buyer_name:             email.split("@")[0],
        email,
        redirect_url:           `${appUrl}/payment/success?plan=${plan}&user=${user.id}`,
        webhook:                `${appUrl}/api/payment/webhook`,
        allow_repeated_payments: "False",
        send_email:             "True",
      });

      const requestId = data.payment_request?.id;
      const paymentUrl = data.payment_request?.longurl ?? data.payment_request?.url;

      if (!requestId || !paymentUrl) {
        throw new Error("Instamojo did not return a payment URL");
      }

      // Log pending payment in SQLite
      savePayment({
        id:         requestId,
        user_id:    user.id,
        email,
        amount,
        plan,
        created_at: Date.now(),
      });

      console.log(`[payment] Created ${plan} request ${requestId} for ${user.id}`);
      res.json({ payment_url: paymentUrl, request_id: requestId });
    } catch (err: any) {
      console.error("[payment/create-link]", err.response?.data ?? err.message);
      res.status(500).json({ error: err.message ?? "Failed to create payment link" });
    }
  });

  /**
   * POST /api/payment/webhook
   * Instamojo posts here on every payment event.
   * Verifies MAC, checks status === 'Credit', activates Pro.
   */
  app.post("/api/payment/webhook", express.urlencoded({ extended: false }), async (req, res) => {
    const {
      payment_id,
      payment_request_id,
      buyer,
      status,
      amount,
      fees,
      mac,
    } = req.body as Record<string, string>;

    // Verify HMAC-SHA1 MAC
    const salt = process.env.INSTAMOJO_SALT;
    if (salt) {
      const message = [payment_id, payment_request_id, buyer, status, amount, fees].join("|");
      const expected = crypto.createHmac("sha1", salt).update(message).digest("hex");
      if (expected !== mac) {
        console.warn("[payment/webhook] MAC mismatch — possible spoofed request");
        return res.status(400).json({ error: "Invalid MAC" });
      }
    }

    if (status !== "Credit") {
      console.log(`[payment/webhook] Non-credit status "${status}" for ${payment_request_id}`);
      markPaymentFailed(payment_request_id);
      return res.json({ received: true });
    }

    // Mark payment successful in SQLite
    markPaymentSuccess(payment_request_id, payment_id);

    // Look up user from payments table → activate Pro
    if (supabaseAdmin) {
      try {
        // Find the payment record to get user_id + plan
        const row = (global as any).__db?.prepare(
          "SELECT user_id, plan FROM payments WHERE id = ? LIMIT 1"
        )?.get(payment_request_id) as { user_id: string; plan: string } | undefined;

        if (row) {
          const expiry = await activateProForUser(row.user_id, row.plan as PlanKey);
          console.log(`[payment/webhook] Activated ${row.plan} Pro for ${row.user_id} until ${expiry}`);
        }
      } catch (err: any) {
        console.error("[payment/webhook] Pro activation failed:", err.message);
      }
    }

    res.json({ received: true, status: "processed" });
  });

  /**
   * POST /api/payment/apply-reward
   * Grants free Pro days to a user (quiz winners, admin grants).
   * Body: { user_id, days, reason }
   * Protected: admin session required.
   */
  app.post("/api/payment/apply-reward", requireAdmin, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "Auth service unavailable" });

    const { user_id, days, reason } = req.body as {
      user_id?: string; days?: number; reason?: string;
    };
    if (!user_id || !days || days < 1) {
      return res.status(400).json({ error: "user_id and days (>0) required" });
    }

    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("pro_expires_at")
        .eq("id", user_id)
        .single();

      const base = profile?.pro_expires_at
        ? Math.max(Date.now(), new Date(profile.pro_expires_at).getTime())
        : Date.now();
      const newExpiry = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ is_pro: true, pro_expires_at: newExpiry })
        .eq("id", user_id);

      if (error) throw new Error(error.message);

      console.log(`[payment/reward] ${days}d Pro → ${user_id} (${reason ?? "no reason"})`);
      res.json({ success: true, user_id, days, pro_expires_at: newExpiry });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to apply reward" });
    }
  });

  // ── End Instamojo Payment ─────────────────────────────────────────────────────

  // ── Certificates ──────────────────────────────────────────────────────────────

  /** Generate a unique cert ID: MS-YYYY-XXXXX (5 random alphanumeric chars) */
  function generateCertId(): string {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rand = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `MS-${year}-${rand}`;
  }

  /**
   * POST /api/certificate/issue
   * Issues (or retrieves) a certificate for the authenticated user.
   * Only valid if streak >= 30 and it's a 30-day milestone.
   */
  app.post("/api/certificate/issue", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to claim your certificate" });
    if (!supabaseAdmin) return res.status(503).json({ error: "Auth service unavailable" });

    // Fetch current profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, investor_iq, streak_count")
      .eq("id", user.id)
      .single();

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const streak = profile.streak_count ?? 0;
    if (streak < 30 || streak % 30 !== 0) {
      return res.status(403).json({
        error: `Certificate requires a 30-day milestone. Current streak: ${streak}`,
        streak,
      });
    }

    // Check if a cert already exists for this exact streak milestone
    const { data: existing } = await supabaseAdmin
      .from("certificates")
      .select("id, issued_at, iq_score, iq_title, iq_emoji, streak_days")
      .eq("user_id", user.id)
      .eq("streak_days", streak)
      .maybeSingle();

    if (existing) {
      // Re-issue existing cert data (idempotent)
      const verifyUrl = `${process.env.APP_URL ?? 'https://marketsamachar.in'}/certificate/verify/${existing.id}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200, color: { dark: '#ffcc44', light: '#07070e' } });
      return res.json({ ...existing, user_name: profile.name ?? 'Anonymous', qr_data_url: qrDataUrl, verify_url: verifyUrl });
    }

    // Create new certificate
    const certId = generateCertId();
    const titleInfo = await import('./src/lib/iq-calculator.ts').then(m => m.getTitleFromIQ(profile.investor_iq ?? 300));
    const verifyUrl = `${process.env.APP_URL ?? 'https://marketsamachar.in'}/certificate/verify/${certId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200, color: { dark: '#ffcc44', light: '#07070e' } });

    const { error: insertErr } = await supabaseAdmin.from("certificates").insert({
      id:          certId,
      user_id:     user.id,
      user_name:   profile.name ?? 'Anonymous',
      iq_score:    profile.investor_iq ?? 300,
      iq_title:    titleInfo.title,
      iq_emoji:    titleInfo.emoji,
      streak_days: streak,
    });

    if (insertErr) {
      console.error("[certificate/issue]", insertErr);
      return res.status(500).json({ error: "Failed to issue certificate" });
    }

    console.log(`[certificate] Issued ${certId} to user ${user.id} — streak ${streak}`);
    res.json({
      id:          certId,
      user_name:   profile.name ?? 'Anonymous',
      iq_score:    profile.investor_iq ?? 300,
      iq_title:    titleInfo.title,
      iq_emoji:    titleInfo.emoji,
      streak_days: streak,
      issued_at:   new Date().toISOString(),
      qr_data_url: qrDataUrl,
      verify_url:  verifyUrl,
    });
  });

  // Alias: POST /api/certificate/generate → same as /api/certificate/issue
  // Registered as a separate route using a shared forward
  app.post("/api/certificate/generate", async (req, res) => {
    // Forward to the issue handler by mutating the request and re-dispatching.
    // We reuse the exact same logic inline here for safety.
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to claim your certificate" });
    if (!supabaseAdmin) return res.status(503).json({ error: "Auth service unavailable" });
    const { data: profile } = await supabaseAdmin.from("profiles").select("name, investor_iq, streak_count").eq("id", user.id).single();
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    const streak = profile.streak_count ?? 0;
    if (streak < 30 || streak % 30 !== 0) return res.status(403).json({ error: `Certificate requires a 30-day milestone. Current streak: ${streak}`, streak });
    const { data: existing } = await supabaseAdmin.from("certificates").select("id, issued_at, iq_score, iq_title, iq_emoji, streak_days").eq("user_id", user.id).eq("streak_days", streak).maybeSingle();
    if (existing) {
      const verifyUrl = `${process.env.APP_URL ?? 'https://marketsamachar.in'}/certificate/verify/${existing.id}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200, color: { dark: '#ffcc44', light: '#07070e' } });
      return res.json({ ...existing, user_name: profile.name ?? 'Anonymous', qr_data_url: qrDataUrl, verify_url: verifyUrl });
    }
    const certId = generateCertId();
    const titleInfo = await import('./src/lib/iq-calculator.ts').then(m => m.getTitleFromIQ(profile.investor_iq ?? 300));
    const verifyUrl = `${process.env.APP_URL ?? 'https://marketsamachar.in'}/certificate/verify/${certId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200, color: { dark: '#ffcc44', light: '#07070e' } });
    const { error: insertErr } = await supabaseAdmin.from("certificates").insert({ id: certId, user_id: user.id, user_name: profile.name ?? 'Anonymous', iq_score: profile.investor_iq ?? 300, iq_title: titleInfo.title, iq_emoji: titleInfo.emoji, streak_days: streak });
    if (insertErr) { console.error("[certificate/generate]", insertErr); return res.status(500).json({ error: "Failed to issue certificate" }); }
    console.log(`[certificate] Generated ${certId} for user ${user.id} — streak ${streak}`);
    res.json({ id: certId, user_name: profile.name ?? 'Anonymous', iq_score: profile.investor_iq ?? 300, iq_title: titleInfo.title, iq_emoji: titleInfo.emoji, streak_days: streak, issued_at: new Date().toISOString(), qr_data_url: qrDataUrl, verify_url: verifyUrl });
  });

  /**
   * GET /certificate/verify/:cert-id
   * Public HTML verification page — linked from QR code on the certificate.
   * Optimised for LinkedIn link preview (og:* meta tags included).
   */
  app.get("/certificate/verify/:certId", async (req, res) => {
    const { certId } = req.params;
    if (!supabaseAdmin) {
      return res.status(503).send('<h1>Verification service unavailable</h1>');
    }

    const { data: cert } = await supabaseAdmin
      .from("certificates")
      .select("id, user_name, iq_score, iq_title, iq_emoji, streak_days, issued_at, is_valid")
      .eq("id", certId)
      .maybeSingle();

    if (!cert) {
      return res.status(404).send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><title>Certificate Not Found — Market Samachar</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>body{margin:0;background:#07070e;color:#e8eaf0;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;}
h1{color:#ff4466;font-family:'DM Mono',monospace;font-size:1.4rem;letter-spacing:.06em;}p{color:#556688;font-size:.9rem;}a{color:#00ff88;text-decoration:none;}
</style></head>
<body><div><h1>CERTIFICATE NOT FOUND</h1><p>ID: ${certId}</p><p><a href="/">← Market Samachar</a></p></div></body></html>`);
    }

    const issueDate = new Date(cert.issued_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const appUrl = process.env.APP_URL ?? 'https://marketsamachar.in';
    const ogTitle = `${cert.user_name} — Market Samachar Certified`;
    const ogDesc = `${cert.iq_emoji} ${cert.iq_title} | IQ: ${cert.iq_score} | ${cert.streak_days}-day streak | Market Quiz`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ogTitle}</title>
<meta name="description" content="${ogDesc}">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:image" content="${appUrl}/ms-og-1200x630.svg">
<meta property="og:url" content="${appUrl}/certificate/verify/${cert.id}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07070e;color:#e8eaf0;font-family:'DM Sans',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem}
.card{background:#0d0d1e;border:1px solid #1e1e2e;border-top:3px solid #ffcc44;border-radius:14px;max-width:520px;width:100%;overflow:hidden}
.header{background:#07070e;border-bottom:1px solid #1e1e2e;padding:.75rem 1.25rem;display:flex;align-items:center;gap:.5rem}
.dot{width:8px;height:8px;border-radius:50%;background:#00ff88}
.brand{color:#00ff88;font-family:'DM Mono',monospace;font-size:.65rem;text-transform:uppercase;letter-spacing:.1em}
.body{padding:2rem;text-align:center}
.valid-badge{display:inline-flex;align-items:center;gap:.4rem;background:#00ff8818;border:1px solid #00ff8840;color:#00ff88;font-family:'DM Mono',monospace;font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;padding:.25rem .75rem;border-radius:20px;margin-bottom:1.5rem}
.cert-title{font-family:'DM Mono',monospace;font-size:.75rem;color:#556688;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem}
.name{font-size:2rem;font-weight:700;color:#ffcc44;margin-bottom:.5rem;line-height:1.2}
.subtitle{color:#8899aa;font-size:.9rem;margin-bottom:.25rem}
.iq-line{font-family:'DM Mono',monospace;font-size:1rem;color:#e8eaf0;margin-bottom:1.5rem}
.meta{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-top:1.5rem}
.meta-item{background:#07070e;border:1px solid #1e1e2e;border-radius:8px;padding:.5rem .875rem;text-align:center}
.meta-label{font-family:'DM Mono',monospace;font-size:.6rem;color:#334466;text-transform:uppercase;letter-spacing:.06em}
.meta-value{font-family:'DM Mono',monospace;font-size:.85rem;color:#8899aa;margin-top:.15rem}
.divider{height:1px;background:#1e1e2e;margin:1.5rem 0}
.invalid-notice{background:#ff446610;border:1px solid #ff446630;border-radius:8px;padding:.75rem;margin-bottom:1rem}
.invalid-notice p{color:#ff4466;font-family:'DM Mono',monospace;font-size:.7rem;text-transform:uppercase}
.footer-link{color:#556688;font-family:'DM Mono',monospace;font-size:.7rem;text-decoration:none;display:inline-flex;align-items:center;gap:.25rem;margin-top:1.5rem}
.footer-link:hover{color:#00ff88}
.streak-badge{display:inline-flex;align-items:center;gap:.3rem;background:#ff9f3b18;border:1px solid #ff9f3b30;color:#ff9f3b;font-family:'DM Mono',monospace;font-size:.7rem;padding:.2rem .6rem;border-radius:20px}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="dot"></div>
    <span class="brand">Market Samachar — Certificate Verification</span>
  </div>
  <div class="body">
    ${cert.is_valid
      ? `<div class="valid-badge">✓ Verified — This certificate is authentic</div>`
      : `<div class="invalid-notice"><p>⚠ This certificate has been revoked</p></div>`
    }
    <p class="cert-title">Market Samachar Certified</p>
    <h1 class="name">${cert.user_name}</h1>
    <p class="subtitle">has demonstrated consistent market knowledge</p>
    <p class="iq-line">${cert.iq_emoji} Investor IQ: ${cert.iq_score} — ${cert.iq_title}</p>
    <span class="streak-badge">🔥 ${cert.streak_days}-day streak</span>
    <div class="divider"></div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Certificate ID</div>
        <div class="meta-value">${cert.id}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Issued On</div>
        <div class="meta-value">${issueDate}</div>
      </div>
    </div>
    <br>
    <a href="${appUrl}" class="footer-link">← marketsamachar.in</a>
  </div>
</div>
</body>
</html>`);
  });

  // ── End Certificates ───────────────────────────────────────────────────────────

  // ── Weekly Reports API ────────────────────────────────────────────────────────

  /**
   * GET /api/reports/weekly
   * Returns the authenticated user's weekly reports (most recent first).
   * Query: ?limit=5 (default 5)
   */
  app.get("/api/reports/weekly", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to view reports" });
    if (!supabaseAdmin) return res.status(503).json({ error: "Service unavailable" });

    const limit = Math.min(Number(req.query.limit ?? 5), 20);

    const { data, error } = await supabaseAdmin
      .from("weekly_reports")
      .select("id, week_start, week_end, quizzes_taken, quizzes_possible, scores_json, accuracy_pct, iq_start, iq_end, rank_weekly, strong_cats, weak_cats, ai_report, is_read, generated_at")
      .eq("user_id", user.id)
      .order("week_end", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ reports: data ?? [] });
  });

  /**
   * POST /api/reports/weekly/:id/read
   * Marks a weekly report as read.
   */
  app.post("/api/reports/weekly/:id/read", async (req, res) => {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorised" });
    if (!supabaseAdmin) return res.status(503).json({ error: "Service unavailable" });

    const { id } = req.params;
    await supabaseAdmin
      .from("weekly_reports")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);   // enforce ownership

    res.json({ success: true });
  });

  /**
   * POST /api/reports/weekly/trigger
   * Admin-only: manually trigger weekly report generation for testing.
   */
  app.post("/api/reports/weekly/trigger", requireAdmin, async (req, res) => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const today = ist.toISOString().slice(0, 10);
    generateWeeklyReports(today).catch(e => console.error('[weekly-report] trigger error:', e));
    res.json({ success: true, message: `Report generation triggered for ${today}` });
  });

  // ── End Weekly Reports ────────────────────────────────────────────────────────

  // Diagnostic endpoint — remove after debugging
  app.get("/api/test-gemini", async (req, res) => {
    if (!hasAvailableKey()) return res.json({ ok: false, reason: "No Gemini API keys available" });
    try {
      const reply = await geminiCall("Say 'ok' in one word.");
      res.json({ ok: true, reply, keys: getKeyStatus() });
    } catch (error: any) {
      res.json({ ok: false, reason: error?.message || String(error), keys: getKeyStatus() });
    }
  });

  // ── Mystery Stock routes ────────────────────────────────────────────────────

  /**
   * GET /api/mystery-stock/today?reveal=N
   * Returns first N clues (1–5).  Never returns the answer symbol.
   * Also returns the full symbol+name list for autocomplete.
   */
  app.get('/api/mystery-stock/today', async (req: Request, res: Response) => {
    try {
      const reveal = Math.min(5, Math.max(1, parseInt(req.query.reveal as string) || 1));
      const { date, clues } = await getTodayMysteryStock();

      const symbolList = STOCK_DB.map(s => ({ symbol: s.symbol, name: s.name }));

      res.json({ date, clues: clues.slice(0, reveal), total_clues: 5, symbols: symbolList });
    } catch (e: any) {
      console.error('[mystery-stock] /today error:', e);
      res.status(500).json({ error: 'Could not load today\'s game' });
    }
  });

  /**
   * POST /api/mystery-stock/guess
   * Body: { symbol: string, clues_used: number (1-5), date: string }
   * Returns: { correct, points, answer? (only when correct or game over) }
   */
  app.post('/api/mystery-stock/guess', async (req: Request, res: Response) => {
    const { symbol, clues_used, date } = req.body as { symbol: string; clues_used: number; date: string };
    if (!symbol || !clues_used || !date) {
      return res.status(400).json({ error: 'symbol, clues_used, and date are required' });
    }

    try {
      const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (date !== todayIST) {
        return res.status(400).json({ error: 'Date mismatch — play today\'s game' });
      }

      const { symbol: answer } = await getTodayMysteryStock();
      const correct = symbol.toUpperCase() === answer.toUpperCase();

      const POINTS: Record<number, number> = { 1: 500, 2: 400, 3: 300, 4: 200, 5: 100 };
      const points = correct ? (POINTS[clues_used] ?? 50) : 0;

      // Return the answer only when correct OR the player has used all 5 clues
      const revealAnswer = correct || clues_used >= 5;

      const stockInfo = STOCK_DB.find(s => s.symbol === answer);

      res.json({
        correct,
        points,
        ...(revealAnswer ? {
          answer,
          stock: stockInfo ? {
            name:    stockInfo.name,
            sector:  stockInfo.sector,
            founded: stockInfo.founded,
            city:    stockInfo.city,
            fun_fact: stockInfo.fun_fact,
          } : undefined,
        } : {}),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── News Impact routes ──────────────────────────────────────────────────────

  // GET /api/news/impact/:id — public; returns extracted symbols + price impact
  app.get('/api/news/impact/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Article id required' });

    const row = getNewsById(id);
    if (!row) return res.status(404).json({ error: 'Article not found' });

    const symbols: string[] = row.mentioned_symbols ? JSON.parse(row.mentioned_symbols) : [];
    const impact: Record<string, any> = row.price_impact_json ? JSON.parse(row.price_impact_json) : {};

    res.json({ symbols, impact });
  });

  // ── Story Timeline / Polls / Share Reward ──────────────────────────────────

  const TIMELINE_STOPWORDS = new Set([
    'the','a','an','is','in','of','to','and','for','with','by',
    'on','at','as','it','be','or','from','that','this','was','are',
  ]);

  function extractTimelineKeywords(title: string): string[] {
    return title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !TIMELINE_STOPWORDS.has(w))
      .slice(0, 3);
  }

  // GET /api/news/timeline/:id — related articles in chronological order
  app.get('/api/news/timeline/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const article = getNewsById(id);
      if (!article) return res.status(404).json({ ok: false, error: 'Article not found' });

      const keywords = extractTimelineKeywords(article.title || '');
      const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Build dynamic LIKE clauses for keyword matches
      const likeClauses = keywords.map(() => 'LOWER(title) LIKE ?').join(' OR ');
      const matchClause = likeClauses
        ? `(category = ? OR ${likeClauses})`
        : `category = ?`;

      const sql = `
        SELECT id, title, link, source, pub_date, category
        FROM news_items
        WHERE ${matchClause}
          AND fetched_at >= ?
          AND id != ?
        ORDER BY pub_date ASC
        LIMIT 8
      `;
      const params: any[] = [article.category, ...keywords.map(k => `%${k}%`), cutoffMs, id];

      const rows = rawDb.prepare(sql).all(...params) as Array<{
        id: string; title: string; link: string; source: string; pub_date: string; category: string;
      }>;

      res.json({ ok: true, articles: rows });
    } catch (err: any) {
      console.error('[news/timeline] error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  async function getPollCounts(articleId: string): Promise<{ bullish: number; bearish: number; neutral: number; total: number }> {
    const counts = { bullish: 0, bearish: 0, neutral: 0, total: 0 };
    if (!supabaseAdmin) return counts;
    const { data, error } = await supabaseAdmin
      .from('article_polls')
      .select('vote')
      .eq('article_id', articleId);
    if (error || !data) return counts;
    for (const row of data as Array<{ vote: string }>) {
      if (row.vote === 'bullish') counts.bullish++;
      else if (row.vote === 'bearish') counts.bearish++;
      else if (row.vote === 'neutral') counts.neutral++;
    }
    counts.total = counts.bullish + counts.bearish + counts.neutral;
    return counts;
  }

  // GET /api/news/poll/:id — public poll counts
  app.get('/api/news/poll/:id', async (req: Request, res: Response) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'Auth service not configured' });
      const counts = await getPollCounts(req.params.id);
      res.json({ ok: true, ...counts });
    } catch (err: any) {
      console.error('[news/poll GET] error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // POST /api/news/poll/:id/vote — authenticated; bullish/bearish/neutral
  app.post('/api/news/poll/:id/vote', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'Auth service not configured' });
      const user = req.user!;
      const { id: articleId } = req.params;
      const { vote } = (req.body ?? {}) as { vote?: string };

      if (!vote || !['bullish', 'bearish', 'neutral'].includes(vote)) {
        return res.status(400).json({ ok: false, error: "vote must be 'bullish', 'bearish', or 'neutral'" });
      }

      const { error: upsertErr } = await supabaseAdmin
        .from('article_polls')
        .upsert(
          { article_id: articleId, user_id: user.id, vote },
          { onConflict: 'article_id,user_id' },
        );
      if (upsertErr) {
        console.error('[news/poll POST] upsert error:', upsertErr);
        return res.status(500).json({ ok: false, error: 'Failed to record vote' });
      }

      // Award POLL_VOTE coins (capped daily) + streak bonuses at 5 / 15.
      ensureSqliteUser(user.id, user.name, user.email);
      const today = getISTDate();
      let coinsEarned = 0;
      let bonusEarned = 0;
      let bonusReason: string | null = null;
      let alreadyCapped = false;

      const countBefore = (rawDb.prepare(
        "SELECT COUNT(*) AS c FROM reading_rewards WHERE user_id = ? AND reward_type = 'POLL_VOTE' AND reward_date = ?"
      ).get(user.id, today) as { c: number }).c;

      if (countBefore >= POLL_VOTE_DAILY_CAP) {
        alreadyCapped = true;
      } else {
        const ins = rawDb.prepare(
          "INSERT OR IGNORE INTO reading_rewards (user_id, article_id, reward_type, coins_awarded, reward_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(user.id, articleId, 'POLL_VOTE', POLL_VOTE_COINS, today, Date.now());

        if (ins.changes > 0) {
          addCoins(user.id, POLL_VOTE_COINS, 'POLL_VOTE', articleId, 'Community poll vote');
          coinsEarned = POLL_VOTE_COINS;

          const countAfter = countBefore + 1;
          if (countAfter === 5)  {
            addCoins(user.id, POLL_STREAK_5_BONUS_COINS, 'POLL_VOTE_BONUS', null, 'Streak: 5 polls today');
            bonusEarned += POLL_STREAK_5_BONUS_COINS;
            bonusReason = '5 polls today!';
          }
          if (countAfter === 15) {
            addCoins(user.id, POLL_STREAK_15_BONUS_COINS, 'POLL_VOTE_BONUS', null, 'Streak: 15 polls today');
            bonusEarned += POLL_STREAK_15_BONUS_COINS;
            bonusReason = '15 polls today!';
          }
        }
      }

      const counts = await getPollCounts(articleId);
      res.json({
        ok: true, ...counts,
        coinsEarned, bonusEarned, bonusReason,
        alreadyCapped, dailyCap: POLL_VOTE_DAILY_CAP,
      });
    } catch (err: any) {
      console.error('[news/poll POST] error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // POST /api/news/share/:id/reward — authenticated.
  // Awards SHARE_ARTICLE coins per article+platform per day, plus:
  //   • +SHARE_STREAK_5_BONUS_COINS at 5 shares today
  //   • +SHARE_MULTI_PLATFORM_BONUS when an article hits 2+ distinct platforms
  // Body / query: { platform?: 'whatsapp'|'twitter'|'telegram'|'copy'|'other' }
  app.post('/api/news/share/:id/reward', requireAuth, (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { id: articleId } = req.params;
      const rawPlatform = (req.body?.platform ?? req.query?.platform ?? 'other')
        .toString().toLowerCase();
      const validPlatforms = new Set(['whatsapp','twitter','telegram','copy','other']);
      const platform = validPlatforms.has(rawPlatform) ? rawPlatform : 'other';

      ensureSqliteUser(user.id, user.name, user.email);
      const today = getISTDate();

      // Daily cap
      const countBefore = (rawDb.prepare(
        "SELECT COUNT(*) AS c FROM reading_rewards WHERE user_id = ? AND reward_type = 'SHARE_ARTICLE' AND reward_date = ?"
      ).get(user.id, today) as { c: number }).c;
      if (countBefore >= SHARE_ARTICLE_DAILY_CAP) {
        return res.json({ ok: true, alreadyCapped: true, coinsEarned: 0, dailyCap: SHARE_ARTICLE_DAILY_CAP });
      }

      const ins = rawDb.prepare(
        "INSERT OR IGNORE INTO reading_rewards (user_id, article_id, reward_type, coins_awarded, reward_date, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(user.id, articleId, 'SHARE_ARTICLE', SHARE_ARTICLE_COINS, today, platform, Date.now());

      if (ins.changes === 0) {
        return res.json({ ok: true, alreadyClaimed: true, coinsEarned: 0, platform });
      }

      addCoins(user.id, SHARE_ARTICLE_COINS, 'SHARE_ARTICLE', articleId, `Share via ${platform}`);

      const countAfter = countBefore + 1;
      let bonusEarned = 0;
      let bonusReason: string | null = null;

      // Streak bonus at 5 shares today
      if (countAfter === 5) {
        addCoins(user.id, SHARE_STREAK_5_BONUS_COINS, 'SHARE_ARTICLE_BONUS', null, 'Streak: 5 shares today');
        bonusEarned += SHARE_STREAK_5_BONUS_COINS;
        bonusReason = '5 shares today!';
      }

      // Multi-platform bonus: award when article hits 2 distinct platforms today
      const distinctPlat = (rawDb.prepare(`
        SELECT COUNT(DISTINCT platform) AS c FROM reading_rewards
        WHERE user_id = ? AND article_id = ? AND reward_type = 'SHARE_ARTICLE'
          AND reward_date = ? AND platform IS NOT NULL
      `).get(user.id, articleId, today) as { c: number }).c;
      if (distinctPlat === 2) {
        addCoins(user.id, SHARE_MULTI_PLATFORM_BONUS, 'SHARE_ARTICLE_BONUS', articleId, 'Multi-platform share');
        bonusEarned += SHARE_MULTI_PLATFORM_BONUS;
        bonusReason = bonusReason ? `${bonusReason} + Multi-platform!` : 'Multi-platform bonus!';
      }

      res.json({
        ok:           true,
        coinsEarned:  SHARE_ARTICLE_COINS,
        bonusEarned,
        bonusReason,
        platform,
        countToday:   countAfter,
        dailyCap:     SHARE_ARTICLE_DAILY_CAP,
      });
    } catch (err: any) {
      console.error('[news/share] error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ── IPO Calendar routes ─────────────────────────────────────────────────────

  // GET /api/ipo/calendar — public, returns all IPOs sorted by open_date
  app.get('/api/ipo/calendar', (_req: Request, res: Response) => {
    try {
      const ipos = getAllIPOs();
      res.json(ipos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/ipo — add or update IPO record (admin only)
  app.post('/api/admin/ipo', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as Partial<IPORecord>;
    if (!body.company_name) {
      return res.status(400).json({ error: 'company_name is required' });
    }
    // Stable ID: hash of company_name (lowercased, spaces→_)
    const id = body.id ?? crypto
      .createHash('md5')
      .update((body.company_name + (body.open_date ?? '')).toLowerCase())
      .digest('hex')
      .slice(0, 12);
    try {
      upsertIPO({
        id,
        company_name:        body.company_name,
        symbol:              body.symbol              ?? null,
        open_date:           body.open_date           ?? null,
        close_date:          body.close_date          ?? null,
        allotment_date:      body.allotment_date      ?? null,
        listing_date:        body.listing_date        ?? null,
        price_band_low:      body.price_band_low      ?? null,
        price_band_high:     body.price_band_high     ?? null,
        lot_size:            body.lot_size            ?? null,
        gmp:                 body.gmp                 ?? null,
        subscription_status: body.subscription_status ?? null,
        category:            (body.category as 'mainboard' | 'sme') ?? 'mainboard',
      });
      res.json({ ok: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/admin/ipo/:id — update specific IPO (admin only)
  app.put('/api/admin/ipo/:id', requireAdmin, (req: Request, res: Response) => {
    const { id } = req.params;
    const existing = getIPOById(id);
    if (!existing) return res.status(404).json({ error: 'IPO not found' });

    const body = req.body as Partial<IPORecord>;
    try {
      upsertIPO({
        ...existing,
        ...body,
        id,  // always keep the original id
        category: ((body.category ?? existing.category) as 'mainboard' | 'sme'),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/ipo/:id — delete IPO (admin only)
  app.delete('/api/admin/ipo/:id', requireAdmin, (req: Request, res: Response) => {
    deleteIPO(req.params.id);
    res.json({ ok: true });
  });

  // POST /api/admin/ipo/scrape — trigger Chittorgarh scrape (admin only)
  app.post('/api/admin/ipo/scrape', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const count = await scrapeAndSaveIPOs();
      res.json({ ok: true, scraped: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── End IPO routes ──────────────────────────────────────────────────────────

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    // SPA fallback: any non-asset, non-/api path gets index.html transformed by Vite.
    app.get("*", async (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/admin")) return next();
      try {
        const indexPath = path.join(process.cwd(), "index.html");
        const rawHtml   = await fs.promises.readFile(indexPath, "utf-8");
        const html      = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── Midnight IST quiz generation cron ────────────────────────────────────────
  // Runs every minute; triggers once per day between 00:00–00:03 IST.
  let quizCronLastDate = '';
  setInterval(async () => {
    const ist   = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const h     = ist.getUTCHours();
    const m     = ist.getUTCMinutes();
    const today = ist.toISOString().slice(0, 10);
    if (h === 0 && m <= 3 && quizCronLastDate !== today) {
      quizCronLastDate = today;
      console.log(`[quiz-cron] Midnight — generating quiz for ${today}`);
      generateOrGetQuiz().catch(err => console.error("[quiz-cron]", err));

      // Also refresh IPO data once per day at midnight IST
      scrapeAndSaveIPOs().catch(err => console.warn('[ipo-cron]', err.message));
    }
  }, 60_000);

  // ── 8:45 AM IST daily quiz reminder push ─────────────────────────────────────
  // Runs every minute; sends once per day at 08:45 IST.
  // Notifies users with an FCM token to come play today's quiz.
  let quizReminderLastDate = '';
  setInterval(async () => {
    const ist   = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const h     = ist.getUTCHours();
    const m     = ist.getUTCMinutes();
    const today = ist.toISOString().slice(0, 10);
    if (h === 8 && m === 45 && quizReminderLastDate !== today) {
      quizReminderLastDate = today;
      try {
        // Fetch users who have a streak (active) and have granted push permission
        const tokens = await getFcmTokens();
        if (tokens.length === 0) return;

        // Get streak counts to personalise the message
        const { data: profiles } = await (supabaseAdmin?.from('profiles')
          .select('fcm_token, streak_count')
          .not('fcm_token', 'is', null) ?? { data: [] });

        // Group by streak so we can personalise
        const byToken = Object.fromEntries(
          (profiles ?? []).map((p: any) => [p.fcm_token as string, p.streak_count as number ?? 0])
        );

        // Batch by streak message (no more than 500 per multicast)
        const streakGroups: Record<string, string[]> = {};
        for (const [token, streak] of Object.entries(byToken)) {
          const msg = streak > 0 ? `Your ${streak}-day streak is waiting 🔥` : 'Play today and start your streak 🔥';
          streakGroups[msg] ??= [];
          streakGroups[msg].push(token);
        }

        for (const [body, tkns] of Object.entries(streakGroups)) {
          await sendFcmNotification(tkns, "🕐 Today's quiz is live!", body, '/');
        }
        console.log(`[fcm/quiz-reminder] Sent to ${tokens.length} users`);
      } catch (err) {
        console.error('[fcm/quiz-reminder]', err);
      }
    }
  }, 60_000);

  // ── Sunday 8 PM IST weekly report push ───────────────────────────────────────
  // Runs every minute; sends once per week on Sunday at 20:00 IST.
  let weeklyReportLastDate = '';
  setInterval(async () => {
    const ist   = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const h     = ist.getUTCHours();
    const m     = ist.getUTCMinutes();
    const day   = ist.getUTCDay();           // 0 = Sunday
    const today = ist.toISOString().slice(0, 10);
    if (day === 0 && h === 20 && m === 0 && weeklyReportLastDate !== today) {
      weeklyReportLastDate = today;
      try {
        const tokens = await getFcmTokens();
        if (tokens.length === 0) return;
        await sendFcmNotification(
          tokens,
          '📊 Your weekly report is ready',
          "See how you ranked this week on Market Samachar",
          '/',
        );
        console.log(`[fcm/weekly-report] Sent to ${tokens.length} users`);
      } catch (err) {
        console.error('[fcm/weekly-report]', err);
      }
    }
  }, 60_000);

  // ── 15:31 IST prediction resolution cron ─────────────────────────────────────
  // Runs every minute; resolves pending predictions once per day after market close.
  // Only on weekdays (Mon–Fri) when NSE is open.
  let predResolveLastDate = '';
  setInterval(async () => {
    const ist   = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const h     = ist.getUTCHours();
    const m     = ist.getUTCMinutes();
    const day   = ist.getUTCDay();           // 0 = Sunday, 6 = Saturday
    const today = ist.toISOString().slice(0, 10);
    // 15:31 IST = 10:01 UTC; weekdays only
    if (h === 10 && m === 1 && day > 0 && day < 6 && predResolveLastDate !== today) {
      predResolveLastDate = today;
      try {
        const quote     = await yahooFinance.quote("^NSEI") as any;
        const pct       = (quote?.regularMarketChangePercent as number) ?? 0;
        const direction = pct >= 0 ? "up" : "down" as const;
        const resolved  = resolvePredictionsForDate(today, direction);
        console.log(`[predictions] Resolved ${resolved} predictions for ${today}: Nifty ${direction} (${pct.toFixed(2)}%)`);
      } catch (err) {
        console.error("[predictions/resolve]", err);
      }
    }
  }, 60_000);

  // ── Global error handler (must be after all routes) ────────────────────
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[error] ${req.method} ${req.path}:`, err?.stack || err);
    if (res.headersSent) return;
    res.status(err?.status || 500).json({
      error: process.env.NODE_ENV === "production"
        ? "Internal server error"
        : (err?.message || "Internal server error"),
    });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Pre-warm market cache so first page load shows live data immediately
    Promise.allSettled(
      MARKET_SYMBOLS.map((sym) => yahooFinance.quote(sym))
    ).then((results) => {
      const data: MarketQuote[] = results
        .map((result, i) => {
          if (result.status !== "fulfilled") return null;
          const q = result.value as any;
          return {
            symbol: MARKET_SYMBOLS[i],
            name: SYMBOL_NAMES[MARKET_SYMBOLS[i]] || q.shortName || MARKET_SYMBOLS[i],
            price: q.regularMarketPrice ?? 0,
            change: q.regularMarketChange ?? 0,
            changePercent: q.regularMarketChangePercent ?? 0,
            high: q.regularMarketDayHigh ?? null,
            low: q.regularMarketDayLow ?? null,
          } as MarketQuote;
        })
        .filter((q): q is MarketQuote => q !== null);
      if (data.length > 0) {
        marketCache = { data, fetchedAt: Date.now() };
        console.log(`[market-data] Pre-warmed cache with ${data.length} symbols`);
      }
    }).catch(() => { /* non-fatal — first request will fetch */ });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`[shutdown] Received ${signal}, closing server…`);
    server.close((err) => {
      if (err) {
        console.error("[shutdown] Error closing server:", err);
        process.exit(1);
      }
      try { rawDb.close(); } catch (e) { console.error("[shutdown] DB close error:", e); }
      console.log("[shutdown] Clean exit");
      process.exit(0);
    });
    // Force-exit if shutdown takes too long
    setTimeout(() => {
      console.error("[shutdown] Force exit after 10s");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
  });

  // Start stock price background refresh (every 15 min during market hours)
  startStockPriceCron();

  // ── PULSE swipe resolver — every 30 min, batch up to 50 due swipes ─────────
  cron.schedule("*/30 * * * *", async () => {
    try {
      await resolvePulseSwipes();
    } catch (e) {
      console.error("[cron] resolvePulseSwipes error:", e);
    }
  }, { timezone: "Asia/Kolkata" });

  // ── Daily Forecast cron jobs (IST) ──────────────────────────────────────
  // 08:45 IST weekdays → create today's prediction questions
  cron.schedule("45 8 * * 1-5", async () => {
    console.log("[cron] Creating daily predictions…");
    try {
      await createDailyPredictions();
    } catch (e) {
      console.error("[cron] createDailyPredictions error:", e);
    }
  }, { timezone: "Asia/Kolkata" });

  // 15:35 IST weekdays → resolve predictions with actual market close data
  cron.schedule("35 15 * * 1-5", async () => {
    console.log("[cron] Resolving daily predictions…");
    try {
      await resolvePredictions();
    } catch (e) {
      console.error("[cron] resolvePredictions error:", e);
    }
  }, { timezone: "Asia/Kolkata" });

  // ── IPO Prediction auto-creation ───────────────────────────────────────
  // 09:00 IST daily → check for IPOs listing in next 3 days, create predictions
  cron.schedule("0 9 * * *", () => {
    console.log("[cron] Checking for upcoming IPO predictions…");
    try {
      createIPOPredictionQuestions();
    } catch (e) {
      console.error("[cron] createIPOPredictionQuestions error:", e);
    }
  }, { timezone: "Asia/Kolkata" });

  // ── Quiz Podium Payouts ───────────────────────────────────────────────
  // Pays 1000/750/500 coins to the top 3 of each period. Dedup via
  // quiz_podium_payouts — safe to run more than once per period.
  async function payoutPodium(
    period:     "daily" | "weekly" | "monthly",
    periodKey:  string,       // 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM'
    sinceDate:  string,       // inclusive IST date
    endDate:    string,       // inclusive IST date
    actionType: "QUIZ_PODIUM_DAILY" | "QUIZ_PODIUM_WEEKLY" | "QUIZ_PODIUM_MONTHLY",
  ): Promise<void> {
    if (!supabaseAdmin) {
      console.warn(`[cron/podium ${period}] Supabase unavailable — skipping`);
      return;
    }
    try {
      // Fetch attempts within the period
      const { data, error } = await supabaseAdmin
        .from("quiz_attempts")
        .select("user_id, score, iq_change, time_taken_secs, date")
        .gte("date", sinceDate)
        .lte("date", endDate)
        .limit(1000);
      if (error) throw error;

      // Aggregate: sum IQ delta (primary), score (tie-break), time (final tie-break)
      const byUser: Record<string, { iq: number; score: number; time: number }> = {};
      for (const row of (data ?? [])) {
        const b = byUser[row.user_id] ??= { iq: 0, score: 0, time: 0 };
        b.iq    += row.iq_change ?? 0;
        b.score += row.score ?? 0;
        b.time  += row.time_taken_secs ?? 0;
      }
      const top3 = Object.entries(byUser)
        .map(([user_id, s]) => ({ user_id, ...s }))
        .sort((a, b) => b.iq - a.iq || b.score - a.score || a.time - b.time)
        .slice(0, 3);

      if (top3.length === 0) {
        console.log(`[cron/podium ${period}] No attempts in ${periodKey} — skipping`);
        return;
      }

      let paid = 0;
      for (let i = 0; i < top3.length; i++) {
        const entry = top3[i];
        const rank  = i + 1;
        const prize = QUIZ_PODIUM_PRIZES[i];

        // Dedup: skip if this rank/user is already paid for this period
        try {
          rawDb.prepare(
            `INSERT INTO quiz_podium_payouts
               (period, period_key, user_id, rank, coins_awarded, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(period, periodKey, entry.user_id, rank, prize, Date.now());
        } catch (e: any) {
          if (String(e?.message).includes("UNIQUE")) continue; // already paid
          throw e;
        }

        try {
          ensureSqliteUser(entry.user_id);
          addCoins(entry.user_id, prize, actionType, periodKey,
            `🏆 ${period} quiz podium — rank #${rank} (+${prize} coins)`);
          paid++;
        } catch (e) {
          console.error(`[cron/podium ${period}] coin write failed for ${entry.user_id}:`, e);
        }
      }

      console.log(`[cron/podium ${period}] ${periodKey} — paid ${paid}/${top3.length} winners`);
    } catch (err) {
      console.error(`[cron/podium ${period}] error:`, err);
    }
  }

  // Daily podium: 23:55 IST every day
  cron.schedule("55 23 * * *", () => {
    const today = getISTDate();
    payoutPodium("daily", `daily:${today}`, today, today, "QUIZ_PODIUM_DAILY");
  }, { timezone: "Asia/Kolkata" });

  // Weekly podium: Sunday 23:55 IST (end of week)
  cron.schedule("55 23 * * 0", () => {
    const ist     = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const end     = ist.toISOString().slice(0, 10);
    const start   = new Date(+ist - 6 * 86_400_000).toISOString().slice(0, 10);
    // ISO-week key: YYYY-Www for human readability + uniqueness
    const onejan  = new Date(ist.getFullYear(), 0, 1);
    const week    = Math.ceil((((+ist - +onejan) / 86_400_000) + onejan.getDay() + 1) / 7);
    const key     = `weekly:${ist.getFullYear()}-W${String(week).padStart(2, "0")}`;
    payoutPodium("weekly", key, start, end, "QUIZ_PODIUM_WEEKLY");
  }, { timezone: "Asia/Kolkata" });

  // Monthly podium: 23:55 IST on the last day of each month
  // node-cron can't express "last day" directly, so run nightly 23:55 and
  // check if tomorrow is a new month.
  cron.schedule("55 23 * * *", () => {
    const ist      = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const tomorrow = new Date(+ist + 86_400_000);
    if (ist.getMonth() === tomorrow.getMonth()) return; // not month-end

    const monthKey = ist.toISOString().slice(0, 7);     // YYYY-MM
    const start    = `${monthKey}-01`;
    const end      = ist.toISOString().slice(0, 10);
    payoutPodium("monthly", `monthly:${monthKey}`, start, end, "QUIZ_PODIUM_MONTHLY");
  }, { timezone: "Asia/Kolkata" });

  // ── Nightly cleanup: stale news + expired quiz questions ───────────────
  // 03:30 IST daily → prune data that's no longer useful to keep DB lean
  cron.schedule("30 3 * * *", () => {
    try {
      const now = Date.now();
      const cutoff = now - 30 * 24 * 60 * 60 * 1000; // 30 days

      const r1 = rawDb.prepare("DELETE FROM news_items WHERE fetched_at < ?").run(cutoff);
      const r2 = rawDb.prepare("DELETE FROM news_impact_questions WHERE expires_at < ?").run(now);
      const r3 = rawDb.prepare("DELETE FROM batches WHERE fetched_at < ?").run(cutoff);

      console.log(`[cron/cleanup] Pruned news=${r1.changes} quiz=${r2.changes} batches=${r3.changes}`);
    } catch (e) {
      console.error("[cron/cleanup] error:", e);
    }
  }, { timezone: "Asia/Kolkata" });
}

startServer();
