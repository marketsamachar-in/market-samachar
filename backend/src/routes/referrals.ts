/**
 * Referral attribution
 *
 *   POST /api/referrals/click       — anon: log a ?ref= click-through
 *     body: { code, articleId?, platform? }
 *
 *   GET  /api/referrals/my-stats    — authed: how many clicks/conversions
 *                                     have this user's shares earned?
 */

import { Router } from "express";
import crypto from "crypto";
import rawDb from "../../../pipeline/db.ts";
import { requireAuth } from "../middleware/auth.ts";
import { ensureUser } from "../services/coinService.ts";

const router = Router();

// ─── POST /click  (PUBLIC) ────────────────────────────────────────────────────
// Lightweight beacon — no auth, no PII storage, just count + bucket by platform.

router.post("/click", (req, res) => {
  try {
    const { code, articleId, platform } = req.body as {
      code?: string; articleId?: string; platform?: string;
    };

    if (!code || typeof code !== "string" || !/^[A-Z0-9_-]{3,32}$/i.test(code)) {
      return res.status(400).json({ ok: false, error: "Invalid referral code" });
    }

    // Crude IP-based hash for dedup (10-min window). Use only first 32 chars.
    const ip       = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
                  || req.ip || "";
    const ipHash   = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);

    // De-dup: same code + same article + same ip within 10 min counts once.
    const tenMinAgo = Date.now() - 10 * 60_000;
    const recent = rawDb.prepare(`
      SELECT id FROM referral_clicks
      WHERE referral_code = ? AND ip_hash = ? AND clicked_at >= ?
        AND COALESCE(article_id, '') = COALESCE(?, '')
      LIMIT 1
    `).get(code, ipHash, tenMinAgo, articleId ?? null);

    if (recent) {
      return res.json({ ok: true, deduped: true });
    }

    rawDb.prepare(`
      INSERT INTO referral_clicks (referral_code, article_id, platform, clicked_at, ip_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      code.toUpperCase(),
      articleId ?? null,
      platform ?? null,
      Date.now(),
      ipHash,
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[/api/referrals/click] error:", err);
    res.status(500).json({ ok: false, error: "Click logging failed" });
  }
});

// ─── GET /my-stats  (auth) ────────────────────────────────────────────────────

router.get("/my-stats", requireAuth, (req, res) => {
  try {
    const user = req.user!;
    ensureUser(user.id, user.name, user.email);

    const userRow = rawDb.prepare(
      "SELECT referral_code FROM users WHERE id = ? LIMIT 1"
    ).get(user.id) as { referral_code: string | null } | undefined;

    const code = userRow?.referral_code;
    if (!code) {
      return res.json({ ok: true, code: null, totalClicks: 0, todayClicks: 0, byPlatform: {} });
    }

    const istNowMs   = Date.now() + 5.5 * 60 * 60 * 1000;
    const istMid     = new Date(istNowMs); istMid.setUTCHours(0, 0, 0, 0);
    const dayStart   = istMid.getTime() - 5.5 * 60 * 60 * 1000;

    const total = rawDb.prepare(
      "SELECT COUNT(*) AS c FROM referral_clicks WHERE referral_code = ?"
    ).get(code) as { c: number };

    const today = rawDb.prepare(
      "SELECT COUNT(*) AS c FROM referral_clicks WHERE referral_code = ? AND clicked_at >= ?"
    ).get(code, dayStart) as { c: number };

    const byPlat = rawDb.prepare(`
      SELECT COALESCE(platform, 'other') AS p, COUNT(*) AS c
      FROM referral_clicks WHERE referral_code = ?
      GROUP BY platform
    `).all(code) as Array<{ p: string; c: number }>;

    const byPlatform: Record<string, number> = {};
    for (const row of byPlat) byPlatform[row.p] = row.c;

    res.json({
      ok:           true,
      code,
      totalClicks:  total.c,
      todayClicks:  today.c,
      byPlatform,
    });
  } catch (err) {
    console.error("[/api/referrals/my-stats] error:", err);
    res.status(500).json({ ok: false, error: "Failed to load stats" });
  }
});

export default router;
