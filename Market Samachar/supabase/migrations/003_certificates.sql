-- ── Certificates ──────────────────────────────────────────────────────────────
-- Issued when a user completes a 30-day consecutive quiz streak.

CREATE TABLE IF NOT EXISTS certificates (
  id           TEXT        PRIMARY KEY,          -- MS-2026-XXXXX
  user_id      UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  user_name    TEXT        NOT NULL,
  iq_score     INTEGER     NOT NULL,
  iq_title     TEXT        NOT NULL,
  iq_emoji     TEXT        NOT NULL DEFAULT '📊',
  streak_days  INTEGER     NOT NULL DEFAULT 30,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid     BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Index for public lookup by cert ID (verification page)
CREATE INDEX IF NOT EXISTS certificates_id_idx ON certificates (id);

-- Index for user's own certificates
CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates (user_id);

-- RLS
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Anyone can read a certificate by ID (public verification)
CREATE POLICY "Public read certificates"
  ON certificates FOR SELECT
  USING (TRUE);

-- Users can only see/insert their own
CREATE POLICY "Users insert own certificates"
  ON certificates FOR INSERT
  WITH CHECK (auth.uid() = user_id);
