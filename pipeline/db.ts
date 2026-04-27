import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ─── Connection ───────────────────────────────────────────────────────────────

// DB_PATH env var allows pointing to a Railway Persistent Volume.
// Example: DB_PATH=/data/pipeline.db
// Falls back to project-root pipeline.db for local development.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve("pipeline.db");

// Ensure the directory exists (important when DB_PATH is on a new volume mount)
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Enforce foreign-key constraints when declared (no-op for existing tables
// without REFERENCES clauses; new tables can now safely declare FKs).
db.pragma("foreign_keys = ON");

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS news_items (
    id               TEXT    PRIMARY KEY,
    title            TEXT    NOT NULL,
    link             TEXT    NOT NULL,
    pub_date         TEXT    NOT NULL,
    source           TEXT    NOT NULL,
    category         TEXT    NOT NULL,
    content_snippet  TEXT,
    fetched_at       INTEGER NOT NULL,
    batch_id         TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS batches (
    id              TEXT    PRIMARY KEY,
    fetched_at      INTEGER NOT NULL,
    item_count      INTEGER NOT NULL,
    new_item_count  INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    date           TEXT    PRIMARY KEY,  -- YYYY-MM-DD IST
    questions_json TEXT    NOT NULL,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    date         TEXT    NOT NULL,   -- YYYY-MM-DD IST
    score        INTEGER NOT NULL,
    time_secs    INTEGER NOT NULL,
    answers_json TEXT    NOT NULL,
    coins_earned INTEGER NOT NULL DEFAULT 0,
    iq_change    INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS quiz_sessions (
    user_id      TEXT    NOT NULL,
    date         TEXT    NOT NULL,      -- YYYY-MM-DD IST
    answers_json TEXT    NOT NULL DEFAULT '[]',
    current_q    INTEGER NOT NULL DEFAULT 0,
    coins_so_far INTEGER NOT NULL DEFAULT 0,
    started_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    date         TEXT    NOT NULL,   -- YYYY-MM-DD IST
    prediction   TEXT    NOT NULL,   -- 'up' | 'down'
    result       TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'correct' | 'wrong'
    created_at   INTEGER NOT NULL,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS ipos (
    id                  TEXT    PRIMARY KEY,   -- md5(company_name + open_date)
    company_name        TEXT    NOT NULL,
    symbol              TEXT,
    open_date           TEXT,                  -- YYYY-MM-DD IST
    close_date          TEXT,
    allotment_date      TEXT,
    listing_date        TEXT,
    price_band_low      INTEGER,
    price_band_high     INTEGER,
    lot_size            INTEGER,
    gmp                 INTEGER,               -- Grey Market Premium in ₹ (nullable)
    subscription_status REAL,                 -- e.g. 25.5 = 25.5× subscribed
    category            TEXT    NOT NULL DEFAULT 'mainboard',  -- mainboard | sme
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock_kaun (
    date        TEXT    PRIMARY KEY,  -- YYYY-MM-DD IST
    symbol      TEXT    NOT NULL,
    clues_json  TEXT    NOT NULL,     -- JSON array of 5 clue strings
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id                    TEXT    PRIMARY KEY,  -- Instamojo payment_request_id
    user_id               TEXT    NOT NULL,
    email                 TEXT    NOT NULL,
    amount                INTEGER NOT NULL,     -- INR whole number
    plan                  TEXT    NOT NULL,     -- daily|monthly|yearly
    instamojo_payment_id  TEXT,                -- filled on webhook
    status                TEXT    NOT NULL DEFAULT 'pending', -- pending|success|failed
    created_at            INTEGER NOT NULL
  );
`);

// ── Migrations ────────────────────────────────────────────────────────────────
try { db.exec('ALTER TABLE news_items ADD COLUMN mentioned_symbols TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN price_impact_json TEXT'); } catch {}
try { db.exec('ALTER TABLE payments ADD COLUMN utr_number TEXT'); } catch {}
try { db.exec('ALTER TABLE payments ADD COLUMN phone TEXT'); } catch {}
try { db.exec('ALTER TABLE payments ADD COLUMN notes TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN ai_summary TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN summary_bullets TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN sentiment TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN impact_sectors TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN key_numbers TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN translations TEXT'); } catch {}
try { db.exec('ALTER TABLE news_items ADD COLUMN ai_processed_at INTEGER'); } catch {}

// rewards_log — tracks every manual or automatic Pro grant
db.exec(`
  CREATE TABLE IF NOT EXISTS rewards_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    email       TEXT,
    days        INTEGER NOT NULL,
    reason      TEXT    NOT NULL,   -- 'quiz_win' | 'admin_grant' | 'contest' | 'other'
    granted_by  TEXT    NOT NULL DEFAULT 'admin',
    created_at  INTEGER NOT NULL
  );
`);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  pub_date: string;
  source: string;
  category: string;
  content_snippet?: string;
}

export interface Batch {
  id: string;
  fetched_at: number;
  item_count: number;
  new_item_count: number;
  status: string;
  items?: NewsItem[];
}

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmts = {
  insertItem: db.prepare(`
    INSERT OR IGNORE INTO news_items
      (id, title, link, pub_date, source, category, content_snippet, fetched_at, batch_id)
    VALUES
      (@id, @title, @link, @pub_date, @source, @category, @content_snippet, @fetched_at, @batch_id)
  `),

  itemExists: db.prepare(`
    SELECT 1 FROM news_items WHERE id = ? LIMIT 1
  `),

  insertBatch: db.prepare(`
    INSERT OR REPLACE INTO batches (id, fetched_at, item_count, new_item_count, status)
    VALUES (@id, @fetched_at, @item_count, @new_item_count, @status)
  `),

  getBatch: db.prepare(`
    SELECT * FROM batches WHERE id = ?
  `),

  getBatchItems: db.prepare(`
    SELECT * FROM news_items WHERE batch_id = ? ORDER BY pub_date DESC
  `),

  updateBatchStatus: db.prepare(`
    UPDATE batches SET status = ? WHERE id = ?
  `),

  getRecentBatches: db.prepare(`
    SELECT * FROM batches ORDER BY fetched_at DESC LIMIT ?
  `),

  upsertQuiz: db.prepare(`
    INSERT OR REPLACE INTO quiz_questions (date, questions_json, created_at)
    VALUES (@date, @questions_json, @created_at)
  `),

  getQuiz: db.prepare(`
    SELECT * FROM quiz_questions WHERE date = ?
  `),

  todayBatches: db.prepare(`
    SELECT COUNT(*) AS n FROM batches WHERE fetched_at >= ?
  `),

  // ── quiz_sessions ─────────────────────────────────────────────────────────
  getSession: db.prepare(`
    SELECT * FROM quiz_sessions WHERE user_id = ? AND date = ? LIMIT 1
  `),

  upsertSession: db.prepare(`
    INSERT INTO quiz_sessions (user_id, date, answers_json, current_q, coins_so_far, started_at, updated_at)
    VALUES (@user_id, @date, @answers_json, @current_q, @coins_so_far, @started_at, @updated_at)
    ON CONFLICT(user_id, date) DO UPDATE SET
      answers_json = excluded.answers_json,
      current_q    = excluded.current_q,
      coins_so_far = excluded.coins_so_far,
      updated_at   = excluded.updated_at
  `),

  deleteSession: db.prepare(`
    DELETE FROM quiz_sessions WHERE user_id = ? AND date = ?
  `),

  // ── quiz_attempts ──────────────────────────────────────────────────────────
  saveAttempt: db.prepare(`
    INSERT OR IGNORE INTO quiz_attempts
      (user_id, date, score, time_secs, answers_json, coins_earned, iq_change, created_at)
    VALUES
      (@user_id, @date, @score, @time_secs, @answers_json, @coins_earned, @iq_change, @created_at)
  `),

  getAttempt: db.prepare(`
    SELECT * FROM quiz_attempts WHERE user_id = ? AND date = ? LIMIT 1
  `),

  getTop10ForDate: db.prepare(`
    SELECT user_id, score, time_secs, coins_earned, iq_change
    FROM quiz_attempts
    WHERE date = ?
    ORDER BY score DESC, time_secs ASC
    LIMIT 10
  `),

  // ── predictions ────────────────────────────────────────────────────────────
  savePrediction: db.prepare(`
    INSERT OR IGNORE INTO predictions (user_id, date, prediction, result, created_at)
    VALUES (@user_id, @date, @prediction, 'pending', @created_at)
  `),

  getPrediction: db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? AND date = ? LIMIT 1
  `),

  resolvePredictionsCorrect: db.prepare(`
    UPDATE predictions SET result = 'correct'
    WHERE date = ? AND prediction = ? AND result = 'pending'
  `),

  resolvePredictionsWrong: db.prepare(`
    UPDATE predictions SET result = 'wrong'
    WHERE date = ? AND prediction != ? AND result = 'pending'
  `),

  // ── payments ───────────────────────────────────────────────────────────────
  insertPayment: db.prepare(`
    INSERT OR IGNORE INTO payments
      (id, user_id, email, amount, plan, status, created_at)
    VALUES
      (@id, @user_id, @email, @amount, @plan, 'pending', @created_at)
  `),

  updatePaymentSuccess: db.prepare(`
    UPDATE payments
    SET status = 'success', instamojo_payment_id = ?
    WHERE id = ?
  `),

  updatePaymentFailed: db.prepare(`
    UPDATE payments SET status = 'failed' WHERE id = ?
  `),

  // ── Mystery Stock ───────────────────────────────────────────────────────────
  upsertMysteryStock: db.prepare(`
    INSERT OR REPLACE INTO stock_kaun (date, symbol, clues_json, created_at)
    VALUES (@date, @symbol, @clues_json, @created_at)
  `),

  getMysteryStock: db.prepare(`
    SELECT * FROM stock_kaun WHERE date = ? LIMIT 1
  `),

  // ── News Impact ────────────────────────────────────────────────────────────
  updateNewsSymbols: db.prepare(`
    UPDATE news_items SET mentioned_symbols = ? WHERE id = ?
  `),

  updateNewsPriceImpact: db.prepare(`
    UPDATE news_items SET price_impact_json = ? WHERE id = ?
  `),

  getArticlesNeedingSymbols: db.prepare(`
    SELECT id, title, category, fetched_at
    FROM news_items
    WHERE mentioned_symbols IS NULL
      AND category IN ('indian', 'companies', 'banking', 'economy', 'ipo')
    ORDER BY fetched_at DESC
    LIMIT 20
  `),

  getArticlesForImpactCheck: db.prepare(`
    SELECT id, title, mentioned_symbols, price_impact_json, fetched_at
    FROM news_items
    WHERE mentioned_symbols IS NOT NULL
      AND mentioned_symbols != '[]'
      AND fetched_at > ?
    ORDER BY fetched_at DESC
  `),

  getNewsById: db.prepare(`
    SELECT id, title, mentioned_symbols, price_impact_json, fetched_at
    FROM news_items
    WHERE id = ?
    LIMIT 1
  `),

  // ── AI Processing ──────────────────────────────────────────────────────────
  getArticlesNeedingAiProcessing: db.prepare(`
    SELECT id, title, content_snippet
    FROM news_items
    WHERE ai_processed_at IS NULL
    ORDER BY fetched_at DESC
    LIMIT 20
  `),

  updateArticleAiData: db.prepare(`
    UPDATE news_items SET
      ai_summary       = @ai_summary,
      summary_bullets  = @summary_bullets,
      sentiment        = @sentiment,
      impact_sectors   = @impact_sectors,
      key_numbers      = @key_numbers,
      translations     = @translations,
      ai_processed_at  = @ai_processed_at
    WHERE id = @id
  `),

  getAiDataForIds: db.prepare(`
    SELECT id, ai_summary, summary_bullets, sentiment, impact_sectors, key_numbers, translations
    FROM news_items
    WHERE id IN (SELECT value FROM json_each(?))
      AND ai_processed_at IS NOT NULL
  `),

  getArticleAiData: db.prepare(`
    SELECT ai_summary, summary_bullets, sentiment, impact_sectors, key_numbers
    FROM news_items
    WHERE id = ?
    LIMIT 1
  `),
};

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Persist a batch and all its items.
 * Returns the count of items that were not previously seen (truly new).
 */
export function saveBatch(batchId: string, items: NewsItem[]): number {
  const now = Date.now();

  // Count new items before inserting (INSERT OR IGNORE means duplicates are skipped)
  let newCount = 0;
  const insertMany = db.transaction(() => {
    for (const item of items) {
      const exists = stmts.itemExists.get(item.id);
      if (!exists) newCount++;
      stmts.insertItem.run({
        id:              item.id,
        title:           item.title,
        link:            item.link,
        pub_date:        item.pub_date,
        source:          item.source,
        category:        item.category,
        content_snippet: item.content_snippet ?? null,
        fetched_at:      now,
        batch_id:        batchId,
      });
    }
  });

  insertMany();

  stmts.insertBatch.run({
    id:             batchId,
    fetched_at:     now,
    item_count:     items.length,
    new_item_count: newCount,
    status:         "pending",
  });

  return newCount;
}

/**
 * Retrieve a batch record along with all its associated news items.
 */
export function getBatch(batchId: string): Batch | null {
  const batch = stmts.getBatch.get(batchId) as Batch | undefined;
  if (!batch) return null;
  batch.items = stmts.getBatchItems.all(batchId) as NewsItem[];
  return batch;
}

/**
 * Update the processing status of a batch.
 */
export function updateBatchStatus(batchId: string, status: string): void {
  stmts.updateBatchStatus.run(status, batchId);
}

/**
 * Return the most recent batches for dashboard / monitoring use.
 */
export function getRecentBatches(limit = 10): Batch[] {
  return stmts.getRecentBatches.all(limit) as Batch[];
}

/**
 * Return today's (last 24 h) fetch stats.
 */
export function getTodayStats(): {
  batches: number;
} {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return {
    batches: ((stmts.todayBatches.get(since)   as any).n as number),
  };
}

// ─── Quiz helpers ─────────────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];          // exactly 4
  correct_index: number;
  explanation: string;
  news_source_url: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Persist a generated quiz for a given IST date.
 */
export function saveQuizForDate(date: string, questions: QuizQuestion[]): void {
  stmts.upsertQuiz.run({
    date,
    questions_json: JSON.stringify(questions),
    created_at:     Date.now(),
  });
}

/**
 * Retrieve the quiz for a given IST date, or null if not yet generated.
 */
export function getQuizForDate(date: string): QuizQuestion[] | null {
  const row = stmts.getQuiz.get(date) as { questions_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.questions_json) as QuizQuestion[];
}

// ─── Quiz Attempts ────────────────────────────────────────────────────────────

export interface QuizAttempt {
  id: number;
  user_id: string;
  date: string;
  score: number;
  time_secs: number;
  answers_json: string;
  coins_earned: number;
  iq_change: number;
  created_at: number;
}

/**
 * Write a quiz attempt to the local SQLite store.
 * IGNORE on duplicate (user_id, date) — one attempt per day per user.
 */
export function saveLocalAttempt(a: Omit<QuizAttempt, 'id'>): void {
  stmts.saveAttempt.run(a);
}

/** Return a user's attempt for a given date, or null. */
export function getLocalAttempt(userId: string, date: string): QuizAttempt | null {
  return (stmts.getAttempt.get(userId, date) as QuizAttempt | undefined) ?? null;
}

/** Top 10 scores for a given date (for local leaderboard fallback). */
export function getTop10ForDate(
  date: string,
): Array<{ user_id: string; score: number; time_secs: number; coins_earned: number; iq_change: number }> {
  return stmts.getTop10ForDate.all(date) as any[];
}

// ─── Quiz Sessions ────────────────────────────────────────────────────────────

export interface QuizSessionRow {
  user_id:      string;
  date:         string;
  answers_json: string;
  current_q:    number;
  coins_so_far: number;
  started_at:   number;
  updated_at:   number;
}

export function getQuizSession(userId: string, date: string): QuizSessionRow | null {
  return (stmts.getSession.get(userId, date) as QuizSessionRow | undefined) ?? null;
}

export function upsertQuizSession(row: QuizSessionRow): void {
  stmts.upsertSession.run(row);
}

export function deleteQuizSession(userId: string, date: string): void {
  stmts.deleteSession.run(userId, date);
}

// ─── Predictions ──────────────────────────────────────────────────────────────

export interface Prediction {
  id: number;
  user_id: string;
  date: string;
  prediction: 'up' | 'down';
  result: 'pending' | 'correct' | 'wrong';
  created_at: number;
}

/**
 * Save a Nifty up/down prediction for today.
 * IGNORE on duplicate (user_id, date) — one prediction per day per user.
 */
export function savePrediction(p: { user_id: string; date: string; prediction: string }): void {
  stmts.savePrediction.run({ ...p, created_at: Date.now() });
}

/** Return a user's prediction for a given date, or null. */
export function getPrediction(userId: string, date: string): Prediction | null {
  return (stmts.getPrediction.get(userId, date) as Prediction | undefined) ?? null;
}

/**
 * Resolve all pending predictions for a date once the market closes.
 * direction: 'up' | 'down' — the actual Nifty direction for that day.
 * Returns total number of rows updated.
 */
export function resolvePredictionsForDate(date: string, direction: 'up' | 'down'): number {
  const r1 = stmts.resolvePredictionsCorrect.run(date, direction) as { changes: number };
  const r2 = stmts.resolvePredictionsWrong.run(date, direction)   as { changes: number };
  return r1.changes + r2.changes;
}

// ─── Payment helpers ──────────────────────────────────────────────────────────

export interface Payment {
  id:                   string;
  user_id:              string;
  email:                string;
  amount:               number;
  plan:                 string;
  instamojo_payment_id: string | null;
  status:               'pending' | 'success' | 'failed';
  created_at:           number;
}

export function savePayment(p: Omit<Payment, 'instamojo_payment_id' | 'status'>): void {
  stmts.insertPayment.run({ ...p });
}

export function markPaymentSuccess(requestId: string, paymentId: string): void {
  stmts.updatePaymentSuccess.run(paymentId, requestId);
}

export function markPaymentFailed(requestId: string): void {
  stmts.updatePaymentFailed.run(requestId);
}

/** Retrieve a payment record by Instamojo payment_request_id. */
export function getPaymentById(requestId: string): Payment | null {
  const row = db.prepare('SELECT * FROM payments WHERE id = ? LIMIT 1').get(requestId);
  return (row as Payment | undefined) ?? null;
}

// ─── IPO helpers ──────────────────────────────────────────────────────────────

export interface IPORecord {
  id:                  string;
  company_name:        string;
  symbol:              string | null;
  open_date:           string | null;
  close_date:          string | null;
  allotment_date:      string | null;
  listing_date:        string | null;
  price_band_low:      number | null;
  price_band_high:     number | null;
  lot_size:            number | null;
  gmp:                 number | null;
  subscription_status: number | null;
  category:            'mainboard' | 'sme';
  created_at:          number;
  updated_at:          number;
}

const ipoStmts = {
  upsert: db.prepare(`
    INSERT INTO ipos
      (id, company_name, symbol, open_date, close_date, allotment_date, listing_date,
       price_band_low, price_band_high, lot_size, gmp, subscription_status, category,
       created_at, updated_at)
    VALUES
      (@id, @company_name, @symbol, @open_date, @close_date, @allotment_date, @listing_date,
       @price_band_low, @price_band_high, @lot_size, @gmp, @subscription_status, @category,
       @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      company_name        = excluded.company_name,
      symbol              = excluded.symbol,
      open_date           = excluded.open_date,
      close_date          = excluded.close_date,
      allotment_date      = excluded.allotment_date,
      listing_date        = excluded.listing_date,
      price_band_low      = excluded.price_band_low,
      price_band_high     = excluded.price_band_high,
      lot_size            = excluded.lot_size,
      gmp                 = excluded.gmp,
      subscription_status = excluded.subscription_status,
      category            = excluded.category,
      updated_at          = excluded.updated_at
  `),

  getAll: db.prepare(`
    SELECT * FROM ipos
    ORDER BY
      CASE WHEN open_date IS NULL THEN 1 ELSE 0 END,
      open_date DESC
  `),

  getById: db.prepare(`SELECT * FROM ipos WHERE id = ? LIMIT 1`),

  delete: db.prepare(`DELETE FROM ipos WHERE id = ?`),

  updateGMP: db.prepare(`
    UPDATE ipos SET gmp = ?, updated_at = ? WHERE id = ?
  `),

  updateSubscription: db.prepare(`
    UPDATE ipos SET subscription_status = ?, updated_at = ? WHERE id = ?
  `),
};

export function upsertIPO(ipo: Omit<IPORecord, 'created_at' | 'updated_at'> & { created_at?: number }): void {
  const now = Date.now();
  ipoStmts.upsert.run({
    ...ipo,
    symbol:              ipo.symbol              ?? null,
    open_date:           ipo.open_date           ?? null,
    close_date:          ipo.close_date          ?? null,
    allotment_date:      ipo.allotment_date      ?? null,
    listing_date:        ipo.listing_date        ?? null,
    price_band_low:      ipo.price_band_low      ?? null,
    price_band_high:     ipo.price_band_high     ?? null,
    lot_size:            ipo.lot_size            ?? null,
    gmp:                 ipo.gmp                 ?? null,
    subscription_status: ipo.subscription_status ?? null,
    created_at:          ipo.created_at          ?? now,
    updated_at:          now,
  });
}

export function getAllIPOs(): IPORecord[] {
  return ipoStmts.getAll.all() as IPORecord[];
}

export function getIPOById(id: string): IPORecord | null {
  return (ipoStmts.getById.get(id) as IPORecord | undefined) ?? null;
}

export function deleteIPO(id: string): void {
  ipoStmts.delete.run(id);
}

export function updateIPOGMP(id: string, gmp: number): void {
  ipoStmts.updateGMP.run(gmp, Date.now(), id);
}

// ─── Mystery Stock helpers ────────────────────────────────────────────────────

export interface MysteryStockRow {
  date:        string;
  symbol:      string;
  clues_json:  string;
  created_at:  number;
}

export function upsertMysteryStock(date: string, symbol: string, clues: string[]): void {
  stmts.upsertMysteryStock.run({ date, symbol, clues_json: JSON.stringify(clues), created_at: Date.now() });
}

export function getMysteryStockForDate(date: string): MysteryStockRow | null {
  return (stmts.getMysteryStock.get(date) as MysteryStockRow | undefined) ?? null;
}

// ─── News Impact helpers ──────────────────────────────────────────────────────

export interface NewsImpactRow {
  id:                string;
  title:             string;
  mentioned_symbols: string | null;
  price_impact_json: string | null;
  fetched_at:        number;
}

export function updateMentionedSymbols(id: string, symbols: string[]): void {
  stmts.updateNewsSymbols.run(JSON.stringify(symbols), id);
}

export function updateNewsPriceImpact(id: string, impactJson: string): void {
  stmts.updateNewsPriceImpact.run(impactJson, id);
}

export function getArticlesNeedingSymbols(): Array<{ id: string; title: string; category: string; fetched_at: number }> {
  return stmts.getArticlesNeedingSymbols.all() as any[];
}

/** Returns articles 1–8 days old that have symbols (cutoffMs = 8 days ago). */
export function getArticlesForImpactCheck(cutoffMs: number): NewsImpactRow[] {
  return stmts.getArticlesForImpactCheck.all(cutoffMs) as NewsImpactRow[];
}

export function getNewsById(id: string): NewsImpactRow | null {
  return (stmts.getNewsById.get(id) as NewsImpactRow | undefined) ?? null;
}

// ─── Payment admin helpers ────────────────────────────────────────────────────

export function getAllPayments(limit = 100): Payment[] {
  return db.prepare(
    'SELECT * FROM payments ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as Payment[];
}

export function updatePaymentUTR(requestId: string, utr: string): void {
  db.prepare('UPDATE payments SET utr_number = ? WHERE id = ?').run(utr, requestId);
}

// ─── Rewards log ──────────────────────────────────────────────────────────────

export interface RewardLogEntry {
  id:         number;
  user_id:    string;
  email:      string | null;
  days:       number;
  reason:     string;
  granted_by: string;
  created_at: number;
}

export function addRewardLog(entry: Omit<RewardLogEntry, 'id'>): void {
  db.prepare(`
    INSERT INTO rewards_log (user_id, email, days, reason, granted_by, created_at)
    VALUES (@user_id, @email, @days, @reason, @granted_by, @created_at)
  `).run(entry);
}

export function getRewardLogs(limit = 200): RewardLogEntry[] {
  return db.prepare(
    'SELECT * FROM rewards_log ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as RewardLogEntry[];
}

// ─── AI Processing helpers ────────────────────────────────────────────────────

export interface AiArticleData {
  ai_summary: string;
  summary_bullets: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  impact_sectors: string[];
  key_numbers: Array<{ value: string; context: string }>;
  translations: Record<string, { title: string; summary: string; bullets: string[] }>;
}

/**
 * Returns up to 20 articles that have not yet been AI-processed, newest first.
 */
export function getArticlesNeedingAiProcessing(): Array<{ id: string; title: string; content_snippet: string | null }> {
  return stmts.getArticlesNeedingAiProcessing.all() as any[];
}

/**
 * Persist AI-generated data for a given article.
 */
export function saveArticleAiData(id: string, data: AiArticleData): void {
  stmts.updateArticleAiData.run({
    id,
    ai_summary:      data.ai_summary,
    summary_bullets: JSON.stringify(data.summary_bullets),
    sentiment:       data.sentiment,
    impact_sectors:  JSON.stringify(data.impact_sectors),
    key_numbers:     JSON.stringify(data.key_numbers),
    translations:    JSON.stringify(data.translations),
    ai_processed_at: Date.now(),
  });
}

/**
 * Returns a map of id → raw DB AI columns for a list of article IDs.
 * Only returns rows that have already been AI-processed.
 */
export function getAiDataBatch(ids: string[]): Record<string, {
  ai_summary: string | null;
  summary_bullets: string | null;
  sentiment: string | null;
  impact_sectors: string | null;
  key_numbers: string | null;
  translations: string | null;
}> {
  if (ids.length === 0) return {};
  const rows = stmts.getAiDataForIds.all(JSON.stringify(ids)) as any[];
  const map: Record<string, any> = {};
  for (const row of rows) {
    map[row.id] = row;
  }
  return map;
}

/**
 * Return the raw AI data columns for a single article.
 */
export function getArticleAiData(id: string): {
  ai_summary: string | null;
  summary_bullets: string | null;
  sentiment: string | null;
  impact_sectors: string | null;
  key_numbers: string | null;
} | null {
  return (stmts.getArticleAiData.get(id) as any) ?? null;
}

// ─── Quiz admin helpers ───────────────────────────────────────────────────────

/** Return quiz attempts for a given IST date, newest first. */
export function getAttemptsForDate(date: string): Array<{
  user_id: string; date: string; score: number; time_secs: number;
  coins_earned: number; iq_change: number; created_at: number;
}> {
  return db.prepare(
    'SELECT * FROM quiz_attempts WHERE date = ? ORDER BY created_at DESC'
  ).all(date) as any[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATION 005 — Engagement Ecosystem
// ═══════════════════════════════════════════════════════════════════════════════

// ── users (local SQLite cache of Supabase profiles) ───────────────────────────
// Stores the subset of user fields needed for server-side engagement logic.
// Synced lazily: upserted whenever a user interacts with any engagement API.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                   TEXT    PRIMARY KEY,   -- Supabase UUID (auth.users.id)
    email                TEXT,
    name                 TEXT,
    avatar               TEXT,
    coins                INTEGER NOT NULL DEFAULT 0,
    virtual_coin_balance INTEGER NOT NULL DEFAULT 1000,
    referral_code        TEXT    UNIQUE,        -- random 8-char uppercase code
    referred_by          TEXT,                  -- user_id of referrer (nullable)
    is_pro               INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code);
  CREATE INDEX IF NOT EXISTS users_referred_by_idx   ON users (referred_by);
`);

// ALTER TABLE migrations for users — adds columns if old rows exist
try { db.exec('ALTER TABLE users ADD COLUMN virtual_coin_balance INTEGER NOT NULL DEFAULT 1000'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN referral_code TEXT');  } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN referred_by TEXT');    } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0');   } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN streak_last_date TEXT');                     } catch {}

// ── samachar_coins (complete ledger of every coin transaction) ─────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS samachar_coins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT    NOT NULL,
    action_type  TEXT    NOT NULL,
    -- action_type values:
    --   legacy:  QUIZ_CORRECT, QUIZ_BONUS, DAILY_STREAK, ADMIN_GRANT, PURCHASE
    --   new:     PREDICTION_VOTE, PREDICTION_CORRECT,
    --            NEWS_IMPACT_CORRECT, IPO_PREDICTION, IPO_CORRECT,
    --            VIRTUAL_TRADE, PORTFOLIO_PROFIT, REFERRAL
    amount       INTEGER NOT NULL,   -- positive = earned, negative = spent
    balance_after INTEGER NOT NULL,  -- running balance after this transaction
    ref_id       TEXT,               -- optional FK to source row (prediction id etc.)
    note         TEXT,               -- human-readable description
    created_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS samachar_coins_user_id_idx      ON samachar_coins (user_id);
  CREATE INDEX IF NOT EXISTS samachar_coins_action_idx       ON samachar_coins (action_type);
  CREATE INDEX IF NOT EXISTS samachar_coins_created_at_idx   ON samachar_coins (created_at DESC);
  CREATE INDEX IF NOT EXISTS samachar_coins_user_created_idx ON samachar_coins (user_id, created_at DESC);
`);

// ── stock_price_cache ──────────────────────────────────────────────────────────
// Server-side cache of real-time stock prices for virtual portfolio valuation.
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_price_cache (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol         TEXT    NOT NULL UNIQUE,
    company_name   TEXT    NOT NULL,
    current_price  REAL    NOT NULL,
    change_percent REAL    NOT NULL DEFAULT 0,
    last_updated   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS stock_price_cache_symbol_idx ON stock_price_cache (symbol);
`);

// Migration: add `change` column (absolute ₹ change vs previous close)
try { db.exec('ALTER TABLE stock_price_cache ADD COLUMN change REAL NOT NULL DEFAULT 0'); } catch {}

// Add UNIQUE constraint on article_id to prevent duplicate questions per article
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS news_impact_questions_article_unique ON news_impact_questions (article_id)');
} catch {}

// ── Virtual Portfolio System ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS virtual_portfolio (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               TEXT    NOT NULL UNIQUE,
    total_invested_coins  INTEGER NOT NULL DEFAULT 0,
    current_value_coins   INTEGER NOT NULL DEFAULT 0,
    created_at            INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS virtual_portfolio_user_id_idx ON virtual_portfolio (user_id);

  CREATE TABLE IF NOT EXISTS virtual_holdings (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              TEXT    NOT NULL,
    symbol               TEXT    NOT NULL,
    company_name         TEXT    NOT NULL,
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    avg_buy_price_coins  REAL    NOT NULL,
    bought_at            INTEGER NOT NULL,
    UNIQUE (user_id, symbol)
  );

  CREATE INDEX IF NOT EXISTS virtual_holdings_user_id_idx ON virtual_holdings (user_id);

  CREATE TABLE IF NOT EXISTS virtual_orders (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              TEXT    NOT NULL,
    symbol               TEXT    NOT NULL,
    order_type           TEXT    NOT NULL CHECK (order_type IN ('BUY', 'SELL')),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    price_at_execution   REAL    NOT NULL,
    coins_used           INTEGER NOT NULL,  -- positive = coins spent (BUY), negative = coins received (SELL)
    status               TEXT    NOT NULL DEFAULT 'EXECUTED' CHECK (status IN ('EXECUTED', 'CANCELLED', 'FAILED')),
    executed_at          INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS virtual_orders_user_id_idx       ON virtual_orders (user_id);
  CREATE INDEX IF NOT EXISTS virtual_orders_symbol_idx        ON virtual_orders (symbol);
  CREATE INDEX IF NOT EXISTS virtual_orders_user_executed_idx ON virtual_orders (user_id, executed_at DESC);
`);

// ── Prediction System ─────────────────────────────────────────────────────────
// Separate from the simple up/down Nifty predictions in the existing `predictions`
// table — this supports richer question types with admin-authored questions.
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_predictions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question        TEXT    NOT NULL,
    prediction_type TEXT    NOT NULL CHECK (prediction_type IN ('NIFTY_DIRECTION', 'STOCK_DIRECTION', 'CUSTOM')),
    symbol          TEXT,                    -- NULL for NIFTY_DIRECTION / CUSTOM
    correct_answer  TEXT,                    -- filled in after market close
    resolves_at     INTEGER NOT NULL,        -- Unix timestamp (IST market close)
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_predictions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL,
    prediction_id INTEGER NOT NULL,
    answer        TEXT    NOT NULL,          -- user's chosen answer
    is_correct    INTEGER,                   -- NULL = pending, 1 = correct, 0 = wrong
    coins_awarded INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    UNIQUE (user_id, prediction_id)
  );

  CREATE INDEX IF NOT EXISTS daily_predictions_resolves_at_idx ON daily_predictions (resolves_at);
  CREATE INDEX IF NOT EXISTS user_predictions_user_id_idx      ON user_predictions (user_id);
  CREATE INDEX IF NOT EXISTS user_predictions_pred_id_idx      ON user_predictions (prediction_id);
`);

// ── News Impact Quiz ───────────────────────────────────────────────────────────
// Short-lived MCQ tied to a specific news article; expires after a few hours.
db.exec(`
  CREATE TABLE IF NOT EXISTS news_impact_questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id     TEXT    NOT NULL,         -- FK → news_items.id
    question_text  TEXT    NOT NULL,
    option_a       TEXT    NOT NULL,
    option_b       TEXT    NOT NULL,
    option_c       TEXT    NOT NULL,
    option_d       TEXT    NOT NULL,
    correct_option TEXT    NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    symbol         TEXT,                     -- primary stock symbol, if applicable
    expires_at     INTEGER NOT NULL,         -- Unix timestamp — hide after this
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_news_impact_answers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT    NOT NULL,
    question_id    INTEGER NOT NULL,
    selected_option TEXT   NOT NULL CHECK (selected_option IN ('A', 'B', 'C', 'D')),
    is_correct     INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
    coins_awarded  INTEGER NOT NULL DEFAULT 0,
    answered_at    INTEGER NOT NULL,
    UNIQUE (user_id, question_id)
  );

  CREATE INDEX IF NOT EXISTS news_impact_questions_article_idx  ON news_impact_questions (article_id);
  CREATE INDEX IF NOT EXISTS news_impact_questions_expires_idx  ON news_impact_questions (expires_at);
  CREATE INDEX IF NOT EXISTS user_news_impact_answers_user_idx  ON user_news_impact_answers (user_id);
  CREATE INDEX IF NOT EXISTS user_news_impact_answers_qid_idx   ON user_news_impact_answers (question_id);
`);

// ── IPO Arena ─────────────────────────────────────────────────────────────────
// Prediction market for upcoming IPOs: GMP, subscription level, listing price.
db.exec(`
  CREATE TABLE IF NOT EXISTS ipo_predictions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ipo_name       TEXT    NOT NULL,
    symbol         TEXT,
    open_date      TEXT,                     -- YYYY-MM-DD IST
    listing_date   TEXT,                     -- YYYY-MM-DD IST
    question_type  TEXT    NOT NULL CHECK (question_type IN ('GMP', 'SUBSCRIPTION', 'LISTING_PRICE')),
    correct_answer TEXT,                     -- filled after listing
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_ipo_predictions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           TEXT    NOT NULL,
    ipo_prediction_id INTEGER NOT NULL,
    answer            TEXT    NOT NULL,      -- user's numeric or range answer
    is_correct        INTEGER,               -- NULL = pending, 1 = correct, 0 = wrong
    coins_awarded     INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    UNIQUE (user_id, ipo_prediction_id)
  );

  CREATE INDEX IF NOT EXISTS ipo_predictions_listing_date_idx   ON ipo_predictions (listing_date);
  CREATE INDEX IF NOT EXISTS user_ipo_predictions_user_id_idx   ON user_ipo_predictions (user_id);
  CREATE INDEX IF NOT EXISTS user_ipo_predictions_ipo_pred_idx  ON user_ipo_predictions (ipo_prediction_id);
`);

// ─── Reading Rewards ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS reading_rewards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL,
    article_id    TEXT    NOT NULL,
    reward_type   TEXT    NOT NULL CHECK (reward_type IN ('AI_SUMMARY_READ', 'ARTICLE_LISTEN')),
    coins_awarded INTEGER NOT NULL,
    reward_date   TEXT    NOT NULL,
    created_at    INTEGER NOT NULL,
    UNIQUE (user_id, article_id, reward_type, reward_date)
  );
  CREATE INDEX IF NOT EXISTS reading_rewards_user_date_idx    ON reading_rewards (user_id, reward_date);
  CREATE INDEX IF NOT EXISTS reading_rewards_user_article_idx ON reading_rewards (user_id, article_id);

  CREATE TABLE IF NOT EXISTS daily_reading_streak (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL,
    streak_date   TEXT    NOT NULL,
    coins_awarded INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    UNIQUE (user_id, streak_date)
  );
  CREATE INDEX IF NOT EXISTS daily_reading_streak_user_idx ON daily_reading_streak (user_id, streak_date);

  -- ── Quiz Podium Payouts (dedup) ───────────────────────────────────────────
  -- Prevents double-paying if cron fires twice (restart, retry, etc.).
  -- period_key examples: 'daily:2026-04-17', 'weekly:2026-W16', 'monthly:2026-04'.
  CREATE TABLE IF NOT EXISTS quiz_podium_payouts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    period         TEXT    NOT NULL CHECK (period IN ('daily','weekly','monthly')),
    period_key     TEXT    NOT NULL,
    user_id        TEXT    NOT NULL,
    rank           INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
    coins_awarded  INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    UNIQUE (period, period_key, rank),
    UNIQUE (period, period_key, user_id)
  );
  CREATE INDEX IF NOT EXISTS quiz_podium_user_idx ON quiz_podium_payouts (user_id, created_at DESC);

  -- Drop removed-scope tables (IQ-centric quiz redesign removed practice mode)
  DROP TABLE IF EXISTS quiz_practice_attempts;
`);

