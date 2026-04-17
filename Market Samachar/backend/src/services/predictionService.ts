/**
 * PredictionService — Daily Forecast prediction feature.
 *
 * Cron schedule (IST):
 *   08:45 → createDailyPrediction()   — creates today's questions
 *   15:35 → resolvePredictions()      — grades all predictions
 */

import { geminiCall, hasAvailableKey } from "./geminiKeyManager.ts";
import rawDb from "../../../pipeline/db.ts";
import {
  createDailyPrediction,
  saveUserPrediction,
  resolveDailyPrediction,
} from "../../../pipeline/db.ts";
import type { DailyPrediction } from "../../../pipeline/db.ts";
import { addCoins, ensureUser } from "./coinService.ts";

// ─── Reward constants (from central config) ──────────────────────────────────

import {
  PREDICTION_VOTE_COINS as PARTICIPATION_COINS,
  PREDICTION_CORRECT_COINS as CORRECT_BONUS_COINS,
} from "./rewardConfig.ts";

const NIFTY_SYMBOL = "^NSEI";

// ─── IST helpers ─────────────────────────────────────────────────────────────

export function getISTDateString(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Build a Unix timestamp for HH:MM on today's IST date. */
function todayISTAt(hh: number, mm: number): number {
  const today = getISTDateString(); // YYYY-MM-DD
  // IST = UTC+5:30; convert IST time to UTC
  let utcHour = hh - 5;
  let utcMin  = mm - 30;
  if (utcMin < 0) { utcMin += 60; utcHour -= 1; }
  if (utcHour < 0) utcHour += 24;
  const isoUtc = `${today}T${String(utcHour).padStart(2, "0")}:${String(utcMin).padStart(2, "0")}:00.000Z`;
  return new Date(isoUtc).getTime();
}

// ─── Gemini helper ────────────────────────────────────────────────────────────

async function generateStockPredictionQuestion(): Promise<{
  question:     string;
  symbol:       string;
  optionGreen:  string;
  optionRed:    string;
} | null> {
  if (!hasAvailableKey()) return null;

  // Pull up to 15 recent company/indian news headlines from SQLite
  const rows = rawDb.prepare(`
    SELECT title, category FROM news_items
    WHERE category IN ('companies', 'indian', 'banking', 'economy', 'ipo')
      AND fetched_at > ?
    ORDER BY fetched_at DESC
    LIMIT 15
  `).all(Date.now() - 24 * 60 * 60 * 1000) as Array<{ title: string; category: string }>;

  if (rows.length === 0) return null;

  const headlines = rows.map((r, i) => `${i + 1}. [${r.category}] ${r.title}`).join("\n");

  const prompt = `You are a financial analyst. Based on these Indian market news headlines from today:
${headlines}

Pick ONE specific NSE-listed stock that is clearly in focus today and create a prediction question.
Return ONLY valid JSON, no markdown, no extra text:
{
  "question": "Will [CompanyName] ([SYMBOL]) close Green or Red today?",
  "symbol": "SYMBOLINUPPERCASE",
  "option_green": "Green 📈",
  "option_red": "Red 📉",
  "reason": "one sentence why this stock is interesting today"
}
Rules:
- symbol must be a real NSE ticker (e.g. RELIANCE, TCS, INFY, HDFCBANK)
- Do NOT pick Nifty or Sensex indexes
- Choose the most newsworthy stock from the headlines`;

  try {
    const raw = await geminiCall([{ role: 'user', parts: [{ text: prompt }] }]);
    const json = JSON.parse(raw.trim().replace(/```json\n?|```\n?/g, "").trim());
    return {
      question:    json.question,
      symbol:      json.symbol?.toUpperCase(),
      optionGreen: json.option_green ?? "Green 📈",
      optionRed:   json.option_red   ?? "Red 📉",
    };
  } catch (err) {
    console.error("[predictionService] Gemini question gen failed:", err);
    return null;
  }
}

// ─── 1. Create daily predictions ─────────────────────────────────────────────

/**
 * Creates today's prediction questions.
 * Called by cron at 08:45 IST on weekdays.
 * Idempotent — skips if today's questions already exist.
 */
export async function createDailyPredictions(): Promise<void> {
  const today     = getISTDateString();
  const resolvesAt = todayISTAt(15, 35); // 3:35 PM IST

  // Check if today's Nifty question already exists
  const existing = rawDb.prepare(`
    SELECT id FROM daily_predictions
    WHERE prediction_type = 'NIFTY_DIRECTION'
      AND date(created_at / 1000, 'unixepoch', '+5 hours', '+30 minutes') = ?
    LIMIT 1
  `).get(today);

  if (existing) {
    console.log(`[predictionService] Today's predictions already exist — skipping`);
    return;
  }

  const now = Date.now();

  // ── Question 1: Nifty Direction (always) ─────────────────────────────────
  createDailyPrediction({
    question:        "Will Nifty 50 close Green or Red today?",
    prediction_type: "NIFTY_DIRECTION",
    symbol:          null,
    correct_answer:  null,
    resolves_at:     resolvesAt,
    created_at:      now,
  });
  console.log(`[predictionService] Created Nifty direction question for ${today}`);

  // ── Question 2: AI-generated stock question ───────────────────────────────
  const stock = await generateStockPredictionQuestion();
  if (stock) {
    createDailyPrediction({
      question:        stock.question,
      prediction_type: "STOCK_DIRECTION",
      symbol:          stock.symbol,
      correct_answer:  null,
      resolves_at:     resolvesAt,
      created_at:      now + 1, // ensure distinct created_at
    });
    console.log(`[predictionService] Created stock prediction: ${stock.symbol}`);
  }
}

// ─── 2. Submit a prediction vote ─────────────────────────────────────────────

export interface SubmitResult {
  success:         boolean;
  coinsAwarded:    number;
  communityStats:  CommunityStats;
  alreadyVoted?:   boolean;
}

export interface CommunityStats {
  totalVotes:  number;
  options:     Array<{ answer: string; count: number; percent: number }>;
}

function getCommunityStats(predictionId: number): CommunityStats {
  const rows = rawDb.prepare(`
    SELECT answer, COUNT(*) AS count
    FROM user_predictions
    WHERE prediction_id = ?
    GROUP BY answer
    ORDER BY count DESC
  `).all(predictionId) as Array<{ answer: string; count: number }>;

  const totalVotes = rows.reduce((s, r) => s + r.count, 0);
  return {
    totalVotes,
    options: rows.map((r) => ({
      answer:  r.answer,
      count:   r.count,
      percent: totalVotes > 0 ? Math.round((r.count / totalVotes) * 100) : 0,
    })),
  };
}

/**
 * Submit a user's vote on a prediction.
 * Awards 5 coins for participation regardless of correctness.
 */
export async function submitPrediction(
  userId:       string,
  predictionId: number,
  answer:       string,
): Promise<SubmitResult> {
  // Load prediction
  const prediction = rawDb.prepare(
    "SELECT * FROM daily_predictions WHERE id = ? LIMIT 1"
  ).get(predictionId) as DailyPrediction | undefined;

  if (!prediction) {
    throw new Error("Prediction not found");
  }
  if (prediction.correct_answer !== null) {
    throw new Error("This prediction has already resolved");
  }
  if (Date.now() > prediction.resolves_at) {
    throw new Error("Voting window has closed for this prediction");
  }

  // Check for duplicate vote
  const existing = rawDb.prepare(
    "SELECT id FROM user_predictions WHERE user_id = ? AND prediction_id = ? LIMIT 1"
  ).get(userId, predictionId);

  if (existing) {
    return {
      success:       false,
      coinsAwarded:  0,
      communityStats: getCommunityStats(predictionId),
      alreadyVoted:  true,
    };
  }

  // Ensure user row exists in SQLite
  ensureUser(userId);

  // Insert vote
  saveUserPrediction({
    user_id:       userId,
    prediction_id: predictionId,
    answer,
    created_at:    Date.now(),
  });

  // Award participation coins
  const newBalance = addCoins(
    userId,
    PARTICIPATION_COINS,
    "PREDICTION_VOTE",
    String(predictionId),
    `Voted on prediction #${predictionId}`,
  );
  console.log(`[predictionService] User ${userId} voted "${answer}" → balance now ${newBalance}`);

  return {
    success:        true,
    coinsAwarded:   PARTICIPATION_COINS,
    communityStats: getCommunityStats(predictionId),
  };
}

// ─── 3. Resolve predictions ───────────────────────────────────────────────────

/**
 * Resolve all pending predictions that are past their resolves_at time.
 * Called by cron at 15:35 IST.
 *
 * For NIFTY_DIRECTION: fetches live Nifty change from Yahoo Finance.
 * For STOCK_DIRECTION: fetches the stock's changePercent from cache/Yahoo.
 */
export async function resolvePredictions(): Promise<void> {
  const now     = Date.now();
  const pending = rawDb.prepare(`
    SELECT * FROM daily_predictions
    WHERE correct_answer IS NULL AND resolves_at <= ?
    ORDER BY resolves_at ASC
  `).all(now) as DailyPrediction[];

  if (pending.length === 0) {
    console.log("[predictionService] No predictions to resolve");
    return;
  }

  for (const pred of pending) {
    try {
      const symbol = pred.prediction_type === "NIFTY_DIRECTION"
        ? NIFTY_SYMBOL
        : (pred.symbol ?? NIFTY_SYMBOL);

      // Fetch closing change % from Yahoo Finance
      const changePercent = await fetchChangePercent(symbol);
      const answer        = changePercent > 0 ? "Green 📈" : "Red 📉";

      console.log(
        `[predictionService] Resolving #${pred.id} "${pred.question}" → ${answer} ` +
        `(${changePercent.toFixed(2)}% change for ${symbol})`
      );

      const winners = resolveDailyPrediction(pred.id, answer, CORRECT_BONUS_COINS);
      console.log(`[predictionService] Prediction #${pred.id} resolved — ${winners} winner(s)`);
    } catch (err) {
      console.error(`[predictionService] Failed to resolve prediction #${pred.id}:`, err);
    }
  }
}

async function fetchChangePercent(symbol: string): Promise<number> {
  const encoded = encodeURIComponent(symbol);
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept":     "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Yahoo Finance ${res.status} for ${symbol}`);

  const json: any = await res.json();
  const meta: any = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No meta for ${symbol}`);

  return (meta.regularMarketChangePercent as number) ?? 0;
}

