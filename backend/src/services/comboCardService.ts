/**
 * ComboCardService — Daily 5-question prediction lottery.
 *
 *   Questions (fixed every day):
 *     1. Will Nifty 50 close UP or DOWN?
 *     2. Will Bank Nifty close UP or DOWN?
 *     3. Will USD/INR close UP or DOWN?
 *     4. Will Gold close UP or DOWN?
 *     5. Which sector tops the day? (Auto / Bank / FMCG / IT / Pharma / Energy / Realty)
 *
 *   Submission window: market-open day until 09:30 IST (strict).
 *   Settlement: 15:35 IST via Yahoo close-of-day data.
 *
 *   Payout (no participation reward — score-based):
 *     0–2/5 = 0 · 3/5 = 100 · 4/5 = 500 · 5/5 = 5,000
 */

import yahooFinance from "yahoo-finance2";
import rawDb from "../../../pipeline/db.ts";
import { addCoins } from "./coinService.ts";
import {
  COMBO_CARD_3OF5_COINS,
  COMBO_CARD_4OF5_COINS,
  COMBO_CARD_5OF5_COINS,
  COMBO_CARD_SUBMIT_CUTOFF_IST,
} from "./rewardConfig.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = "UP" | "DOWN";
export type Sector =
  | "AUTO" | "BANK" | "FMCG" | "IT" | "PHARMA" | "ENERGY" | "REALTY";

export const SECTORS: readonly Sector[] = [
  "AUTO", "BANK", "FMCG", "IT", "PHARMA", "ENERGY", "REALTY",
] as const;

const SECTOR_TO_SYMBOL: Record<Sector, string> = {
  AUTO:    "^CNXAUTO",
  BANK:    "^NSEBANK",
  FMCG:    "^CNXFMCG",
  IT:      "^CNXIT",
  PHARMA:  "^CNXPHARMA",
  ENERGY:  "^CNXENERGY",
  REALTY:  "^CNXREALTY",
};

export interface ComboPicks {
  pick_nifty:     Direction;
  pick_banknifty: Direction;
  pick_usdinr:    Direction;
  pick_gold:      Direction;
  pick_sector:    Sector;
}

export interface ComboCardRow {
  card_date:        string;
  answer_nifty:     Direction | null;
  answer_banknifty: Direction | null;
  answer_usdinr:    Direction | null;
  answer_gold:      Direction | null;
  answer_sector:    Sector | null;
  sector_pcts_json: string | null;
  created_at:       number;
  settled_at:       number | null;
}

export interface UserComboPickRow {
  id:             number;
  user_id:        string;
  card_date:      string;
  pick_nifty:     Direction;
  pick_banknifty: Direction;
  pick_usdinr:    Direction;
  pick_gold:      Direction;
  pick_sector:    Sector;
  score:          number | null;
  coins_awarded:  number;
  submitted_at:   number;
  settled_at:     number | null;
}

// ─── IST helpers ──────────────────────────────────────────────────────────────

