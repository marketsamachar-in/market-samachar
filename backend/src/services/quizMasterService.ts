/**
 * Quiz Master — infinite quiz with per-user no-repeat selection.
 *
 *   - Question bank lives in quiz_master_bank (manually curated; bulk-imported
 *     from /data/quiz-bank/*.json by `npm run quiz-import`).
 *   - quiz_master_history tracks every question each user has seen so we can
 *     filter them out on the next request → guaranteed no repeats.
 *   - When a user has seen the entire pool, fall back to oldest-seen-first
 *     (and prefer wrong answers) for spaced-repetition review.
 *   - Cross-user diversity: the random shuffle is seeded by hash(userId + date)
 *     so two users on the same day get nearly disjoint sets.
 */

import db from "../../../pipeline/db.ts";
import { addCoins, ensureUser } from "./coinService.ts";

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS quiz_master_bank (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id  TEXT UNIQUE,           -- optional human key from JSON file
    category     TEXT NOT NULL,
    difficulty   INTEGER NOT NULL DEFAULT 2 CHECK(difficulty BETWEEN 1 AND 5),
    question     TEXT NOT NULL,
    option_a     TEXT NOT NULL,
    option_b     TEXT NOT NULL,
    option_c     TEXT NOT NULL,
    option_d     TEXT NOT NULL,
    correct      TEXT NOT NULL CHECK(correct IN ('A','B','C','D')),
    explanation  TEXT,
    source       TEXT,
    tags         TEXT,                  -- JSON array of strings
    status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired','pending')),
    times_served INTEGER NOT NULL DEFAULT 0,
    times_correct INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS quiz_master_bank_status_idx
    ON quiz_master_bank (status, category, difficulty);

  CREATE TABLE IF NOT EXISTS quiz_master_history (
    user_id              TEXT NOT NULL,
    question_id          INTEGER NOT NULL,
    last_seen_at         INTEGER NOT NULL,
    times_seen           INTEGER NOT NULL DEFAULT 1,
    last_answered_correct INTEGER,           -- 0/1/NULL
    PRIMARY KEY (user_id, question_id)
  );
  CREATE INDEX IF NOT EXISTS quiz_master_history_user_idx
    ON quiz_master_history (user_id, last_seen_at);

  CREATE TABLE IF NOT EXISTS quiz_master_progress (
    user_id        TEXT PRIMARY KEY,
    total_xp       INTEGER NOT NULL DEFAULT 0,
    weekly_xp      INTEGER NOT NULL DEFAULT 0,
    weekly_anchor  TEXT,                     -- ISO week (YYYY-WW)
    league         TEXT NOT NULL DEFAULT 'BRONZE'
                   CHECK(league IN ('BRONZE','SILVER','GOLD','SAPPHIRE','RUBY','EMERALD','DIAMOND')),
    streak_days    INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER,
    last_play_date TEXT,                     -- IST YYYY-MM-DD
    hearts         INTEGER NOT NULL DEFAULT 5,
    hearts_refill_at INTEGER,
    total_correct  INTEGER NOT NULL DEFAULT 0,
    total_wrong    INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_master_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL,
    question_id  INTEGER NOT NULL,
    mode         TEXT NOT NULL,               -- 'daily' | 'practice'
    selected     TEXT NOT NULL CHECK(selected IN ('A','B','C','D')),
    is_correct   INTEGER NOT NULL,
    coins        INTEGER NOT NULL DEFAULT 0,
    xp           INTEGER NOT NULL DEFAULT 0,
    answered_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS quiz_master_attempts_user_idx
    ON quiz_master_attempts (user_id, answered_at);

  CREATE TABLE IF NOT EXISTS quiz_master_daily (
    user_id    TEXT NOT NULL,
    date       TEXT NOT NULL,
    qids       TEXT NOT NULL,                  -- JSON array of bank ids
    finished   INTEGER NOT NULL DEFAULT 0,
    score      INTEGER NOT NULL DEFAULT 0,
    coins      INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  );
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Market Basics", "Technical Analysis", "Fundamental Analysis",
  "Options & Futures", "Indian Markets", "Global Markets",
  "IPOs", "Mutual Funds & SIPs", "Personal Finance",
  "Tax & Capital Gains", "Banking", "RBI & Monetary Policy",
  "SEBI & Regulations", "Crypto", "Famous Investors",
  "Market History", "Economy & Macro", "Current Market Affairs",
] as const;

export const QUIZ_CATEGORIES = CATEGORIES;

function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function isoWeek(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, "0")}`;
}

/** Mulberry32 — small fast seeded PRNG. Same seed → identical sequence. */
function seededRand(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rand = seededRand(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Bank stats ──────────────────────────────────────────────────────────────

export function getBankStats(): {
  total: number;
  active: number;
  pending: number;
  retired: number;
  byCategory: Array<{ category: string; count: number }>;
  byDifficulty: Array<{ difficulty: number; count: number }>;
} {
  const total = (db.prepare("SELECT COUNT(*) c FROM quiz_master_bank").get() as any).c;
  const active = (db.prepare("SELECT COUNT(*) c FROM quiz_master_bank WHERE status='active'").get() as any).c;
  const pending = (db.prepare("SELECT COUNT(*) c FROM quiz_master_bank WHERE status='pending'").get() as any).c;
  const retired = (db.prepare("SELECT COUNT(*) c FROM quiz_master_bank WHERE status='retired'").get() as any).c;
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) c FROM quiz_master_bank
    WHERE status='active' GROUP BY category ORDER BY c DESC
  `).all().map((r: any) => ({ category: r.category, count: r.c }));
  const byDifficulty = db.prepare(`
    SELECT difficulty, COUNT(*) c FROM quiz_master_bank
    WHERE status='active' GROUP BY difficulty ORDER BY difficulty
  `).all().map((r: any) => ({ difficulty: r.difficulty, count: r.c }));
  return { total, active, pending, retired, byCategory, byDifficulty };
}