// ─── Types — Engagement ───────────────────────────────────────────────────────

export type CoinActionType =
  | 'QUIZ_CORRECT'        | 'QUIZ_BONUS'         | 'DAILY_STREAK'
  | 'QUIZ_PODIUM_DAILY'   | 'QUIZ_PODIUM_WEEKLY' | 'QUIZ_PODIUM_MONTHLY'
  | 'ADMIN_GRANT'         | 'PURCHASE'
  | 'PREDICTION_VOTE'     | 'PREDICTION_CORRECT'
  | 'NEWS_IMPACT_CORRECT' | 'IPO_PREDICTION'     | 'IPO_CORRECT'
  | 'VIRTUAL_TRADE'       | 'PORTFOLIO_PROFIT'   | 'REFERRAL'
  | 'FIRST_LOGIN'         | 'DAILY_LOGIN'
  | 'AI_SUMMARY_READ'     | 'ARTICLE_LISTEN'     | 'DAILY_READING_STREAK'
  | 'POLL_VOTE'           | 'SHARE_ARTICLE';

export interface UserRow {
  id:                   string;
  email:                string | null;
  name:                 string | null;
  avatar:               string | null;
  coins:                number;
  virtual_coin_balance: number;
  referral_code:        string | null;
  referred_by:          string | null;
  is_pro:               number;
  created_at:           number;
  updated_at:           number;
}