// ─── 4. Get today's predictions for a user ───────────────────────────────────

export interface PredictionWithState {
  id:              number;
  question:        string;
  prediction_type: string;
  symbol:          string | null;
  resolves_at:     number;
  created_at:      number;
  correct_answer:  string | null;
  isResolved:      boolean;
  votingOpen:      boolean;
  userVote:        string | null;
  coinsAwarded:    number;
  communityStats:  CommunityStats;
}

export interface TodayPredictionsResult {
  date:        string;
  predictions: PredictionWithState[];
  yesterday:   YesterdayResult[];
}

export interface YesterdayResult {
  question:       string;
  correct_answer: string;
  userVote:       string | null;
  wasCorrect:     boolean | null;
  coinsAwarded:   number;
}

export function getTodayPredictions(userId: string): TodayPredictionsResult {
  const today     = getISTDateString();
  const todayStart = new Date(`${today}T00:00:00+05:30`).getTime();
  const todayEnd   = todayStart + 86_400_000;

  // Today's predictions
  const todayRows = rawDb.prepare(`
    SELECT * FROM daily_predictions
    WHERE created_at >= ? AND created_at < ?
    ORDER BY id ASC
  `).all(todayStart, todayEnd) as DailyPrediction[];

  const predictions: PredictionWithState[] = todayRows.map((p) => {
    const userRow = rawDb.prepare(
      "SELECT answer, coins_awarded, is_correct FROM user_predictions WHERE user_id = ? AND prediction_id = ? LIMIT 1"
    ).get(userId, p.id) as { answer: string; coins_awarded: number; is_correct: number | null } | undefined;

    const stats = getCommunityStats(p.id);

    return {
      id:              p.id,
      question:        p.question,
      prediction_type: p.prediction_type,
      symbol:          p.symbol,
      resolves_at:     p.resolves_at,
      created_at:      p.created_at,
      correct_answer:  p.correct_answer,
      isResolved:      p.correct_answer !== null,
      votingOpen:      p.correct_answer === null && Date.now() < p.resolves_at,
      userVote:        userRow?.answer ?? null,
      coinsAwarded:    userRow?.coins_awarded ?? 0,
      communityStats:  stats,
    };
  });

  // Yesterday's resolved predictions + user results
  const yesterdayDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - 86_400_000)
    .toISOString().slice(0, 10);
  const yesterdayStart = new Date(`${yesterdayDate}T00:00:00+05:30`).getTime();
  const yesterdayEnd   = yesterdayStart + 86_400_000;

  const yesterdayRows = rawDb.prepare(`
    SELECT * FROM daily_predictions
    WHERE created_at >= ? AND created_at < ? AND correct_answer IS NOT NULL
    ORDER BY id ASC
  `).all(yesterdayStart, yesterdayEnd) as DailyPrediction[];

  const yesterdayResults: YesterdayResult[] = yesterdayRows.map((p) => {
    const userRow = rawDb.prepare(
      "SELECT answer, coins_awarded, is_correct FROM user_predictions WHERE user_id = ? AND prediction_id = ? LIMIT 1"
    ).get(userId, p.id) as { answer: string; coins_awarded: number; is_correct: number | null } | undefined;

    return {
      question:       p.question,
      correct_answer: p.correct_answer!,
      userVote:       userRow?.answer ?? null,
      wasCorrect:     userRow ? (userRow.is_correct === 1) : null,
      coinsAwarded:   userRow?.coins_awarded ?? 0,
    };
  });

  return { date: today, predictions, yesterday: yesterdayResults };
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface PredictionHistoryEntry {
  predictionId:   number;
  question:       string;
  userVote:       string;
  correctAnswer:  string | null;
  isCorrect:      boolean | null;
  coinsAwarded:   number;
  createdAt:      number;
}