export function getISTDateString(tsMs: number = Date.now()): string {
  return new Date(tsMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Unix ms for HH:MM IST on a given IST date "YYYY-MM-DD". */
function istDateAtMs(istDate: string, hh: number, mm: number): number {
  let utcHour = hh - 5;
  let utcMin  = mm - 30;
  if (utcMin < 0) { utcMin += 60; utcHour -= 1; }
  if (utcHour < 0) utcHour += 24;
  const isoUtc = `${istDate}T${String(utcHour).padStart(2, "0")}:${String(utcMin).padStart(2, "0")}:00.000Z`;
  return new Date(isoUtc).getTime();
}

/** Today's submission cutoff timestamp (09:30 IST). */
export function getCutoffMs(istDate: string = getISTDateString()): number {
  return istDateAtMs(istDate, COMBO_CARD_SUBMIT_CUTOFF_IST.h, COMBO_CARD_SUBMIT_CUTOFF_IST.m);
}

/** True if the given IST date is a weekday (NSE trading session). */
function isTradingDay(istDate: string): boolean {
  const d = new Date(istDate + "T00:00:00.000Z").getUTCDay(); // 0=Sun..6=Sat
  return d !== 0 && d !== 6;
}

// ─── Card lifecycle ───────────────────────────────────────────────────────────

/**
 * Look up today's card row.  Returns null if it hasn't been created yet.
 * Cards are lazily created when the first user submits picks for the day.
 */
export function getCard(istDate: string = getISTDateString()): ComboCardRow | null {
  const row = rawDb.prepare(
    "SELECT * FROM combo_cards WHERE card_date = ? LIMIT 1"
  ).get(istDate) as ComboCardRow | undefined;
  return row ?? null;
}

/** Idempotently create today's card. Safe to call from any path. */
function ensureCard(istDate: string): void {
  rawDb.prepare(
    "INSERT INTO combo_cards (card_date, created_at) VALUES (?, ?) ON CONFLICT(card_date) DO NOTHING"
  ).run(istDate, Date.now());
}

/** Get a user's pick for the given card date, or null. */
export function getUserPick(userId: string, istDate: string): UserComboPickRow | null {
  const row = rawDb.prepare(
    "SELECT * FROM user_combo_picks WHERE user_id = ? AND card_date = ? LIMIT 1"
  ).get(userId, istDate) as UserComboPickRow | undefined;
  return row ?? null;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export class SubmissionError extends Error {
  code: string;
  constructor(code: string, msg: string) { super(msg); this.code = code; }
}

/**
 * Submit a user's 5 picks for today.  Throws SubmissionError on:
 *   - cutoff_passed: it's after 09:30 IST
 *   - non_trading_day: weekend (no settlement possible)
 *   - already_submitted: user already has a pick for today
 */
export function submitPicks(userId: string, picks: ComboPicks): UserComboPickRow {
  const istDate = getISTDateString();

  if (!isTradingDay(istDate)) {
    throw new SubmissionError("non_trading_day", "Markets are closed today (weekend).");
  }
  if (Date.now() >= getCutoffMs(istDate)) {
    throw new SubmissionError("cutoff_passed", "Submissions closed at 09:30 IST. Try tomorrow.");
  }
  const existing = getUserPick(userId, istDate);
  if (existing) {
    throw new SubmissionError("already_submitted", "You've already submitted today's combo.");
  }

  ensureCard(istDate);

  const now = Date.now();
  const result = rawDb.prepare(`
    INSERT INTO user_combo_picks
      (user_id, card_date, pick_nifty, pick_banknifty, pick_usdinr, pick_gold, pick_sector, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, istDate,
    picks.pick_nifty, picks.pick_banknifty, picks.pick_usdinr, picks.pick_gold, picks.pick_sector,
    now,
  );

  return getUserPick(userId, istDate)!;
}

// ─── Settlement ───────────────────────────────────────────────────────────────

interface QuoteSnapshot { changePercent: number; }

/** Fetch close-of-day Yahoo quote.  Returns null on error. */
async function fetchPct(symbol: string): Promise<QuoteSnapshot | null> {
  try {
    const q = await yahooFinance.quote(symbol);
    const pct = (q as any).regularMarketChangePercent;
    if (typeof pct !== "number" || !isFinite(pct)) return null;
    return { changePercent: pct };
  } catch (e) {
    console.error(`[combo] fetch ${symbol} failed:`, e);
    return null;
  }
}

function payoutForScore(score: number): { coins: number; tier: string | null } {
  if (score === 5) return { coins: COMBO_CARD_5OF5_COINS, tier: "COMBO_CARD_5OF5" };
  if (score === 4) return { coins: COMBO_CARD_4OF5_COINS, tier: "COMBO_CARD_4OF5" };
  if (score === 3) return { coins: COMBO_CARD_3OF5_COINS, tier: "COMBO_CARD_3OF5" };
  return { coins: 0, tier: null };
}

/**
 * Settle a card: fetch Yahoo close data, mark answers, score every user pick,
 * award coins.  Idempotent — re-running on an already-settled card is a no-op.
 */
export async function settleCard(istDate: string = getISTDateString()): Promise<{
  ok:        boolean;
  date:      string;
  reason?:   string;
  scored?:   number;
  payouts?:  number;
}> {
  const card = getCard(istDate);
  if (!card) {
    return { ok: false, date: istDate, reason: "no_card" };
  }
  if (card.settled_at) {
    return { ok: false, date: istDate, reason: "already_settled" };
  }

  // Fetch all required quotes.
  const [niftyQ, bankQ, inrQ, goldQ, ...sectorQs] = await Promise.all([
    fetchPct("^NSEI"),
    fetchPct("^NSEBANK"),
    fetchPct("USDINR=X"),
    fetchPct("GC=F"),
    ...SECTORS.map((s) => fetchPct(SECTOR_TO_SYMBOL[s])),
  ]);

  if (!niftyQ || !bankQ || !inrQ || !goldQ) {
    return { ok: false, date: istDate, reason: "quote_fetch_failed" };
  }

  // Direction answers (treat exactly 0 as DOWN to keep the answer deterministic).
  const ansNifty:     Direction = niftyQ.changePercent > 0 ? "UP" : "DOWN";
  const ansBankNifty: Direction = bankQ.changePercent  > 0 ? "UP" : "DOWN";
  const ansUsdInr:    Direction = inrQ.changePercent   > 0 ? "UP" : "DOWN";
  const ansGold:      Direction = goldQ.changePercent  > 0 ? "UP" : "DOWN";

  // Sector winner — fall back to BANK if all sector fetches fail.
  const sectorPcts: Record<Sector, number | null> = {} as any;
  SECTORS.forEach((s, i) => {
    const q = sectorQs[i];
    sectorPcts[s] = q ? q.changePercent : null;
  });
  let ansSector: Sector = "BANK";
  let bestPct = -Infinity;
  let anySector = false;
  for (const s of SECTORS) {
    const p = sectorPcts[s];
    if (p == null) continue;
    anySector = true;
    if (p > bestPct) { bestPct = p; ansSector = s; }
  }
  if (!anySector) {
    return { ok: false, date: istDate, reason: "sector_fetch_failed" };
  }

  // Persist answers atomically.
  const now = Date.now();
  rawDb.prepare(`
    UPDATE combo_cards
       SET answer_nifty=?, answer_banknifty=?, answer_usdinr=?, answer_gold=?,
           answer_sector=?, sector_pcts_json=?, settled_at=?
     WHERE card_date=?
  `).run(
    ansNifty, ansBankNifty, ansUsdInr, ansGold,
    ansSector, JSON.stringify(sectorPcts), now, istDate,
  );

  // Score every pick row that is still pending.
  const picks = rawDb.prepare(
    "SELECT * FROM user_combo_picks WHERE card_date = ? AND settled_at IS NULL"
  ).all(istDate) as UserComboPickRow[];

  let scoredCount = 0;
  let totalPayoutCoins = 0;

  for (const p of picks) {
    let score = 0;
    if (p.pick_nifty     === ansNifty)     score++;
    if (p.pick_banknifty === ansBankNifty) score++;
    if (p.pick_usdinr    === ansUsdInr)    score++;
    if (p.pick_gold      === ansGold)      score++;
    if (p.pick_sector    === ansSector)    score++;

    const { coins, tier } = payoutForScore(score);

    rawDb.prepare(
      "UPDATE user_combo_picks SET score=?, coins_awarded=?, settled_at=? WHERE id=?"
    ).run(score, coins, now, p.id);

    if (coins > 0 && tier) {
      try {
        addCoins(p.user_id, coins, tier as any, istDate, `Combo Card ${score}/5`);
        totalPayoutCoins += coins;
      } catch (e) {
        console.error(`[combo] payout failed for user ${p.user_id}:`, e);
      }
    }
    scoredCount++;
  }

  console.log(`[combo] Settled ${istDate}: ${scoredCount} picks scored, ${totalPayoutCoins} coins paid`);
  return { ok: true, date: istDate, scored: scoredCount, payouts: totalPayoutCoins };
}

// ─── Read-side helpers for routes ─────────────────────────────────────────────

/** Last N settled cards for a given user, with pick + score + delta. */
export function getUserHistory(userId: string, limit: number = 10): Array<{
  card_date:     string;
  picks:         ComboPicks;
  answers:       Partial<Record<keyof ComboPicks, Direction | Sector>>;
  score:         number | null;
  coins_awarded: number;
  settled:       boolean;
}> {
  const rows = rawDb.prepare(`
    SELECT c.card_date,
           c.answer_nifty, c.answer_banknifty, c.answer_usdinr,
           c.answer_gold, c.answer_sector, c.settled_at,
           p.pick_nifty, p.pick_banknifty, p.pick_usdinr,
           p.pick_gold, p.pick_sector, p.score, p.coins_awarded
      FROM user_combo_picks p
      JOIN combo_cards c ON c.card_date = p.card_date
     WHERE p.user_id = ?
     ORDER BY p.card_date DESC
     LIMIT ?
  `).all(userId, Math.max(1, Math.min(limit, 30))) as any[];

  return rows.map((r) => ({
    card_date: r.card_date,
    picks: {
      pick_nifty:     r.pick_nifty,
      pick_banknifty: r.pick_banknifty,
      pick_usdinr:    r.pick_usdinr,
      pick_gold:      r.pick_gold,
      pick_sector:    r.pick_sector,
    },
    answers: {
      pick_nifty:     r.answer_nifty,
      pick_banknifty: r.answer_banknifty,
      pick_usdinr:    r.answer_usdinr,
      pick_gold:      r.answer_gold,
      pick_sector:    r.answer_sector,
    },
    score:         r.score,
    coins_awarded: r.coins_awarded,
    settled:       !!r.settled_at,
  }));
}