export interface CoinLedgerEntry {
  id:            number;
  user_id:       string;
  action_type:   CoinActionType;
  amount:        number;
  balance_after: number;
  ref_id:        string | null;
  note:          string | null;
  created_at:    number;
}

export interface VirtualPortfolio {
  id:                   number;
  user_id:              string;
  total_invested_coins: number;
  current_value_coins:  number;
  created_at:           number;
}

export interface VirtualHolding {
  id:                  number;
  user_id:             string;
  symbol:              string;
  company_name:        string;
  quantity:            number;
  avg_buy_price_coins: number;
  bought_at:           number;
}

export interface VirtualOrder {
  id:                  number;
  user_id:             string;
  symbol:              string;
  order_type:          'BUY' | 'SELL';
  quantity:            number;
  price_at_execution:  number;
  coins_used:          number;
  status:              'EXECUTED' | 'CANCELLED' | 'FAILED';
  executed_at:         number;
}

export interface StockPriceCache {
  id:             number;
  symbol:         string;
  company_name:   string;
  current_price:  number;
  change:         number;   // absolute ₹ change vs previous close
  change_percent: number;
  last_updated:   number;
}

export interface DailyPrediction {
  id:              number;
  question:        string;
  prediction_type: 'NIFTY_DIRECTION' | 'STOCK_DIRECTION' | 'CUSTOM';
  symbol:          string | null;
  correct_answer:  string | null;
  resolves_at:     number;
  created_at:      number;
}