export interface PredictionHistory {
  totalVotes:    number;
  correctVotes:  number;
  accuracyRate:  number;
  coinsEarned:   number;
  entries:       PredictionHistoryEntry[];
}

export function getUserPredictionHistory(userId: string, limit = 30): PredictionHistory {
  const rows = rawDb.prepare(`
    SELECT
      up.prediction_id,
      dp.question,
      up.answer       AS user_vote,
      dp.correct_answer,
      up.is_correct,
      up.coins_awarded,
      up.created_at
    FROM user_predictions up
    JOIN daily_predictions dp ON dp.id = up.prediction_id
    WHERE up.user_id = ?
    ORDER BY up.created_at DESC
    LIMIT ?
  `).all(userId, limit) as Array<{
    prediction_id:  number;
    question:       string;
    user_vote:      string;
    correct_answer: string | null;
    is_correct:     number | null;
    coins_awarded:  number;
    created_at:     number;
  }>;

  const totalVotes   = rows.length;
  const resolvedRows = rows.filter((r) => r.is_correct !== null);
  const correctVotes = resolvedRows.filter((r) => r.is_correct === 1).length;
  const accuracyRate = resolvedRows.length > 0
    ? Math.round((correctVotes / resolvedRows.length) * 100)
    : 0;
  const coinsEarned  = rows.reduce((s, r) => s + r.coins_awarded, 0);

  return {
    totalVotes,
    correctVotes,
    accuracyRate,
    coinsEarned,
    entries: rows.map((r) => ({
      predictionId:  r.prediction_id,
      question:      r.question,
      userVote:      r.user_vote,
      correctAnswer: r.correct_answer,
      isCorrect:     r.is_correct === null ? null : r.is_correct === 1,
      coinsAwarded:  r.coins_awarded,
      createdAt:     r.created_at,
    })),
  };
}
