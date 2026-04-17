# CLAUDE.md — Market Samachar
> This file gives Claude Code complete context about the project.
> Read this fully before making any changes to any file.

---

## 1. Product Identity

| Field | Value |
|---|---|
| **Product name** | Market Samachar |
| **Domain** | marketsamachar.in |
| **Tagline** | Live Market News · India & Global |
| **Type** | Automated financial news terminal (web app) |
| **Audience** | Indian retail investors, traders, finance enthusiasts |
| **Language focus** | Telugu, Hindi, Tamil, Marathi, Bengali, English |

### Naming Rules — CRITICAL
- Always call it **"Market Samachar"** — never MarketLive, never MarketPulse, never MarketWatch
- Domain is always lowercase: `marketsamachar.in`
- Old placeholder names `MarketLive` and `MarketPulse` exist in some old code — replace them if seen

### Scope (as of 2026-04-17)
- **Out of scope:** social media auto-posting pipeline (Telegram/Facebook/Instagram slide generation)
  — product is now a web-app-only news terminal. Any references to `pipeline/publishers/`,
  `pipeline/templates/`, `pipeline/generator.ts`, or slide generation are historical.
- **Out of scope:** Oracle Cloud VPS deployment (was only intended for the social pipeline).

---

## 2. Brand & Design System

### Colors
```css
--primary-green:  #00ff88   /* main accent, live indicators, CTAs */
--background:     #07070e   /* page background */
--card-bg:        #0d0d1e   /* news cards, panels */
--card-border:    #1e1e2e   /* card borders */
--text-primary:   #e8eaf0   /* main text */
--text-secondary: #888899   /* muted text, timestamps */
--text-dim:       #444455   /* very muted, labels */
--danger:         #ff4466   /* negative price, errors */
--warning:        #ff9f3b   /* SEBI color, warnings */
--info:           #3b9eff   /* RBI color, info */
```

### Typography
```
Numbers & prices → DM Mono (monospace)
Headings & UI    → DM Sans
Body text        → DM Sans
Letter spacing on labels → 0.06em or 1px (monospace sections)
```

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Logo Files (in /public/)
```
ms-navbar.svg      → 200×44px    — header/navbar logo
ms-login.svg       → 420×260px   — centered on login page
ms-logo-512.svg    → 512×512px   — full brand mark
ms-favicon.svg     → 64×64px     — browser tab favicon
ms-icon-192.svg    → 192×192px   — PWA app icon
ms-og-1200x630.svg → 1200×630px  — Open Graph / social share image
```