// ─── Question selection — the no-repeat heart ──────────────────────────────

export interface BankQuestion {
  id:          number;
  category:    string;
  difficulty:  number;
  question:    string;
  options:     [string, string, string, string];
  explanation: string | null;
  source:      string | null;
}

interface InternalRow {
  id: number;
  category: string;
  difficulty: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct: string;
  explanation: string | null;
  source: string | null;
}

function rowToPublic(r: InternalRow): BankQuestion {
  return {
    id:          r.id,
    category:    r.category,
    difficulty:  r.difficulty,
    question:    r.question,
    options:     [r.option_a, r.option_b, r.option_c, r.option_d],
    explanation: r.explanation,
    source:      r.source,
  };
}

/**
 * Pick `count` questions for `userId`, none of which they've seen before.
 * Falls back to oldest-seen-first if the unseen pool is exhausted.
 */
export function pickQuestions(
  userId: string,
  count: number,
  opts: { category?: string; difficulty?: number; mode?: string } = {},
): BankQuestion[] {
  const where: string[] = ["b.status = 'active'"];
  const params: any[] = [];
  if (opts.category) {
    where.push("b.category = ?");
    params.push(opts.category);
  }
  if (opts.difficulty) {
    where.push("b.difficulty = ?");
    params.push(opts.difficulty);
  }
  const whereSql = where.join(" AND ");

  // Unseen pool first
  const unseen = db.prepare(`
    SELECT b.id, b.category, b.difficulty, b.question,
           b.option_a, b.option_b, b.option_c, b.option_d,
           b.correct, b.explanation, b.source
    FROM quiz_master_bank b
    LEFT JOIN quiz_master_history h
      ON h.question_id = b.id AND h.user_id = ?
    WHERE ${whereSql} AND h.question_id IS NULL
  `).all(userId, ...params) as InternalRow[];

  const seed = hashStr(userId + ":" + todayIST() + ":" + (opts.mode ?? "any"));
  const shuffledUnseen = shuffleSeeded(unseen, seed);

  if (shuffledUnseen.length >= count) {
    return shuffledUnseen.slice(0, count).map(rowToPublic);
  }

  // Pool exhausted — top up from history (oldest-seen + wrong-first)
  const need = count - shuffledUnseen.length;
  const seenTop = db.prepare(`
    SELECT b.id, b.category, b.difficulty, b.question,
           b.option_a, b.option_b, b.option_c, b.option_d,
           b.correct, b.explanation, b.source
    FROM quiz_master_bank b
    JOIN quiz_master_history h ON h.question_id = b.id AND h.user_id = ?
    WHERE ${whereSql}
    ORDER BY COALESCE(h.last_answered_correct, 0) ASC, h.last_seen_at ASC
    LIMIT ?
  `).all(userId, ...params, need) as InternalRow[];

  return [...shuffledUnseen, ...seenTop].slice(0, count).map(rowToPublic);
}

