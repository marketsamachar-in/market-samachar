/**
 * T20 SERVICE — Dalal Street T20 cricket-themed chart-reading reaction game.
 *
 *   Each match = 36 balls.  Each ball = a real Nifty 50 stock chart with the
 *   last day masked.  Tap UP or DOWN within 1.8s.  Runs scored by reaction
 *   time tier; wrong direction or timeout = wicket.  Match ends at 36 balls
 *   or 10 wickets.
 *
 *   Anti-cheat: server stores `correct_dir` in t20_balls and never sends it
 *   to the client until the ball is played.
 */

import rawDb from "../../../pipeline/db.ts";
import { addCoins } from "./coinService.ts";
import { NIFTY_50 } from "../data/nse-symbols.ts";
import {
  T20_DAILY_MATCH_CAP,
  T20_BALLS_PER_MATCH,
  T20_WICKETS_MAX,
  T20_COINS_PER_RUN,
  T20_CENTURY_BONUS,
  T20_DOUBLE_TON_BONUS,
  T20_BALL_TIMEOUT_MS,
  T20_BALL_FAST_MS,
  T20_BALL_NORMAL_MS,
  T20_BALL_SLOW_MS,
} from "./rewardConfig.ts";

// ─── Chart source: Yahoo Finance v8 chart API (direct fetch) ─────────────────
// We previously used the `yahoo-finance2` npm package, but it sends headers
// that Yahoo filters from datacenter IPs (Railway, Render, etc.), returning
// ETIMEDOUT and breaking T20 in production. Calling the public chart endpoint
// directly with a browser User-Agent works reliably from any environment.

interface ChartPoint { t: number; c: number; }

const CHART_CACHE = new Map<string, { points: ChartPoint[]; fetchedAt: number }>();
const CHART_TTL = 60 * 60_000;  // 1h — daily bars don't change intraday

const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchYahooChart(symbol: string): Promise<ChartPoint[]> {
  // & in symbols (e.g. "M&M") must be URL-encoded as %26
  const sym = encodeURIComponent(`${symbol}.NS`);
  const path = `/v8/finance/chart/${sym}?range=1mo&interval=1d`;

  let lastErr: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept":     "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) { lastErr = new Error(`yahoo ${res.status}`); continue; }
      const data = await res.json() as any;

      const result = data?.chart?.result?.[0];
      if (!result) { lastErr = new Error("no chart result"); continue; }

      const ts:    number[] = result.timestamp ?? [];
      const close: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

      const points: ChartPoint[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = close[i];
        if (c == null || !Number.isFinite(c)) continue;
        points.push({ t: ts[i] * 1000, c: Math.round(c * 100) / 100 });
      }
      return points;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(`yahoo fetch failed for ${symbol}`);
}

async function fetchOneMonthChart(symbol: string): Promise<ChartPoint[]> {
  const hit = CHART_CACHE.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < CHART_TTL) return hit.points;

  const points = await fetchYahooChart(symbol);
  CHART_CACHE.set(symbol, { points, fetchedAt: Date.now() });
  return points;
}

// ─── IST helpers ──────────────────────────────────────────────────────────────