### Design Aesthetic
- Bloomberg Terminal meets modern dark web
- Dark background always — never white/light theme for main app
- Green (#00ff88) = live, positive, market open
- Red (#ff4466) = negative, down, alert
- Monospace font for ALL numbers and prices
- Thin borders (0.5–1px) — never thick
- Colored left border on news cards = category identifier
- Blinking dot = live/real-time indicator

---

## 3. Tech Stack

### Frontend
```
React 19 + TypeScript
Vite 6 (build tool)
Tailwind CSS v4
DM Sans + DM Mono (Google Fonts)
lucide-react (icons)
date-fns (time formatting)
motion (animations)
recharts (bar/line charts — used in RewardsHub)
```

### Backend
```
Express.js + TypeScript
tsx (TypeScript runner)
Node.js 20 LTS
```

### Database
```
SQLite via better-sqlite3
File: pipeline.db (project root)
DO NOT use PostgreSQL, MySQL, or any external DB
```

### AI
```
Google Gemini API
Model: gemini-2.5-flash  ← ALWAYS use this model name
NEVER use: gemini-3-flash-preview (invalid/old name)
NEVER call Gemini from frontend — server-side only
```

### Hosting
```
TBD — provider not yet selected.
The social-media-pipeline scope that required Oracle Cloud Always Free has
been dropped. Any hosting that runs Node 20 + SQLite file storage will work.
```

---

## 4. Project File Structure

```
marketsamachar/
├── CLAUDE.md                    ← this file
├── server.ts                    ← Express backend (main entry)
├── vite.config.ts               ← Vite config (frontend build)
├── tsconfig.json
├── package.json
├── .env.local                   ← secrets (never commit)
├── .env.example                 ← template (commit this)
├── .gitignore
├── pipeline.db                  ← SQLite DB (never commit)
├── news-cache.json              ← RSS cache (never commit)
│
├── src/                         ← React frontend
│   ├── App.tsx                  ← main UI + 5-tab bottom nav
│   ├── main.tsx                 ← React entry point (routes: / → LandingPage, /app|/quiz|/paper-trading|/predict|/rewards → App)
│   ├── index.css                ← global styles
│   ├── pages/
│   │   ├── LandingPage.tsx      ← public marketing page
│   │   ├── IPOCalendarPage.tsx  ← /ipo-calendar route
│   │   ├── PaperTrading.tsx     ← virtual trading interface (/paper-trading)
│   │   └── RewardsHub.tsx       ← unified rewards + coin economy dashboard
│   └── components/
│       ├── MarketForecast.tsx   ← daily prediction component (/predict + sidebar)
│       ├── NewsImpactQuiz.tsx   ← news impact 4-option MCQ quiz
│       ├── IPOPredictions.tsx   ← IPO listing direction predictions
│       ├── quiz/                ← Market Quiz (MarketQuiz, QuizGame, QuizResult, ...)
│       └── ...                  ← other components
│
├── public/                      ← static assets
│   ├── ms-navbar.svg
│   ├── ms-login.svg
│   ├── ms-logo-512.svg
│   ├── ms-favicon.svg
│   ├── ms-icon-192.svg
│   └── ms-og-1200x630.svg
│
├── backend/                     ← engagement feature backend
│   └── src/
│       ├── middleware/
│       │   └── auth.ts          ← Supabase JWT validation → req.user
│       ├── services/
│       │   ├── coinService.ts   ← virtual coin add/deduct + ledger
│       │   ├── stockPriceService.ts ← Yahoo Finance fetch + SQLite cache + cron
│       │   ├── virtualTradingService.ts ← buy/sell logic, portfolio, orders
│       │   ├── predictionService.ts ← Gemini question gen, vote, resolve
│       │   └── rewardConfig.ts  ← centralized coin economy (X=100 base unit)
│       └── routes/
│           ├── stocks.ts        ← /api/stocks/*
│           ├── trading.ts       ← /api/trading/*
│           ├── predictions.ts   ← /api/predictions/*
│           ├── rewards.ts       ← /api/rewards/*
│           ├── newsImpact.ts    ← /api/news-impact/*
│           └── ipoPredictions.ts ← /api/ipo-predictions/*
│
├── pipeline/
│   └── db.ts                    ← SQLite database layer (all tables)
│
└── scripts/
    └── setup-admin.ts           ← one-time password hash generator
```

---

## 5. Database Schema

### Core Pipeline Tables

```sql
-- Every news item fetched
news_items (
  id TEXT PRIMARY KEY,        -- MD5 hash of title
  title TEXT,
  link TEXT,
  pub_date TEXT,
  source TEXT,
  category TEXT,              -- see categories list below
  content_snippet TEXT,
  fetched_at INTEGER,         -- Unix timestamp
  batch_id TEXT               -- which batch
)

-- Each refresh cycle
batches (
  id TEXT PRIMARY KEY,        -- batch_TIMESTAMP
  fetched_at INTEGER,
  item_count INTEGER,
  new_item_count INTEGER,
  status TEXT                 -- pending/generating/posted/failed
)

-- Generated slide files
slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT,
  platform TEXT,              -- telegram/facebook/instagram
  slide_index INTEGER,
  file_path TEXT,
  created_at INTEGER
)

-- Post results per platform
posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT,
  platform TEXT,
  status TEXT,                -- pending/success/failed
  posted_at INTEGER,
  error TEXT
)
```

### Engagement Tables (virtual trading + predictions + quizzes)

```sql
-- Local mirror of Supabase auth users
users (
  id TEXT PRIMARY KEY,        -- Supabase UUID
  email TEXT,
  name TEXT,
  avatar TEXT,
  coins INTEGER DEFAULT 0,              -- Supabase rewards coins (synced)
  virtual_coin_balance INTEGER DEFAULT 1000,  -- trading balance (starts at 1000)
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  is_pro INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
)

-- Full audit ledger for every coin event
samachar_coins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,  -- see CoinActionType below
  amount INTEGER NOT NULL,    -- positive = earned, negative = spent
  balance_after INTEGER NOT NULL,
  ref_id TEXT,                -- optional FK to source row
  note TEXT,                  -- human-readable description
  created_at INTEGER NOT NULL
)

-- 15-min delayed stock price cache (Yahoo Finance)
stock_price_cache (
  symbol TEXT PRIMARY KEY,    -- e.g. "RELIANCE" (no .NS suffix)
  name TEXT,
  current_price INTEGER,      -- in coins (1 coin = ₹1)
  change_percent REAL,
  prev_close INTEGER,
  high INTEGER,
  low INTEGER,
  volume INTEGER,
  fetched_at INTEGER
)

-- Virtual portfolio summary per user
virtual_portfolio (
  user_id TEXT PRIMARY KEY,
  total_invested_coins INTEGER DEFAULT 0,
  current_value_coins INTEGER DEFAULT 0,
  realised_pnl_coins INTEGER DEFAULT 0,
  updated_at INTEGER
)

-- Individual stock holdings
virtual_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  avg_buy_price_coins INTEGER NOT NULL,
  updated_at INTEGER,
  UNIQUE(user_id, symbol)
)

-- Every buy/sell order
virtual_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  order_type TEXT NOT NULL,   -- BUY / SELL
  quantity INTEGER NOT NULL,
  price_coins INTEGER NOT NULL,
  total_coins INTEGER NOT NULL,
  pnl_coins INTEGER,          -- only for SELL orders
  created_at INTEGER NOT NULL
)

-- Daily AI-generated market prediction questions
daily_predictions (
  id TEXT PRIMARY KEY,        -- "YYYY-MM-DD_TYPE" e.g. "2026-04-01_NIFTY"
  date TEXT NOT NULL,         -- IST date "YYYY-MM-DD"
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  correct_answer TEXT,        -- "A" or "B", null until resolved
  resolves_at INTEGER,        -- Unix timestamp
  created_at INTEGER
)

-- User votes on daily predictions
user_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  answer TEXT NOT NULL,       -- "A" or "B"
  is_correct INTEGER,         -- 0/1, null until resolved
  coins_earned INTEGER DEFAULT 0,
  created_at INTEGER,
  UNIQUE(user_id, prediction_id)
)

-- AI-generated news impact quiz questions (4-option MCQ)
news_impact_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL,        -- FK → news_items.id
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,    -- 'A', 'B', 'C', or 'D'
  symbol TEXT,                     -- related stock symbol
  expires_at INTEGER NOT NULL,     -- auto-expires after 48h
  created_at INTEGER NOT NULL
)

-- User answers to news impact questions
user_news_impact_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  selected_option TEXT NOT NULL,   -- 'A', 'B', 'C', or 'D'
  is_correct INTEGER NOT NULL,     -- 0 or 1
  coins_awarded INTEGER DEFAULT 0,
  answered_at INTEGER NOT NULL,
  UNIQUE (user_id, question_id)
)

-- IPO prediction questions (auto-created for upcoming listings)
ipo_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ipo_name TEXT NOT NULL,
  symbol TEXT,
  open_date TEXT,                   -- "YYYY-MM-DD"
  listing_date TEXT,               -- "YYYY-MM-DD"
  question_type TEXT NOT NULL,     -- 'GMP', 'SUBSCRIPTION', 'LISTING_PRICE'
  correct_answer TEXT,             -- filled after listing
  created_at INTEGER NOT NULL
)

-- User votes on IPO predictions
user_ipo_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ipo_prediction_id INTEGER NOT NULL,
  answer TEXT NOT NULL,             -- e.g. "Above Issue Price"
  is_correct INTEGER,              -- NULL=pending, 1=correct, 0=wrong
  coins_awarded INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, ipo_prediction_id)
)
```

### CoinActionType values

```typescript
type CoinActionType =
  | 'FIRST_LOGIN'          // 10X = 1,000 coins — one-time welcome bonus
  | 'DAILY_LOGIN'          // 1X  = 100 coins — daily login base
  | 'DAILY_STREAK'         // +0.5X per day = +50/day (max 5X = 500)
  | 'QUIZ_CORRECT'         // 1X × IQ-tier-mult (1.0×–3.0×) per correct, 1/day
  | 'QUIZ_BONUS'           // 3X × IQ-tier-mult for perfect 5/5 score
  | 'QUIZ_PODIUM_DAILY'    // 1000/750/500 for daily top 3 BY IQ GAIN (23:55 IST)
  | 'QUIZ_PODIUM_WEEKLY'   // 1000/750/500 for weekly top 3 BY IQ GAIN (Sun 23:55 IST)
  | 'QUIZ_PODIUM_MONTHLY'  // 1000/750/500 for monthly top 3 BY IQ GAIN (month-end 23:55 IST)
  | 'PREDICTION_VOTE'      // 1X  = 100 coins for participating
  | 'PREDICTION_CORRECT'   // 3X  = 300 coins for correct prediction
  | 'VIRTUAL_TRADE'        // 0.5X = 50 coins per trade activity
  | 'PORTFOLIO_PROFIT'     // 5X  = 500 coins for ≥5% profit on sell
  | 'REFERRAL'             // 5X  = 500 coins for both parties
  | 'NEWS_IMPACT_CORRECT'  // 1X  = 100 coins per correct answer
  | 'IPO_PREDICTION'       // 1X  = 100 coins for participating
  | 'IPO_CORRECT'          // 5X  = 500 coins for correct IPO prediction
  | 'ADMIN_GRANT'          // manual admin coin grant
  | 'PURCHASE'             // paid coin purchase (future)
```

---

## 6. News Categories

```typescript
type Category =
  | 'all'        // all news combined
  | 'indian'     // Indian stock market (NSE/BSE)
  | 'companies'  // listed company news
  | 'global'     // global financial markets
  | 'commodity'  // gold, crude oil, metals, agri
  | 'crypto'     // cryptocurrency
  | 'ipo'        // IPO news and GMP
  | 'economy'    // macro economy, GDP, inflation
  | 'banking'    // banking and NBFC
  | 'sebi'       // SEBI circulars and regulations
  | 'rbi'        // RBI policy and guidelines
```

### Category Color Map
```typescript
const CATEGORY_COLORS = {
  indian:    '#00ff88',  // green
  companies: '#ffdd3b',  // yellow
  global:    '#3bffee',  // cyan
  commodity: '#ff6b3b',  // orange
  crypto:    '#b366ff',  // purple
  ipo:       '#ff3bff',  // pink
  economy:   '#3b9eff',  // blue
  banking:   '#3b9eff',  // blue
  sebi:      '#ff9f3b',  // amber
  rbi:       '#3b9eff',  // blue
}
```

---

## 7. RSS Feed Sources

### Indian Market (category: 'indian')
```
https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms
https://www.moneycontrol.com/rss/marketreports.xml
https://www.livemint.com/rss/markets
https://www.business-standard.com/rss/markets-106.rss
https://www.financialexpress.com/market/rss/
https://zeenews.india.com/business/rss/business.xml
https://feeds.feedburner.com/ndtvprofit-latest
https://www.thehindu.com/business/markets/feeder/default.rss
```

### Companies (category: 'companies')
```
https://www.moneycontrol.com/rss/business.xml
https://economictimes.indiatimes.com/news/company/rssfeeds/2146842.cms
https://www.financialexpress.com/companies/rss/
https://www.thehindu.com/business/companies/feeder/default.rss
```

### Global (category: 'global')
```
https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664
https://feeds.reuters.com/reuters/businessNews
https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147
```

### Commodity (category: 'commodity')
```
https://www.moneycontrol.com/rss/commodities.xml
https://economictimes.indiatimes.com/markets/commodities/rssfeeds/119053.cms
https://www.financialexpress.com/market/commodities/rss/
```

### Crypto (category: 'crypto')
```
https://www.coindesk.com/arc/outboundfeeds/rss/
https://cointelegraph.com/rss
https://decrypt.co/feed
```

### IPO (category: 'ipo')
```
https://www.chittorgarh.com/rss/ipo_news_rss.asp
```

### Economy (category: 'economy')
```
https://www.rbi.org.in/Scripts/RSSFeed.aspx?Id=3
https://www.sebi.gov.in/rss/pressreleases.xml
```

### Banking (category: 'banking')
```
https://www.financialexpress.com/money/rss/
https://economictimes.indiatimes.com/industry/banking/finance/rssfeeds/13358270.cms
```

---

## 8. Smart Scheduler — IST-Aware

```typescript
// All times in IST (UTC+5:30)
const SCHEDULE = {
  marketHours: {
    start: '09:15',
    end:   '15:30',
    interval: 30,      // minutes — NSE/BSE open
  },
  daytime: {
    start: '06:00',
    end:   '20:00',
    interval: 60,      // minutes — pre/post market
  },
  nighttime: {
    interval: 300,     // minutes — low activity
  }
}
```

---

## 9. API Endpoints

### Public (no auth required)
```
GET  /api/health                    → server status + uptime
GET  /api/news                      → news items
     ?category=indian               → filter by category
     ?limit=30                      → items per page (default 30)
     ?offset=0                      → pagination offset
GET  /api/market-data               → live ticker (Nifty, Sensex, Gold etc.)
POST /api/summarize                 → AI article summary (Gemini)
POST /api/translate                 → AI batch translation (Gemini)
GET  /api/news/article?url=X        → fetch + parse article content
GET  /api/regulatory                → SEBI + RBI latest circulars
POST /api/news/refresh              → force RSS refetch (5 req/min per IP)

GET  /api/stocks/popular            → all 20 cached NSE stocks
GET  /api/stocks/market-status      → { isOpen, nextOpen }
GET  /api/stocks/:symbol            → single stock price

GET  /api/trading/leaderboard       → top 10 traders by portfolio value
```

### Protected (Supabase Bearer JWT required)
```
POST /api/trading/buy               → { symbol, quantity } — buy stock
POST /api/trading/sell              → { symbol, quantity } — sell stock
GET  /api/trading/portfolio         → user's holdings + P&L
GET  /api/trading/orders            → order history ?limit=20
GET  /api/trading/holdings/:symbol  → single stock holding

GET  /api/predictions/today         → today's questions + user vote state
POST /api/predictions/:id/vote      → { answer: "A"|"B" }
GET  /api/predictions/history       → user prediction history

GET  /api/news-impact/questions     → unanswered news impact quiz questions
POST /api/news-impact/:id/answer    → { selected: "A"|"B"|"C"|"D" }
GET  /api/news-impact/stats         → user quiz accuracy stats

GET  /api/ipo-predictions/open      → open IPO prediction questions
POST /api/ipo-predictions/:id/vote  → { answer: "Above Issue Price"|"Below Issue Price" }
GET  /api/ipo-predictions/history   → user's IPO prediction history

GET  /api/rewards/hub               → full rewards dashboard data

GET  /api/quiz/today                → today's 5 questions (safe — no correct_index, shared pool)
POST /api/quiz/check                → reveal one answer after user picks (rate limited 20/hr)
POST /api/quiz/submit               → submit, 1/day — updates IQ + streak + coins (×tier mult)
GET  /api/quiz/leaderboard          → ?period=daily|weekly|monthly|alltime (top 20, ranked by IQ gain)
```

### Protected (admin session required)
```
GET  /api/pipeline/batches          → recent 20 batches with status
```

### Admin routes
```
GET  /admin/login                   → login page HTML
POST /admin/login                   → authenticate
GET  /admin/logout                  → destroy session
GET  /pipeline                      → pipeline dashboard HTML
```

---

## 10. Environment Variables

```bash
# ── App ──────────────────────────────
GEMINI_API_KEYS=""         # Comma-separated keys (free first, paid last) — auto-fallback on quota
GEMINI_API_KEY=""          # Legacy single-key fallback — used if GEMINI_API_KEYS not set
APP_URL=""                 # https://marketsamachar.in
NODE_ENV=""                # production or development
PORT=3000

# ── Admin Auth ───────────────────────
ADMIN_PASSWORD=""          # bcrypt hash — run: npm run setup-admin
SESSION_SECRET=""          # random 32+ char string

# ── Social media env vars REMOVED (pipeline dropped from scope) ──
# TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, FACEBOOK_PAGE_ID,
# FACEBOOK_ACCESS_TOKEN, INSTAGRAM_ACCOUNT_ID, INSTAGRAM_ACCESS_TOKEN
# are no longer required.

# ── Optional News APIs ───────────────
FINNHUB_API_KEY=""         # optional — 60 req/min free
MARKETAUX_API_KEY=""       # optional — 100 req/month free
NEWSAPI_API_KEY=""         # optional — 100 req/day free (dev only)
```

---

## 11. Social Media Pipeline — REMOVED FROM SCOPE

Social-media auto-posting is not part of the product anymore. The
`pipeline/` directory only contains `db.ts` (the shared SQLite layer).
Any references to `pipeline/publishers/`, `pipeline/templates/`,
`pipeline/generator.ts`, Telegram/Facebook/Instagram publishing,
`TELEGRAM_BOT_TOKEN`, `FACEBOOK_ACCESS_TOKEN`, or `INSTAGRAM_ACCESS_TOKEN`
in older notes are historical only — do not build or wire them.

---

## 12. Security Architecture

### What is Public
```
/ and all frontend routes    → everyone
/api/news                    → everyone
/api/market-data             → everyone
/api/health                  → everyone
/admin/login                 → everyone (login page only)
```

### What is Protected (admin session)
```
/pipeline                    → admin only
/api/pipeline/*              → admin only
/output/*                    → admin only

Note: /api/news/refresh is PUBLIC with a 5 req/min per-IP cap so the
app's header refresh button works for regular users.
```

### Auth Implementation
```
Library:  express-session + bcryptjs
Session:  24 hour expiry, httpOnly cookie
Password: bcrypt hash stored in ADMIN_PASSWORD env var
Setup:    npm run setup-admin YourPassword
```

---

## 13. Yahoo Finance Symbols

```typescript
// Queried in parallel every 60s during market hours
const YAHOO_SYMBOLS = [
  { symbol: '^NSEI',    name: 'Nifty 50',     category: 'indian'   },
  { symbol: '^BSESN',   name: 'Sensex',        category: 'indian'   },
  { symbol: '^NSEBANK', name: 'Bank Nifty',    category: 'banking'  },
  { symbol: '^CNXIT',   name: 'Nifty IT',      category: 'indian'   },
  { symbol: 'GC=F',     name: 'Gold',          category: 'commodity'},
  { symbol: 'CL=F',     name: 'Crude Oil',     category: 'commodity'},
  { symbol: 'USDINR=X', name: 'USD/INR',       category: 'economy'  },
]
```

---

## 14. Supported Languages

```typescript
const LANGUAGES = {
  'en': 'English',
  'te': 'Telugu',    // primary Indian language focus
  'hi': 'Hindi',
  'ta': 'Tamil',
  'bn': 'Bengali',
  'mr': 'Marathi',
  'kn': 'Kannada',
}
```

Translation is done server-side via POST /api/translate
using Gemini gemini-2.5-flash in batches of 5 items.
Results are NOT cached — if caching is added, store by
`${batchId}_${lang}` key in SQLite.

---

## 15. Known Issues & Status

```
✅ Fixed  — API key exposure (moved Gemini to server-side)
✅ Fixed  — Wrong model name (now using gemini-2.5-flash)
✅ Fixed  — Pagination (limit/offset params)
✅ Fixed  — Cache persistence (news-cache.json)
✅ Fixed  — Rate limiting on article endpoint
✅ Fixed  — SEBI/RBI regulatory feeds
✅ Fixed  — Yahoo Finance multiple symbols
✅ Fixed  — New categories (IPO, Economy, Banking)
✅ Fixed  — Admin authentication
✅ Fixed  — Pipeline dashboard protected
✅ Done   — SQLite database (pipeline.db)
✅ Done   — Batch detection
✅ Done   — Puppeteer PNG generator
✅ Done   — All 3 platform templates
✅ Done   — All 3 platform publishers
✅ Done   — Pipeline wired into scheduler
✅ Done   — Paper trading (buy/sell/portfolio/leaderboard)
✅ Done   — StockPriceService (Yahoo Finance + 15-min SQLite cache)
✅ Done   — Market Forecast daily predictions (Gemini questions + resolution cron)
✅ Done   — RewardsHub (coins overview, tasks, chart, achievements, referral)
✅ Done   — 5-tab bottom nav (News / Quiz / Trade / Predict / Rewards)
✅ Done   — News Impact Quiz (auto-generated from AI articles, 4-option MCQ, 1X reward)
✅ Done   — IPO Predictions (auto-created for upcoming listings, vote + community stats)
✅ Done   — Centralized reward config (rewardConfig.ts — X=100 base unit)
✅ Done   — Quiz coins → SQLite ledger (was Supabase-only)
✅ Done   — Multi-key Gemini API (free-first, paid fallback)
✅ Fixed  — Language translation (backend now returns { items: [...] }; FE reads data.items)
✅ Fixed  — Global error middleware, SIGTERM/SIGINT graceful shutdown, unhandledRejection logger
✅ Fixed  — CORS locked to APP_URL (was wildcard)
✅ Fixed  — Rate limiter applied before routers; articleLimiter on /api/summarize + /api/translate
✅ Fixed  — SESSION_SECRET fail-closed in production; sameSite:'strict' on admin cookie
✅ Fixed  — Cron expressions corrected (were off by 5h despite Asia/Kolkata timezone)
✅ Fixed  — /api/trading/leaderboard no longer parses unverified JWT; uses optionalAuth middleware
🚫 Dropped — Social media pipeline (Telegram/Facebook/Instagram slides + publishers)
🚫 Dropped — Oracle Cloud VPS deployment (was tied to social pipeline)
❌  Todo  — Pick new hosting provider + domain DNS + SSL
```

---

## 16. Deployment Info

Not finalised. The previous Oracle Cloud plan existed only to host the social
media pipeline (now dropped). For a web-app-only deploy, any Node 20 host
(Render, Railway, Fly.io, Hetzner, DigitalOcean) is sufficient. Must be
writable disk (SQLite file), must set `NODE_ENV=production`, `SESSION_SECRET`,
`APP_URL`, `GEMINI_API_KEYS`, Supabase keys.

---

## 17. Engagement System

### Architecture
```
All engagement backend lives in backend/src/
Auth middleware reads Supabase Bearer JWT → attaches req.user
All coin operations are synchronous (better-sqlite3)
All IST time calculations: new Date(Date.now() + 5.5 * 60 * 60 * 1000)
```

### Virtual Trading (Paper Trading)
```
Page:     src/pages/PaperTrading.tsx
Backend:  backend/src/services/virtualTradingService.ts
Routes:   backend/src/routes/trading.ts  →  /api/trading/*
Stocks:   20 NSE stocks, symbols WITHOUT .NS suffix in DB
Pricing:  Yahoo Finance v8 API → https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}.NS
Cache:    stock_price_cache table, refreshed every 15 min via node-cron
Max qty:  100 shares per order
Coins:    1 coin = ₹1. Deducted on buy, credited on sell.
Activity: +50 coins (0.5X) per trade, +500 coins (5X) when selling with ≥5% profit
```

### Stock Price Service
```
File:     backend/src/services/stockPriceService.ts
Symbols:  POPULAR_SYMBOLS — 20 large-cap NSE stocks
Cron:     "0,15,30,45 * * * *" (every 15 min, Asia/Kolkata timezone)
Fallback: stale cache → zero placeholder (never throws 500)
Market hours check: Mon–Fri 9:15–15:30 IST (mins 555–930)
```

### Daily Predictions (Market Forecast)
```
Component: src/components/MarketForecast.tsx (also in sidebar on desktop)
Backend:   backend/src/services/predictionService.ts
Routes:    backend/src/routes/predictions.ts  →  /api/predictions/*
Questions: 1 Nifty direction + 1 Gemini-generated stock question per day
Cron:      Create at 08:45 IST (Mon–Fri), resolve at 15:35 IST (Mon–Fri)
Coins:     +100 (1X) for voting, +300 (3X) for correct answer
```

### Rewards Hub
```
Page:    src/pages/RewardsHub.tsx
Routes:  backend/src/routes/rewards.ts  →  /api/rewards/*
Shows:   coin balance, IQ score + title, today's tasks, 7-day chart,
         activity feed (samachar_coins ledger), achievements, referral
Chart:   recharts BarChart (stacked) — Quiz/Predictions/Trading/Streak
```

### News Impact Quiz
```
Component: src/components/NewsImpactQuiz.tsx
Routes:    backend/src/routes/newsImpact.ts  →  /api/news-impact/*
DB tables: news_impact_questions, user_news_impact_answers
Questions: 4-option MCQ auto-generated from AI-processed articles
           Generated in processOneArticle() → generateNewsImpactQuestion()
Expiry:    Questions expire after 48 hours
Coins:     +100 (1X) for correct answer (NEWS_IMPACT_CORRECT)
```

### IPO Predictions
```
Component: src/components/IPOPredictions.tsx
Routes:    backend/src/routes/ipoPredictions.ts  →  /api/ipo-predictions/*
DB tables: ipo_predictions, user_ipo_predictions
Questions: Auto-created by cron at 09:00 IST daily for IPOs listing within 3 days
Vote:      "Above Issue Price" or "Below Issue Price"
Coins:     +100 (1X) for voting (IPO_PREDICTION), +500 (5X) for correct (IPO_CORRECT)
Resolve:   resolveIpoPrediction() called when listing data available
```

### Gemini Multi-Key Manager
```
File:      backend/src/services/geminiKeyManager.ts
Keys:      GEMINI_API_KEYS env var (comma-separated, free first, paid last)
Fallback:  auto-switches to next key on 429/quota exhaustion (1-hour cooldown)
Exports:   geminiCall(), geminiStructuredCall(), getKeyStatus(), hasAvailableKey()
Status:    /api/test-gemini returns key usage stats
```

### AI Pipeline (Hybrid)
```
Mode 1:    INLINE — process articles immediately after fetchNews()
Mode 2:    BACKGROUND — 3-min interval safety net catches missed articles
Mode 3:    BACKFILL — 4-min interval for old articles missing social captions
Lock:      aiPipelineBusy prevents simultaneous runs
Per article generates: AI summary, translations (5 languages), social captions (3 platforms), news impact quiz question
```

### Platform-Specific Social Captions
```
Telegram:  Short, punchy, data-first. No hashtags. Max 280 chars.
Facebook:  Conversational, engagement question at end. No hashtags. Max 500 chars.
Instagram: Bold hook, emoji-rich, 12-15 hashtags. Max 1500 chars.
Generated: Part of generateArticleAiData() prompt, stored in social_captions column
Publishers: telegram.ts, facebook.ts, instagram.ts use AI captions first, fallback to template
```

### Coin Economy
```
X = 100 coins (base unit). All rewards scale from this.
Config file:           backend/src/services/rewardConfig.ts (single source of truth)
New users start with:  10X = 1,000 virtual_coin_balance (SQLite users table)
First login:           10X = 1,000 coins welcome bonus
Daily login:           1X  = 100 coins daily
Streak bonus:          +0.5X per consecutive day (max 5X = 500)
Referral:              5X  = 500 coins to both referrer + new user
Quiz correct:          1X = 100 × IQ-tier-mult per correct (1 play/day)
Quiz perfect (5/5):    3X = 300 × IQ-tier-mult bonus
                       IQ-tier-mult: News Reader 1.0× → Rookie 1.2× → Analyst 1.5× →
                                     Seasoned 2.0× → Dalal St Pro 2.5× → Market Guru 3.0×
                       → Guru earning a perfect 5/5 = (500 × 3.0) + (300 × 3.0) = 2400 coins
Quiz IQ delta:         perCorrect = 15 + max(0, 10 − avgSecsPerQ/2) points per correct
                       × streak multiplier (min(1 + streak × 0.1, 2.0))
                       − 5 per wrong/timeout — speed now matters continuously
Quiz podium (top 3):   10X / 7.5X / 5X = 1000 / 750 / 500 coins per period
                       Ranked by IQ DELTA earned (not raw score) — speed + streak both feed in
                       Paid by cron for daily (23:55 IST), weekly (Sun 23:55), monthly (month-end 23:55)
                       Dedup via `quiz_podium_payouts` table — safe to run twice per period
Prediction vote:       1X  = 100 coins for participating
Prediction correct:    3X  = 300 coins for correct answer
News Impact correct:   1X  = 100 coins per correct answer
IPO prediction vote:   1X  = 100 coins for participating
IPO prediction correct:5X  = 500 coins for correct IPO call
Trade activity:        0.5X = 50 coins per trade
Portfolio profit:      5X  = 500 coins for ≥5% gain
Coin source of truth:  SQLite `virtual_coin_balance` + `samachar_coins` ledger
                       Supabase `profiles.coins` is a read-only mirror
InsufficientCoinsError: thrown by deductCoins(), caught in trading routes → HTTP 402
```

### Cron Jobs (in server.ts)
```
"0,15,30,45 * * * *"  Asia/Kolkata  → refreshPopularStocks()
"45 3 * * 1-5"        Asia/Kolkata  → createDailyPredictions()       (= 08:45 IST)
"35 10 * * 1-5"       Asia/Kolkata  → resolvePredictions()            (= 15:35 IST)
"0 3 * * *"           Asia/Kolkata  → createIPOPredictionQuestions()  (= 09:00 IST daily)
"0 0 * * *"           Asia/Kolkata  → scrapeAndSaveIPOs()             (= 00:00 IST daily)
"55 23 * * *"         Asia/Kolkata  → payoutPodium('daily')           (= 23:55 IST daily)
"55 23 * * 0"         Asia/Kolkata  → payoutPodium('weekly')          (= 23:55 IST Sundays)
"55 23 * * *"         Asia/Kolkata  → payoutPodium('monthly') if last day of month
"30 3 * * *"          Asia/Kolkata  → nightly cleanup (news, batches, expired quiz Qs)
Background intervals:
  3-min  → processUnprocessedArticles('background')  — AI summary safety net
  4-min  → backfill articles missing social captions
```

### Auth Middleware
```
File:  backend/src/middleware/auth.ts
Usage: import { requireAuth } from "../middleware/auth.ts"
       router.use(requireAuth)  — applies to all routes below
Reads: Authorization: Bearer <supabase_access_token>
Sets:  req.user = { id, email, name }
```

---

## 18. Important Rules for Claude Code

1. **Never expose GEMINI_API_KEY(S) to frontend** — all AI calls via server routes only. Use `geminiCall()` from `geminiKeyManager.ts` for all Gemini API calls — never instantiate `GoogleGenAI` directly.
2. **Always use `gemini-2.5-flash`** as the model name — no other Gemini model names
3. **Never hardcode credentials** — always read from `process.env`
4. **Brand name is "Market Samachar"** — replace any old names if found
5. **SQLite only** — do not suggest or add PostgreSQL/MongoDB/Redis
6. **Protected routes** — any new pipeline or admin route must use `requireAdmin` middleware; new user-facing routes must use `requireAuth`
7. **news-cache.json and pipeline.db** — never commit these to git
8. **output/ folder** — never commit PNG files to git
9. **Slide dimensions** — always 1080×1080px for social media images
10. **IST timezone** — all schedule logic must use IST (UTC+5:30)
11. **Category colors** — always use the defined color map, never random colors
12. **DM Mono for numbers** — any price, percentage, or numeric display uses monospace
13. **Stock symbols** — store and query WITHOUT `.NS` suffix; add it only when calling Yahoo Finance
14. **InsufficientCoinsError** — use explicit field declarations (not TypeScript parameter properties) for Node.js ESM compatibility
15. **Gemini response** — access text as `response.text` (not `response.response.candidates[0]...`)
16. **New users get 1000 coins** — `virtual_coin_balance` defaults to `STARTING_BALANCE` (1000) from `rewardConfig.ts`
17. **All reward amounts** — must come from `backend/src/services/rewardConfig.ts`. Never hardcode coin values elsewhere.

---

## 19. Useful Commands

```bash
# Development
npm run dev                    # start dev server

# Production
npm start                      # start production server
pm2 restart marketsamachar     # restart on server

# Admin setup (first time only)
npm run setup-admin YourPassword

# Database check
sqlite3 pipeline.db ".tables"
sqlite3 pipeline.db "SELECT COUNT(*) FROM news_items;"
sqlite3 pipeline.db "SELECT * FROM batches ORDER BY fetched_at DESC LIMIT 5;"

# PM2 commands
pm2 status
pm2 logs marketsamachar
pm2 monit

# Test core API
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/news?category=indian&limit=5"
curl -X POST http://localhost:3000/api/news/refresh

# Test engagement API
curl http://localhost:3000/api/stocks/popular
curl http://localhost:3000/api/stocks/market-status
curl http://localhost:3000/api/trading/leaderboard

# Test with auth (replace TOKEN with a Supabase access_token)
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/trading/portfolio
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/predictions/today
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/rewards/hub
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/news-impact/questions
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/ipo-predictions/open

# Check engagement tables
sqlite3 pipeline.db "SELECT COUNT(*) FROM virtual_orders;"
sqlite3 pipeline.db "SELECT * FROM daily_predictions ORDER BY created_at DESC LIMIT 3;"
sqlite3 pipeline.db "SELECT * FROM samachar_coins ORDER BY created_at DESC LIMIT 10;"
sqlite3 pipeline.db "SELECT COUNT(*) FROM news_impact_questions;"
sqlite3 pipeline.db "SELECT * FROM ipo_predictions ORDER BY created_at DESC LIMIT 3;"
```

---

## 20. Revenue Plan

```
Phase 1 — Launch (now)
  Web app only — no social pipeline
  Hosting TBD (any Node 20 host)

Phase 2 — Monetise (month 2-3)
  Google AdSense on news website
  Target: ₹5,000-15,000/month

Phase 3 — Scale (month 4+)
  Premium Telegram alerts
  Stock-specific news subscriptions
  Fintech/broker affiliate partnerships
```

---

*Last updated: 17 April 2026 — pre-launch hardening pass; stale BazaarBaazi/BazaarBhavishya and social-pipeline references cleaned up.*
*Project: Market Samachar — marketsamachar.in*