export interface UserPrediction {
  id:            number;
  user_id:       string;
  prediction_id: number;
  answer:        string;
  is_correct:    number | null;
  coins_awarded: number;
  created_at:    number;
}

export interface NewsImpactQuestion {
  id:             number;
  article_id:     string;
  question_text:  string;
  option_a:       string;
  option_b:       string;
  option_c:       string;
  option_d:       string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  symbol:         string | null;
  expires_at:     number;
  created_at:     number;
}

export interface IpoPrediction {
  id:             number;
  ipo_name:       string;
  symbol:         string | null;
  open_date:      string | null;
  listing_date:   string | null;
  question_type:  'GMP' | 'SUBSCRIPTION' | 'LISTING_PRICE';
  correct_answer: string | null;
  created_at:     number;
}

// ─── Engagement helpers ───────────────────────────────────────────────────────

/** Upsert a user row. Called on every auth'd API request to keep the cache fresh. */
export function upsertUser(u: Omit<UserRow, 'created_at' | 'updated_at'> & { created_at?: number }): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO users (id, email, name, avatar, coins, virtual_coin_balance,
                       referral_code, referred_by, is_pro, created_at, updated_at)
    VALUES (@id, @email, @name, @avatar, @coins, @virtual_coin_balance,
            @referral_code, @referred_by, @is_pro, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      email                = excluded.email,
      name                 = excluded.name,
      avatar               = excluded.avatar,
      coins                = excluded.coins,
      virtual_coin_balance = excluded.virtual_coin_balance,
      is_pro               = excluded.is_pro,
      updated_at           = excluded.updated_at
  `).run({
    ...u,
    created_at: u.created_at ?? now,
    updated_at: now,
  });
}

/** Return a cached user row by Supabase UUID, or null. */
export function getUserById(userId: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(userId) as UserRow | undefined) ?? null;
}

/** Return user by referral_code (case-insensitive). */
export function getUserByReferralCode(code: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE referral_code = ? LIMIT 1').get(code.toUpperCase()) as UserRow | undefined) ?? null;
}

/** Append a coin ledger entry and return the new row id. */
export function addCoinLedgerEntry(
  entry: Omit<CoinLedgerEntry, 'id'>,
): number {
  const result = db.prepare(`
    INSERT INTO samachar_coins (user_id, action_type, amount, balance_after, ref_id, note, created_at)
    VALUES (@user_id, @action_type, @amount, @balance_after, @ref_id, @note, @created_at)
  `).run(entry) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

/** Return the most recent N ledger entries for a user. */
export function getCoinLedger(userId: string, limit = 50): CoinLedgerEntry[] {
  return db.prepare(
    'SELECT * FROM samachar_coins WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as CoinLedgerEntry[];
}

/** Update stock price cache (upsert by symbol). */
export function upsertStockPrice(
  symbol: string,
  companyName: string,
  price: number,
  change: number,
  changePct: number,
): void {
  db.prepare(`
    INSERT INTO stock_price_cache (symbol, company_name, current_price, change, change_percent, last_updated)
    VALUES (@symbol, @company_name, @current_price, @change, @change_percent, @last_updated)
    ON CONFLICT(symbol) DO UPDATE SET
      company_name   = excluded.company_name,
      current_price  = excluded.current_price,
      change         = excluded.change,
      change_percent = excluded.change_percent,
      last_updated   = excluded.last_updated
  `).run({
    symbol,
    company_name:   companyName,
    current_price:  price,
    change,
    change_percent: changePct,
    last_updated:   Date.now(),
  });
}

/** Return cached price for a symbol, or null if stale/missing. */
export function getStockPrice(symbol: string, maxAgeMs = 5 * 60 * 1000): StockPriceCache | null {
  const row = db.prepare('SELECT * FROM stock_price_cache WHERE symbol = ? LIMIT 1').get(symbol) as StockPriceCache | undefined;
  if (!row) return null;
  if (Date.now() - row.last_updated > maxAgeMs) return null;
  return row;
}

// ── Virtual portfolio helpers ─────────────────────────────────────────────────

/** Get or initialise a user's portfolio row. */
export function getOrCreatePortfolio(userId: string): VirtualPortfolio {
  const existing = db.prepare('SELECT * FROM virtual_portfolio WHERE user_id = ? LIMIT 1').get(userId) as VirtualPortfolio | undefined;
  if (existing) return existing;
  db.prepare(`
    INSERT OR IGNORE INTO virtual_portfolio (user_id, total_invested_coins, current_value_coins, created_at)
    VALUES (?, 0, 0, ?)
  `).run(userId, Date.now());
  return db.prepare('SELECT * FROM virtual_portfolio WHERE user_id = ? LIMIT 1').get(userId) as VirtualPortfolio;
}

/** Update total_invested_coins and current_value_coins for a user's portfolio. */
export function updatePortfolioValue(userId: string, totalInvested: number, currentValue: number): void {
  db.prepare(`
    UPDATE virtual_portfolio SET total_invested_coins = ?, current_value_coins = ? WHERE user_id = ?
  `).run(totalInvested, currentValue, userId);
}

/** Return all current holdings for a user. */
export function getHoldings(userId: string): VirtualHolding[] {
  return db.prepare('SELECT * FROM virtual_holdings WHERE user_id = ? ORDER BY bought_at DESC').all(userId) as VirtualHolding[];
}

/**
 * Execute a BUY order in a transaction:
 *  1. Upsert virtual_holdings (add qty, recalculate avg price)
 *  2. Insert virtual_orders row
 *  3. Deduct coins from users.virtual_coin_balance
 *  4. Append coin ledger entry (VIRTUAL_TRADE)
 */
export function executeBuyOrder(
  userId:    string,
  symbol:    string,
  company:   string,
  qty:       number,
  priceCoins: number,
): VirtualOrder {
  const totalCost = Math.round(qty * priceCoins);
  const now       = Date.now();

  return db.transaction(() => {
    // Check balance
    const user = db.prepare('SELECT virtual_coin_balance FROM users WHERE id = ?').get(userId) as { virtual_coin_balance: number } | undefined;
    if (!user || user.virtual_coin_balance < totalCost) {
      throw new Error('Insufficient virtual coin balance');
    }

    // Upsert holding
    const existing = db.prepare('SELECT * FROM virtual_holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol) as VirtualHolding | undefined;
    if (existing) {
      const newQty  = existing.quantity + qty;
      const newAvg  = ((existing.avg_buy_price_coins * existing.quantity) + (priceCoins * qty)) / newQty;
      db.prepare('UPDATE virtual_holdings SET quantity = ?, avg_buy_price_coins = ? WHERE user_id = ? AND symbol = ?')
        .run(newQty, newAvg, userId, symbol);
    } else {
      db.prepare('INSERT INTO virtual_holdings (user_id, symbol, company_name, quantity, avg_buy_price_coins, bought_at) VALUES (?,?,?,?,?,?)')
        .run(userId, symbol, company, qty, priceCoins, now);
    }

    // Insert order
    const orderResult = db.prepare(`
      INSERT INTO virtual_orders (user_id, symbol, order_type, quantity, price_at_execution, coins_used, status, executed_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(userId, symbol, 'BUY', qty, priceCoins, totalCost, 'EXECUTED', now) as { lastInsertRowid: number | bigint };

    // Deduct coins
    const newBalance = user.virtual_coin_balance - totalCost;
    db.prepare('UPDATE users SET virtual_coin_balance = ? WHERE id = ?').run(newBalance, userId);

    // Ledger
    addCoinLedgerEntry({
      user_id:       userId,
      action_type:   'VIRTUAL_TRADE',
      amount:        -totalCost,
      balance_after: newBalance,
      ref_id:        String(orderResult.lastInsertRowid),
      note:          `BUY ${qty} ${symbol} @ ${priceCoins} coins`,
      created_at:    now,
    });

    return db.prepare('SELECT * FROM virtual_orders WHERE id = ?').get(Number(orderResult.lastInsertRowid)) as VirtualOrder;
  })();
}