// ─── Daily set (locked once generated) ───────────────────────────────────────

export interface DailyState {
  date:     string;
  finished: boolean;
  score:    number;
  coins:    number;
  questions: BankQuestion[];
  answered: Array<{
    questionId: number;
    selected:   string;
    correct:    boolean;
  }>;
}

export function getOrCreateDaily(userId: string): DailyState {
  ensureUser(userId);
  const date = todayIST();

  let row = db.prepare(`
    SELECT * FROM quiz_master_daily WHERE user_id = ? AND date = ?
  `).get(userId, date) as any;

  if (!row) {
    const picks = pickQuestions(userId, 5, { mode: "daily" });
    if (picks.length === 0) {
      return { date, finished: false, score: 0, coins: 0, questions: [], answered: [] };
    }
    db.prepare(`
      INSERT INTO quiz_master_daily (user_id, date, qids, started_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, date, JSON.stringify(picks.map((q) => q.id)), Date.now());
    row = { user_id: userId, date, qids: JSON.stringify(picks.map((q) => q.id)),
            finished: 0, score: 0, coins: 0, started_at: Date.now() };
  }

  const qids: number[] = JSON.parse(row.qids);
  const placeholders = qids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id, category, difficulty, question, option_a, option_b, option_c, option_d,
           correct, explanation, source
    FROM quiz_master_bank WHERE id IN (${placeholders})
  `).all(...qids) as InternalRow[];

  // Preserve the order of qids
  const byId = new Map(rows.map((r) => [r.id, r]));
  const questions = qids.map((id) => byId.get(id)).filter(Boolean).map((r) => rowToPublic(r as InternalRow));

  const attempts = db.prepare(`
    SELECT question_id, selected, is_correct FROM quiz_master_attempts
    WHERE user_id = ? AND mode = 'daily'
      AND answered_at >= ?
  `).all(userId, row.started_at) as Array<any>;
  const answered = attempts.map((a) => ({
    questionId: a.question_id,
    selected:   a.selected,
    correct:    a.is_correct === 1,
  }));

  return {
    date,
    finished: row.finished === 1,
    score:    row.score,
    coins:    row.coins,
    questions,
    answered,
  };
}

// ─── Submit an answer ────────────────────────────────────────────────────────

export interface AnswerResult {
  correct:          boolean;
  correctOption:    string;
  explanation:      string | null;
  source:           string | null;
  coinsAwarded:     number;
  xpAwarded:        number;
  newBalance:       number;
  totalXp:          number;
  streakDays:       number;
}

const COINS_BY_DIFFICULTY: Record<number, number> = {
  1: 5, 2: 10, 3: 15, 4: 20, 5: 25,
};
const XP_BY_DIFFICULTY: Record<number, number> = {
  1: 10, 2: 15, 3: 22, 4: 30, 5: 40,
};

export function submitAnswer(args: {
  userId: string;
  questionId: number;
  selected: "A" | "B" | "C" | "D";
  mode: "daily" | "practice";
}): AnswerResult {
  ensureUser(args.userId);

  const q = db.prepare(`
    SELECT id, difficulty, correct, explanation, source
    FROM quiz_master_bank WHERE id = ?
  `).get(args.questionId) as
    | { id: number; difficulty: number; correct: string; explanation: string | null; source: string | null }
    | undefined;
  if (!q) throw new Error("Question not found");

  const correct = args.selected === q.correct;
  const coins = correct ? (COINS_BY_DIFFICULTY[q.difficulty] ?? 10) : 0;
  const xp    = correct ? (XP_BY_DIFFICULTY[q.difficulty] ?? 15) : 2;  // tiny consolation XP

  // Block double-answer in daily mode (one chance per question per day)
  if (args.mode === "daily") {
    const dailyRow = db.prepare(
      "SELECT started_at FROM quiz_master_daily WHERE user_id = ? AND date = ?",
    ).get(args.userId, todayIST()) as { started_at: number } | undefined;
    if (dailyRow) {
      const already = db.prepare(`
        SELECT id FROM quiz_master_attempts
        WHERE user_id = ? AND mode = 'daily'
          AND question_id = ? AND answered_at >= ?
      `).get(args.userId, args.questionId, dailyRow.started_at) as any;
      if (already) throw new Error("Already answered");
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO quiz_master_attempts
        (user_id, question_id, mode, selected, is_correct, coins, xp, answered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(args.userId, args.questionId, args.mode, args.selected,
           correct ? 1 : 0, coins, xp, Date.now());

    db.prepare(`
      INSERT INTO quiz_master_history
        (user_id, question_id, last_seen_at, times_seen, last_answered_correct)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        times_seen   = quiz_master_history.times_seen + 1,
        last_answered_correct = excluded.last_answered_correct
    `).run(args.userId, args.questionId, Date.now(), correct ? 1 : 0);

    db.prepare(`
      UPDATE quiz_master_bank
      SET times_served = times_served + 1,
          times_correct = times_correct + ?,
          updated_at = ?
      WHERE id = ?
    `).run(correct ? 1 : 0, Date.now(), args.questionId);

    if (args.mode === "daily") {
      db.prepare(`
        UPDATE quiz_master_daily
        SET score = score + ?, coins = coins + ?
        WHERE user_id = ? AND date = ?
      `).run(correct ? 1 : 0, coins, args.userId, todayIST());
    }
  });
  tx();

  // Update progress (XP, streak, totals) — separate tx
  const progress = bumpProgress(args.userId, xp, correct);

  // Pay coins via the global ledger
  let newBalance = 0;
  if (coins > 0) {
    try {
      newBalance = addCoins(
        args.userId, coins, "QUIZ_CORRECT" as any,
        `quiz-master-q${q.id}`,
        `Quiz Master — correct (difficulty ${q.difficulty})`,
      );
    } catch (e) {
      console.warn("[QuizMaster] addCoins failed:", (e as Error).message);
    }
  } else {
    const balRow = db.prepare("SELECT virtual_coin_balance FROM users WHERE id = ?")
      .get(args.userId) as any;
    newBalance = balRow?.virtual_coin_balance ?? 0;
  }

  return {
    correct,
    correctOption: q.correct,
    explanation:   q.explanation,
    source:        q.source,
    coinsAwarded:  coins,
    xpAwarded:     xp,
    newBalance,
    totalXp:       progress.total_xp,
    streakDays:    progress.streak_days,
  };
}

// ─── Progress / streak ───────────────────────────────────────────────────────

function bumpProgress(userId: string, xp: number, correct: boolean): {
  total_xp: number; streak_days: number; weekly_xp: number; league: string;
} {
  const today = todayIST();
  const week = isoWeek();
  const now = Date.now();

  let row = db.prepare("SELECT * FROM quiz_master_progress WHERE user_id = ?")
    .get(userId) as any;
  if (!row) {
    db.prepare(`
      INSERT INTO quiz_master_progress (user_id, updated_at)
      VALUES (?, ?)
    `).run(userId, now);
    row = db.prepare("SELECT * FROM quiz_master_progress WHERE user_id = ?")
      .get(userId);
  }

  // Streak handling
  let streak = row.streak_days as number;
  if (row.last_play_date !== today) {
    if (row.last_play_date) {
      const prev = new Date(row.last_play_date + "T00:00:00Z");
      const todayD = new Date(today + "T00:00:00Z");
      const days = Math.round((todayD.getTime() - prev.getTime()) / 86400000);
      streak = days === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
  }

  // Weekly XP reset
  let weeklyXp = row.weekly_xp as number;
  if (row.weekly_anchor !== week) weeklyXp = 0;

  const totals = {
    correct: row.total_correct + (correct ? 1 : 0),
    wrong:   row.total_wrong   + (correct ? 0 : 1),
  };

  const totalXp  = row.total_xp + xp;
  const newWxp   = weeklyXp + xp;

  db.prepare(`
    UPDATE quiz_master_progress
    SET total_xp = ?,
        weekly_xp = ?,
        weekly_anchor = ?,
        streak_days = ?,
        last_played_at = ?,
        last_play_date = ?,
        total_correct = ?,
        total_wrong = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(totalXp, newWxp, week, streak, now, today, totals.correct, totals.wrong, now, userId);

  return {
    total_xp:    totalXp,
    streak_days: streak,
    weekly_xp:   newWxp,
    league:      row.league,
  };
}

export function getProgress(userId: string): {
  totalXp: number;
  weeklyXp: number;
  league: string;
  streakDays: number;
  hearts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  questionsSeen: number;
  bankSize: number;
} {
  ensureUser(userId);
  let row = db.prepare("SELECT * FROM quiz_master_progress WHERE user_id = ?")
    .get(userId) as any;
  if (!row) {
    db.prepare("INSERT INTO quiz_master_progress (user_id, updated_at) VALUES (?, ?)")
      .run(userId, Date.now());
    row = db.prepare("SELECT * FROM quiz_master_progress WHERE user_id = ?")
      .get(userId);
  }
  const seen = (db.prepare(
    "SELECT COUNT(*) c FROM quiz_master_history WHERE user_id = ?",
  ).get(userId) as any).c;
  const bank = (db.prepare(
    "SELECT COUNT(*) c FROM quiz_master_bank WHERE status='active'",
  ).get() as any).c;
  const accuracy = (row.total_correct + row.total_wrong) === 0
    ? 0
    : Math.round((row.total_correct / (row.total_correct + row.total_wrong)) * 100);
  return {
    totalXp:      row.total_xp,
    weeklyXp:     row.weekly_xp,
    league:       row.league,
    streakDays:   row.streak_days,
    hearts:       row.hearts,
    totalCorrect: row.total_correct,
    totalWrong:   row.total_wrong,
    accuracy,
    questionsSeen: seen,
    bankSize:     bank,
  };
}

// ─── Bulk import (called from script + admin upload) ─────────────────────────

export interface ImportRow {
  external_id?: string;
  category:     string;
  difficulty:   number;
  question:     string;
  options:      [string, string, string, string];
  correct:      "A" | "B" | "C" | "D";
  explanation?: string;
  source?:      string;
  tags?:        string[];
}

export function importQuestions(rows: ImportRow[]): {
  inserted: number;
  updated:  number;
  skipped:  number;
  errors:   Array<{ index: number; reason: string }>;
} {
  const stmt = db.prepare(`
    INSERT INTO quiz_master_bank
      (external_id, category, difficulty, question,
       option_a, option_b, option_c, option_d, correct,
       explanation, source, tags, status, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      category = excluded.category,
      difficulty = excluded.difficulty,
      question = excluded.question,
      option_a = excluded.option_a,
      option_b = excluded.option_b,
      option_c = excluded.option_c,
      option_d = excluded.option_d,
      correct = excluded.correct,
      explanation = excluded.explanation,
      source = excluded.source,
      tags = excluded.tags,
      updated_at = excluded.updated_at
  `);

  let inserted = 0, updated = 0, skipped = 0;
  const errors: Array<{ index: number; reason: string }> = [];

  const tx = db.transaction(() => {
    rows.forEach((r, i) => {
      try {
        const valid =
          r.category && CATEGORIES.includes(r.category as any) &&
          [1, 2, 3, 4, 5].includes(r.difficulty) &&
          r.question && Array.isArray(r.options) && r.options.length === 4 &&
          ["A", "B", "C", "D"].includes(r.correct);
        if (!valid) {
          errors.push({ index: i, reason: "validation failed" });
          skipped++;
          return;
        }
        const now = Date.now();
        const existed = r.external_id
          ? db.prepare("SELECT id FROM quiz_master_bank WHERE external_id = ?")
              .get(r.external_id)
          : null;
        stmt.run(
          r.external_id ?? null, r.category, r.difficulty, r.question,
          r.options[0], r.options[1], r.options[2], r.options[3], r.correct,
          r.explanation ?? null, r.source ?? null,
          r.tags ? JSON.stringify(r.tags) : null,
          now, now,
        );
        if (existed) updated++;
        else inserted++;
      } catch (e) {
        skipped++;
        errors.push({ index: i, reason: (e as Error).message });
      }
    });
  });
  tx();

  return { inserted, updated, skipped, errors };
}
