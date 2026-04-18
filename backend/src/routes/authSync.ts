import { Router } from "express";
import { ensureUser } from "../services/coinService.ts";
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

    // Return the full user row
    const user = rawDb.prepare(`
      SELECT id, name, email, avatar, coins, virtual_coin_balance,
             referral_code, is_pro, created_at
      FROM users WHERE id = ?
    `).get(id);

    return res.json({ ok: true, user });
  } catch (err: any) {
    console.error("[auth/sync]", err);
    return res.status(500).json({ ok: false, error: "Sync failed" });
  }
});

export default router;