/**
 * Execute a SELL order in a transaction:
 *  1. Reduce/delete virtual_holdings
 *  2. Insert virtual_orders row
 *  3. Credit coins to users.virtual_coin_balance
 *  4. Append coin ledger entry (VIRTUAL_TRADE)
 */
export function executeSellOrder(
  userId:     string,
  symbol:     string,
  qty:        number,
  priceCoins: number,
): VirtualOrder {
  const totalCredit = Math.round(qty * priceCoins);
  const now         = Date.now();

  return db.transaction(() => {
    const holding = db.prepare('SELECT * FROM virtual_holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol) as VirtualHolding | undefined;
    if (!holding || holding.quantity < qty) {
      throw new Error('Insufficient holdings to sell');
    }

    if (holding.quantity === qty) {
      db.prepare('DELETE FROM virtual_holdings WHERE user_id = ? AND symbol = ?').run(userId, symbol);
    } else {
      db.prepare('UPDATE virtual_holdings SET quantity = ? WHERE user_id = ? AND symbol = ?').run(holding.quantity - qty, userId, symbol);
    }

    const orderResult = db.prepare(`
      INSERT INTO virtual_orders (user_id, symbol, order_type, quantity, price_at_execution, coins_used, status, executed_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(userId, symbol, 'SELL', qty, priceCoins, -totalCredit, 'EXECUTED', now) as { lastInsertRowid: number | bigint };

    const user = db.prepare('SELECT virtual_coin_balance FROM users WHERE id = ?').get(userId) as { virtual_coin_balance: number };
    const newBalance = user.virtual_coin_balance + totalCredit;
    db.prepare('UPDATE users SET virtual_coin_balance = ? WHERE id = ?').run(newBalance, userId);

    addCoinLedgerEntry({
      user_id:       userId,
      action_type:   'VIRTUAL_TRADE',
      amount:        totalCredit,
      balance_after: newBalance,
      ref_id:        String(orderResult.lastInsertRowid),
      note:          `SELL ${qty} ${symbol} @ ${priceCoins} coins`,
      created_at:    now,
    });

    return db.prepare('SELECT * FROM virtual_orders WHERE id = ?').get(Number(orderResult.lastInsertRowid)) as VirtualOrder;
  })();
}

/** Return recent orders for a user. */
export function getOrderHistory(userId: string, limit = 50): VirtualOrder[] {
  return db.prepare('SELECT * FROM virtual_orders WHERE user_id = ? ORDER BY executed_at DESC LIMIT ?').all(userId, limit) as VirtualOrder[];
}

// ── Prediction helpers ────────────────────────────────────────────────────────

/** Create an admin-authored prediction question. */
export function createDailyPrediction(p: Omit<DailyPrediction, 'id'>): number {
  const result = db.prepare(`
    INSERT INTO daily_predictions (question, prediction_type, symbol, correct_answer, resolves_at, created_at)
    VALUES (@question, @prediction_type, @symbol, @correct_answer, @resolves_at, @created_at)
  `).run(p) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

/** Return all unresolved prediction questions (correct_answer IS NULL). */
export function getActivePredictions(): DailyPrediction[] {
  return db.prepare(`
    SELECT * FROM daily_predictions
    WHERE correct_answer IS NULL AND resolves_at > ?
    ORDER BY resolves_at ASC
  `).all(Date.now()) as DailyPrediction[];
}

/** Save a user's vote on a prediction. IGNORE duplicate (one vote per question). */
export function saveUserPrediction(p: Omit<UserPrediction, 'id' | 'is_correct' | 'coins_awarded'>): void {
  db.prepare(`
    INSERT OR IGNORE INTO user_predictions (user_id, prediction_id, answer, is_correct, coins_awarded, created_at)
    VALUES (@user_id, @prediction_id, @answer, NULL, 0, @created_at)
  `).run(p);
}

/**
 * Resolve a prediction: set correct_answer, mark user rows correct/wrong,
 * award coins to winners. Returns count of winners.
 */
export function resolveDailyPrediction(
  predictionId: number,
  correctAnswer: string,
  coinsPerWinner = 10,
): number {
  return db.transaction(() => {
    db.prepare('UPDATE daily_predictions SET correct_answer = ? WHERE id = ?').run(correctAnswer, predictionId);
    db.prepare(`
      UPDATE user_predictions SET is_correct = 1, coins_awarded = ?
      WHERE prediction_id = ? AND answer = ? AND is_correct IS NULL
    `).run(coinsPerWinner, predictionId, correctAnswer);
    db.prepare(`
      UPDATE user_predictions SET is_correct = 0, coins_awarded = 0
      WHERE prediction_id = ? AND answer != ? AND is_correct IS NULL
    `).run(predictionId, correctAnswer);
    const winners = db.prepare(`
      SELECT user_id FROM user_predictions WHERE prediction_id = ? AND is_correct = 1
    `).all(predictionId) as Array<{ user_id: string }>;
    const now = Date.now();
    for (const { user_id } of winners) {
      const user = db.prepare('SELECT virtual_coin_balance FROM users WHERE id = ?').get(user_id) as { virtual_coin_balance: number } | undefined;
      if (!user) continue;
      const newBal = user.virtual_coin_balance + coinsPerWinner;
      db.prepare('UPDATE users SET virtual_coin_balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, user_id);
      addCoinLedgerEntry({
        user_id,
        action_type:   'PREDICTION_CORRECT',
        amount:        coinsPerWinner,
        balance_after: newBal,
        ref_id:        String(predictionId),
        note:          `Prediction correct — answer: ${correctAnswer} (+${coinsPerWinner} coins)`,
        created_at:    now,
      });
    }
    return winners.length;
  })();
}

// ── News Impact Quiz helpers ──────────────────────────────────────────────────

/** Persist an AI-generated news impact question for an article. */
export function saveNewsImpactQuestion(q: Omit<NewsImpactQuestion, 'id'>): number {
  const result = db.prepare(`
    INSERT INTO news_impact_questions
      (article_id, question_text, option_a, option_b, option_c, option_d,
       correct_option, symbol, expires_at, created_at)
    VALUES
      (@article_id, @question_text, @option_a, @option_b, @option_c, @option_d,
       @correct_option, @symbol, @expires_at, @created_at)
  `).run(q) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

/** Return active (non-expired) questions the user hasn't answered yet. */
export function getUnansweredNewsImpactQuestions(userId: string, limit = 5): NewsImpactQuestion[] {
  return db.prepare(`
    SELECT niq.* FROM news_impact_questions niq
    WHERE niq.expires_at > ?
      AND niq.id NOT IN (
        SELECT question_id FROM user_news_impact_answers WHERE user_id = ?
      )
    ORDER BY niq.created_at DESC
    LIMIT ?
  `).all(Date.now(), userId, limit) as NewsImpactQuestion[];
}

/** Record a user's answer to a news impact question. IGNORE duplicate. */
export function saveNewsImpactAnswer(
  userId:     string,
  questionId: number,
  selected:   'A' | 'B' | 'C' | 'D',
  coinsAwarded = 0,
): boolean {
  const q = db.prepare('SELECT correct_option FROM news_impact_questions WHERE id = ? LIMIT 1').get(questionId) as { correct_option: string } | undefined;
  if (!q) return false;
  const isCorrect = selected === q.correct_option ? 1 : 0;
  const finalCoins = isCorrect ? coinsAwarded : 0;
  db.prepare(`
    INSERT OR IGNORE INTO user_news_impact_answers
      (user_id, question_id, selected_option, is_correct, coins_awarded, answered_at)
    VALUES (?,?,?,?,?,?)
  `).run(userId, questionId, selected, isCorrect, finalCoins, Date.now());
  return isCorrect === 1;
}

// ── IPO Arena helpers ─────────────────────────────────────────────────────────

/** Create an IPO prediction question (admin). */
export function createIpoPrediction(p: Omit<IpoPrediction, 'id'>): number {
  const result = db.prepare(`
    INSERT INTO ipo_predictions (ipo_name, symbol, open_date, listing_date, question_type, correct_answer, created_at)
    VALUES (@ipo_name, @symbol, @open_date, @listing_date, @question_type, @correct_answer, @created_at)
  `).run(p) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

/** Return open IPO prediction questions (listing hasn't happened yet). */
export function getOpenIpoPredictions(): IpoPrediction[] {
  return db.prepare(`
    SELECT * FROM ipo_predictions
    WHERE correct_answer IS NULL
    ORDER BY listing_date ASC NULLS LAST
  `).all() as IpoPrediction[];
}

/** Record a user's IPO prediction. IGNORE duplicate. */
export function saveUserIpoPrediction(
  userId:          string,
  ipoPredictionId: number,
  answer:          string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO user_ipo_predictions
      (user_id, ipo_prediction_id, answer, is_correct, coins_awarded, created_at)
    VALUES (?,?,?,NULL,0,?)
  `).run(userId, ipoPredictionId, answer, Date.now());
}

/**
 * Resolve an IPO prediction once the correct answer is known.
 * Returns count of winners.
 */
export function resolveIpoPrediction(
  ipoPredictionId: number,
  correctAnswer:   string,
  coinsPerWinner = 15,
): number {
  return db.transaction(() => {
    db.prepare('UPDATE ipo_predictions SET correct_answer = ? WHERE id = ?').run(correctAnswer, ipoPredictionId);
    db.prepare(`
      UPDATE user_ipo_predictions SET is_correct = 1, coins_awarded = ?
      WHERE ipo_prediction_id = ? AND answer = ? AND is_correct IS NULL
    `).run(coinsPerWinner, ipoPredictionId, correctAnswer);
    db.prepare(`
      UPDATE user_ipo_predictions SET is_correct = 0, coins_awarded = 0
      WHERE ipo_prediction_id = ? AND answer != ? AND is_correct IS NULL
    `).run(ipoPredictionId, correctAnswer);
    const winners = db.prepare(`
      SELECT user_id FROM user_ipo_predictions WHERE ipo_prediction_id = ? AND is_correct = 1
    `).all(ipoPredictionId) as Array<{ user_id: string }>;
    const now = Date.now();
    for (const { user_id } of winners) {
      const user = db.prepare('SELECT virtual_coin_balance FROM users WHERE id = ?').get(user_id) as { virtual_coin_balance: number } | undefined;
      if (!user) continue;
      const newBal = user.virtual_coin_balance + coinsPerWinner;
      db.prepare('UPDATE users SET virtual_coin_balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, user_id);
      addCoinLedgerEntry({
        user_id,
        action_type:   'IPO_CORRECT',
        amount:        coinsPerWinner,
        balance_after: newBal,
        ref_id:        String(ipoPredictionId),
        note:          `IPO prediction correct — answer: ${correctAnswer} (+${coinsPerWinner} coins)`,
        created_at:    now,
      });
    }
    return winners.length;
  })();
}

export default db;
