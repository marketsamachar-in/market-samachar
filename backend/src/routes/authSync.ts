import { Router } from "express";
import { ensureUser, addCoins } from "../services/coinService.ts";
import { FIRST_LOGIN_COINS, DAILY_LOGIN_COINS } from "../services/rewardConfig.ts";
import rawDb from "../../../pipeline/db.ts";

const router = Router();

/**
 * POST /api/auth/sync
 * Called by the frontend on SIGNED_IN to create/update the local SQLite user row.
 * Public route — no Bearer token required (called immediately on auth state change).
 * Body: { id, email, name, avatar }
 */
router.post("/sync", (req, res) => {
  const { id, email, name, avatar } = req.body as {
    id?: string;
    email?: string;
    name?: string;
    avatar?: string;
  };

  if (!id || typeof id !== "string") {
    return res.status(400).json({ ok: false, error: "id is required" });
  }

  try {
    // Detect new vs returning user BEFORE ensureUser creates the row
    const existingUser = rawDb.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).get(id) as { id: string } | undefined;

    const isNewUser = !existingUser;

    // Create user row if it doesn't exist yet (idempotent)
    ensureUser(id, name, email);

    // Update avatar (only if not already set) and generate referral_code if missing
    rawDb.prepare(`
      UPDATE users SET
        avatar = COALESCE(NULLIF(avatar, ''), ?),
        referral_code = CASE
          WHEN referral_code IS NULL
          THEN LOWER(HEX(RANDOMBLOB(4)))
          ELSE referral_code
        END,
        updated_at = ?
      WHERE id = ?
    `).run(avatar ?? null, Date.now(), id);

    // One-time welcome bonus for brand-new users
    if (isNewUser) {
      addCoins(id, FIRST_LOGIN_COINS, 'FIRST_LOGIN', 'welcome',
        '🎉 Welcome to Market Samachar!');
    }

    // Daily login bonus — once per IST calendar day