export function getISTDateString(tsMs: number = Date.now()): string {
  return new Date(tsMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─── Types exposed to routes ──────────────────────────────────────────────────

export interface BallPack {
  ballNo:  number;
  /** Last 5–15 days of close prices, last day masked.  For client to render. */
  points:  Array<{ t: number; c: number }>;
}

export interface MatchStartResult {
  matchId:     number;
  ballsPerMatch: number;
  wicketsMax:    number;
  ballTimeoutMs: number;
  balls:       BallPack[];
}

export interface BallResult {
  runs:           number;
  isWicket:       boolean;
  correctDir:     "UP" | "DOWN";
  userDir:        "UP" | "DOWN" | null;     // null = timeout
  reactionMs:     number;
  totalRuns:      number;
  totalWickets:   number;
  ballsBowled:    number;
  matchOver:      boolean;
}

export interface MatchEndResult {
  matchId:        number;
  runs:           number;
  wickets:        number;
  ballsBowled:    number;
  coinsAwarded:   number;
  bonusKind:      "CENTURY" | "DOUBLE_TON" | null;
  bonusCoins:     number;
  ballsPerMatch:  number;
  /** Server-rendered scoreboard text for share cards: "S.Sharma 156* off 36" */
  scoreboardLine: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class T20Error extends Error {
  code: string;
  constructor(code: string, msg: string) { super(msg); this.code = code; }
}

// ─── Match lifecycle ──────────────────────────────────────────────────────────

/** Count today's started matches for daily-cap enforcement (IST day). */
export function getDailyMatchesPlayed(userId: string, istDate: string = getISTDateString()): number {
  const row = rawDb.prepare(
    "SELECT COUNT(*) AS c FROM t20_matches WHERE user_id = ? AND match_date = ?"
  ).get(userId, istDate) as { c: number };
  return row.c;
}

/** User's career-best single-match runs (COMPLETED only). */
export function getCareerBest(userId: string): number {
  const row = rawDb.prepare(
    "SELECT MAX(runs) AS m FROM t20_matches WHERE user_id = ? AND status = 'COMPLETED'"
  ).get(userId) as { m: number | null };
  return row?.m ?? 0;
}

/** Top-N daily leaderboard for a given IST date. */
export function getDailyLeaderboard(istDate: string = getISTDateString(), limit: number = 10): Array<{
  rank:    number;
  user_id: string;
  name:    string | null;
  runs:    number;
  wickets: number;
  balls:   number;
}> {
  const rows = rawDb.prepare(`
    SELECT m.user_id, u.name, m.runs, m.wickets, m.balls_bowled
      FROM t20_matches m
      LEFT JOIN users u ON u.id = m.user_id
     WHERE m.match_date = ? AND m.status = 'COMPLETED'
     ORDER BY m.runs DESC, m.balls_bowled ASC
     LIMIT ?
  `).all(istDate, Math.max(1, Math.min(limit, 50))) as any[];

  return rows.map((r, i) => ({
    rank:    i + 1,
    user_id: r.user_id,
    name:    r.name,
    runs:    r.runs,
    wickets: r.wickets,
    balls:   r.balls_bowled,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pick K distinct random elements from an array. */
function sampleN<T>(arr: T[], k: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/**
 * Build a single ball from a stock's daily chart.  Returns null if the chart
 * has too few points (fresh listing, holiday cluster, etc.).
 */
function buildBall(
  symbol: string, points: ChartPoint[], ballNo: number,
): { ballPack: BallPack; correctDir: "UP" | "DOWN"; symbol: string } | null {
  if (points.length < 7) return null;

  // Pick a split between 5 and points.length - 1 so we always show ≥5 history
  // bars and have a "next bar" to grade against.  Random choice = fresh
  // problem each ball, even if same symbol appears twice.
  const minSplit = 5;
  const maxSplit = points.length - 1;  // exclusive of last bar
  const split    = minSplit + Math.floor(Math.random() * (maxSplit - minSplit));

  const visible  = points.slice(Math.max(0, split - 9), split);   // up to 9 bars of history
  const next     = points[split];
  const last     = visible[visible.length - 1];
  if (!visible.length || !next || !last) return null;

  const correctDir: "UP" | "DOWN" = next.c >= last.c ? "UP" : "DOWN";

  return {
    ballPack: { ballNo, points: visible },
    correctDir,
    symbol,
  };
}

/** Score a played ball.  Anti-cheat: server-only authority. */
function scoreBall(
  userDir:    "UP" | "DOWN" | null,
  correctDir: "UP" | "DOWN",
  reactionMs: number,
): { runs: number; isWicket: boolean } {
  // Timeout or no tap → wicket.
  if (userDir == null || reactionMs >= T20_BALL_TIMEOUT_MS) {
    return { runs: 0, isWicket: true };
  }
  // Wrong direction → wicket regardless of speed.
  if (userDir !== correctDir) {
    return { runs: 0, isWicket: true };
  }
  // Correct: scale runs by reaction time.
  if (reactionMs < T20_BALL_FAST_MS)   return { runs: 6, isWicket: false };
  if (reactionMs < T20_BALL_NORMAL_MS) return { runs: 4, isWicket: false };
  if (reactionMs < T20_BALL_SLOW_MS)   return { runs: 2, isWicket: false };
  return { runs: 1, isWicket: false };
}

// ─── startMatch ───────────────────────────────────────────────────────────────

/**
 * Start a new T20 match.  Fetches 36 random Nifty 50 charts, builds ball
 * packs, persists match + ball rows, returns the (correct-dir-redacted)
 * payload for the client to play.
 *
 * Throws T20Error('daily_cap') if the user has already played 5 today.
 */
export async function startMatch(userId: string): Promise<MatchStartResult> {
  const istDate = getISTDateString();
  const played  = getDailyMatchesPlayed(userId, istDate);
  if (played >= T20_DAILY_MATCH_CAP) {
    throw new T20Error("daily_cap", `Daily cap reached (${T20_DAILY_MATCH_CAP} matches). Come back tomorrow.`);
  }

  // Sample 36 symbols WITH replacement (pool is only 50, we need 36 fresh
  // problems; same symbol twice is fine because the split point varies).
  const symbols: string[] = [];
  for (let i = 0; i < T20_BALLS_PER_MATCH; i++) {
    symbols.push(NIFTY_50[Math.floor(Math.random() * NIFTY_50.length)]);
  }

  // Fetch all charts in parallel (cache hits are cheap, fresh fetches batched).
  const chartResults = await Promise.allSettled(symbols.map((s) => fetchOneMonthChart(s)));

  const balls: Array<{ ballPack: BallPack; correctDir: "UP" | "DOWN"; symbol: string }> = [];
  for (let i = 0; i < chartResults.length; i++) {
    const r = chartResults[i];
    if (r.status !== "fulfilled") continue;
    const built = buildBall(symbols[i], r.value, balls.length + 1);
    if (built) balls.push(built);
    if (balls.length >= T20_BALLS_PER_MATCH) break;
  }

  // If too many fetches failed, retry-fill from a wider pool (rare).
  while (balls.length < T20_BALLS_PER_MATCH) {
    const sym = NIFTY_50[Math.floor(Math.random() * NIFTY_50.length)];
    try {
      const points = await fetchOneMonthChart(sym);
      const built  = buildBall(sym, points, balls.length + 1);
      if (built) balls.push(built);
    } catch {
      // give up this slot — break to avoid infinite loop on persistent failure
      break;
    }
    if (balls.length >= T20_BALLS_PER_MATCH) break;
    if (balls.length < 5) break;  // bail if Yahoo is fully down
  }

  if (balls.length < 10) {
    throw new T20Error("data_unavailable", "Couldn't load enough charts. Try again in a moment.");
  }

  // Persist match + balls atomically.
  const txn = rawDb.transaction((bs: typeof balls) => {
    const matchInsert = rawDb.prepare(`
      INSERT INTO t20_matches (user_id, match_date, started_at, status)
      VALUES (?, ?, ?, 'IN_PROGRESS')
    `).run(userId, istDate, Date.now());

    const matchId = Number(matchInsert.lastInsertRowid);
    const ballInsert = rawDb.prepare(`
      INSERT INTO t20_balls (match_id, ball_no, symbol, correct_dir)
      VALUES (?, ?, ?, ?)
    `);
    for (const b of bs) {
      // Re-number ball_no to be a clean 1..N sequence
      ballInsert.run(matchId, b.ballPack.ballNo, b.symbol, b.correctDir);
    }
    return matchId;
  });

  const matchId = txn(balls);

  return {
    matchId,
    ballsPerMatch: balls.length,
    wicketsMax:    T20_WICKETS_MAX,
    ballTimeoutMs: T20_BALL_TIMEOUT_MS,
    balls:         balls.map((b) => b.ballPack),
  };
}

// ─── playBall ─────────────────────────────────────────────────────────────────

/**
 * Score a single ball.  Updates t20_balls + t20_matches running totals.
 *
 * Throws T20Error if the match doesn't exist, isn't owned by the user,
 * is already over, or the ball was already played.
 */
export function playBall(
  userId:     string,
  matchId:    number,
  ballNo:     number,
  userDir:    "UP" | "DOWN" | null,
  reactionMs: number,
): BallResult {
  const match = rawDb.prepare(
    "SELECT * FROM t20_matches WHERE id = ? LIMIT 1"
  ).get(matchId) as any;

  if (!match)                         throw new T20Error("not_found",      "Match not found.");
  if (match.user_id !== userId)       throw new T20Error("forbidden",      "Not your match.");
  if (match.status !== "IN_PROGRESS") throw new T20Error("match_over",     "Match already finished.");

  const ball = rawDb.prepare(
    "SELECT * FROM t20_balls WHERE match_id = ? AND ball_no = ? LIMIT 1"
  ).get(matchId, ballNo) as any;
  if (!ball)               throw new T20Error("ball_not_found", "Ball not found.");
  if (ball.user_dir != null) throw new T20Error("ball_played",    "Ball already played.");

  const reaction = Math.max(0, Math.min(reactionMs | 0, 60_000));
  const { runs, isWicket } = scoreBall(userDir, ball.correct_dir, reaction);

  const newTotalRuns    = match.runs    + runs;
  const newTotalWickets = match.wickets + (isWicket ? 1 : 0);
  const newBallsBowled  = match.balls_bowled + 1;

  const matchOver =
    newBallsBowled >= T20_BALLS_PER_MATCH ||
    newTotalWickets >= T20_WICKETS_MAX;

  rawDb.transaction(() => {
    rawDb.prepare(`
      UPDATE t20_balls
         SET user_dir = ?, reaction_ms = ?, runs = ?, is_wicket = ?, played_at = ?
       WHERE id = ?
    `).run(userDir, reaction, runs, isWicket ? 1 : 0, Date.now(), ball.id);

    rawDb.prepare(`
      UPDATE t20_matches
         SET runs = ?, wickets = ?, balls_bowled = ?
       WHERE id = ?
    `).run(newTotalRuns, newTotalWickets, newBallsBowled, matchId);
  })();

  return {
    runs,
    isWicket,
    correctDir:    ball.correct_dir,
    userDir,
    reactionMs:    reaction,
    totalRuns:     newTotalRuns,
    totalWickets:  newTotalWickets,
    ballsBowled:   newBallsBowled,
    matchOver,
  };
}

// ─── endMatch ─────────────────────────────────────────────────────────────────

/** Finalize a match, compute bonus, award coins, return scoreboard. */
export function endMatch(userId: string, matchId: number): MatchEndResult {
  const match = rawDb.prepare(
    "SELECT * FROM t20_matches WHERE id = ? LIMIT 1"
  ).get(matchId) as any;

  if (!match)                         throw new T20Error("not_found", "Match not found.");
  if (match.user_id !== userId)       throw new T20Error("forbidden", "Not your match.");
  if (match.status === "COMPLETED")   {
    // Idempotent: return already-finalized result.
    return makeEndResult(match);
  }

  // Finalize.
  const baseCoins = match.runs * T20_COINS_PER_RUN;
  let bonusKind: "CENTURY" | "DOUBLE_TON" | null = null;
  let bonusCoins = 0;

  if (match.runs >= 200)      { bonusKind = "DOUBLE_TON"; bonusCoins = T20_DOUBLE_TON_BONUS; }
  else if (match.runs >= 100) { bonusKind = "CENTURY";    bonusCoins = T20_CENTURY_BONUS;    }

  const totalCoins = baseCoins + bonusCoins;
  const now = Date.now();

  rawDb.prepare(`
    UPDATE t20_matches
       SET status = 'COMPLETED', ended_at = ?, coins_awarded = ?, bonus_kind = ?
     WHERE id = ?
  `).run(now, totalCoins, bonusKind, matchId);

  // Pay out coins (split into two ledger entries when bonus applies for clarity).
  if (baseCoins > 0) {
    try {
      addCoins(userId, baseCoins, "T20_RUNS", String(matchId), `T20 ${match.runs} runs`);
    } catch (e) {
      console.error(`[t20] base payout failed for match ${matchId}:`, e);
    }
  }
  if (bonusKind && bonusCoins > 0) {
    try {
      addCoins(userId, bonusCoins, bonusKind === "DOUBLE_TON" ? "T20_DOUBLE_TON" : "T20_CENTURY",
               String(matchId), bonusKind === "DOUBLE_TON" ? "T20 double ton" : "T20 century");
    } catch (e) {
      console.error(`[t20] bonus payout failed for match ${matchId}:`, e);
    }
  }

  // Re-read to return finalized state.
  const fresh = rawDb.prepare("SELECT * FROM t20_matches WHERE id = ? LIMIT 1").get(matchId) as any;
  return makeEndResult(fresh);
}

function makeEndResult(match: any): MatchEndResult {
  const notOut       = match.wickets < T20_WICKETS_MAX;
  const star         = notOut ? "*" : "";
  const scoreboardLine = `${match.runs}${star} off ${match.balls_bowled}`;
  return {
    matchId:        match.id,
    runs:           match.runs,
    wickets:        match.wickets,
    ballsBowled:    match.balls_bowled,
    coinsAwarded:   match.coins_awarded,
    bonusKind:      match.bonus_kind,
    bonusCoins:     match.bonus_kind === "DOUBLE_TON"
                      ? T20_DOUBLE_TON_BONUS
                    : match.bonus_kind === "CENTURY"
                      ? T20_CENTURY_BONUS
                      : 0,
    ballsPerMatch:  T20_BALLS_PER_MATCH,
    scoreboardLine,
  };
}
