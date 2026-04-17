/**
 * CoinService — virtual coin balance operations for Paper Trading.
 *
 * All coin ops operate on the SQLite `users.virtual_coin_balance` column and
 * append to the `samachar_coins` ledger.  Every function is synchronous
 * (better-sqlite3) so callers can wrap them in transactions if needed.
 */

import rawDb from "../../../pipeline/db.ts";
import { addCoinLedgerEntry } from "../../../pipeline/db.ts";
import type { CoinActionType } from "../../../pipeline/db.ts";
import { STARTING_BALANCE } from "./rewardConfig.ts";

// ─── Balance helpers ──────────────────────────────────────────────────────────

/**
 * Return a user's current virtual coin balance.
 * Returns 0 if the user row doesn't exist yet.
 */
export function getVirtualBalance(userId: string): number {
  const row = rawDb
    .prepare("SELECT virtual_coin_balance FROM users WHERE id = ? LIMIT 1")
    .get(userId) as { virtual_coin_balance: number } | undefined;
  return row?.virtual_coin_balance ?? 0;
}

/**
 * Ensure a user row exists in the local SQLite users table.
 * Call this once per request using data from the Supabase JWT.
 */
export function ensureUser(userId: string, name?: string, email?: string): void {
  const now = Date.now();
  rawDb.prepare(`
    INSERT INTO users (id, email, name, coins, virtual_coin_balance, created_at, updated_at)
    VALUES (@id, @email, @name, 0, ${STARTING_BALANCE}, @now, @now)
    ON CONFLICT(id) DO NOTHING
  `).run({ id: userId, email: email ?? null, name: name ?? null, now });
}

// ─── Add coins ────────────────────────────────────────────────────────────────

/**
 * Credit coins to a user's virtual balance.
 * Returns the new balance after adding.
 * Wrapped in a transaction so balance + ledger entry are always consistent.
 */
export function addCoins(
  userId:     string,
  amount:     number,
  actionType: CoinActionType,
  refId?:     string,
  note?:      string,
): number {
  if (amount <= 0) throw new RangeError("addCoins: amount must be positive");

  return rawDb.transaction((): number => {
    const current = getVirtualBalance(userId);
    const newBalance = current + amount;

    rawDb.prepare(
      "UPDATE users SET virtual_coin_balance = ?, updated_at = ? WHERE id = ?"
    ).run(newBalance, Date.now(), userId);

    addCoinLedgerEntry({
      user_id:       userId,
      action_type:   actionType,
      amount:        amount,
      balance_after: newBalance,
      ref_id:        refId ?? null,
      note:          note ?? null,
      created_at:    Date.now(),
    });

    return newBalance;
  })();
}

// ─── Deduct coins ─────────────────────────────────────────────────────────────

/**
 * Debit coins from a user's virtual balance.
 * Throws `InsufficientCoinsError` if balance is too low.
 * Returns the new balance after deducting.
 */
export class InsufficientCoinsError extends Error {
  readonly required:  number;
  readonly available: number;

  constructor(required: number, available: number) {
    super(`Need ${required} coins but only ${available} available`);
    this.name      = "InsufficientCoinsError";
    this.required  = required;
    this.available = available;
  }
}

export function deductCoins(
  userId:     string,
  amount:     number,
  actionType: CoinActionType,
  refId?:     string,
  note?:      string,
): number {
  if (amount <= 0) throw new RangeError("deductCoins: amount must be positive");

  return rawDb.transaction((): number => {
    const current = getVirtualBalance(userId);
    if (current < amount) throw new InsufficientCoinsError(amount, current);

    const newBalance = current - amount;

    rawDb.prepare(
      "UPDATE users SET virtual_coin_balance = ?, updated_at = ? WHERE id = ?"
    ).run(newBalance, Date.now(), userId);

    addCoinLedgerEntry({
      user_id:       userId,
      action_type:   actionType,
      amount:        -amount,
      balance_after: newBalance,
      ref_id:        refId ?? null,
      note:          note ?? null,
      created_at:    Date.now(),
    });

    return newBalance;
  })();
}
