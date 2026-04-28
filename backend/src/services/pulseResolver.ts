/**
 * pulseResolver — 24h resolution cron for PULSE swipes.
 *
 * For every swipe with a known symbol that's >= 24h old and not yet resolved,
 * compare the price snapshot taken at swipe time vs the current price.
 *  - direction BULL & price up   → correct  → award PULSE_CORRECT_BONUS_COINS
 *  - direction BEAR & price down → correct  → award PULSE_CORRECT_BONUS_COINS
 *  - mismatch                    → wrong, no payout
 *
 * Swipes without a captured swipe_price (symbol detected but stale price)
 * are still resolved, comparing against fetchStockPrice() called at swipe
 * time vs now using a 24h-ago Yahoo close — falling back to "no payout" if
 * we can't compute a delta. Worst case: user gets the +5 swipe coin only.
 */

import rawDb from "../../../pipeline/db.ts";
import { addCoins } from "./coinService.ts";
import { fetchStockPrice } from "./stockPriceService.ts";
import { PULSE_CORRECT_BONUS_COINS } from "./rewardConfig.ts";

const RESOLVE_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE     = 50;

let _running = false;

interface PendingSwipe {
  id:          number;
  user_id:     string;
  article_id:  string;
  symbol:      string;
  direction:   "BULL" | "BEAR";
  swipe_price: number | null;
  swiped_at:   number;
}

/**
 * Resolve up to BATCH_SIZE pending swipes that are >= 24h old.
 * Idempotent — sets resolved_at so we never re-process.
 */
export async function resolvePulseSwipes(): Promise<{ checked: number; correct: number; wrong: number }> {
  if (_running) return { checked: 0, correct: 0, wrong: 0 };
  _running = true;

  try {
    const cutoff = Date.now() - RESOLVE_AGE_MS;
    const rows = rawDb.prepare(`
      SELECT id, user_id, article_id, symbol, direction, swipe_price, swiped_at
      FROM pulse_swipes
      WHERE resolved_at IS NULL
        AND symbol IS NOT NULL
        AND swiped_at <= ?
      ORDER BY swiped_at ASC
      LIMIT ?
    `).all(cutoff, BATCH_SIZE) as PendingSwipe[];

    let correct = 0, wrong = 0;

    for (const row of rows) {
      // Need a baseline price to compare. If swipe_price is null, mark
      // resolved with no payout (we can't fairly score it).
      if (row.swipe_price == null) {
        rawDb.prepare(
          "UPDATE pulse_swipes SET resolved_at = ?, was_correct = NULL WHERE id = ?"
        ).run(Date.now(), row.id);
        continue;
      }

      let nowPrice: number;
      try {
        const sp = await fetchStockPrice(row.symbol);
        if (sp.currentPrice <= 0) throw new Error("no price");
        nowPrice = sp.currentPrice;
      } catch {
        // Skip — try next cron run
        continue;
      }

      const moved = nowPrice - row.swipe_price;
      const wasCorrect =
        (row.direction === "BULL" && moved > 0) ||
        (row.direction === "BEAR" && moved < 0);

      const bonus = wasCorrect ? PULSE_CORRECT_BONUS_COINS : 0;

      rawDb.transaction(() => {
        rawDb.prepare(`
          UPDATE pulse_swipes
          SET resolved_at = ?, was_correct = ?, bonus_coins = ?
          WHERE id = ?
        `).run(Date.now(), wasCorrect ? 1 : 0, bonus, row.id);

        if (wasCorrect) {
          addCoins(
            row.user_id,
            PULSE_CORRECT_BONUS_COINS,
            "PULSE_CORRECT",
            row.article_id,
            `${row.direction} ${row.symbol} ${moved > 0 ? "+" : ""}${moved.toFixed(2)}`,
          );
        }
      })();

      if (wasCorrect) correct++; else wrong++;
    }

    if (rows.length > 0) {
      console.log(`[pulseResolver] checked ${rows.length} — correct: ${correct}, wrong: ${wrong}`);
    }
    return { checked: rows.length, correct, wrong };
  } finally {
    _running = false;
  }
}
