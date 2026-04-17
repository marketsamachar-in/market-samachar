-- ── Weekly AI Performance Reports ────────────────────────────────────────────
-- Generated every Sunday 8 PM IST for all active Pro users.

CREATE TABLE IF NOT EXISTS weekly_reports (
  id              TEXT        PRIMARY KEY,    -- "YYYY-WNN-{user_id_prefix8}"
  user_id         UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  week_start      DATE        NOT NULL,       -- Monday YYYY-MM-DD
  week_end        DATE        NOT NULL,       -- Sunday YYYY-MM-DD
  quizzes_taken   INTEGER     NOT NULL DEFAULT 0,
  quizzes_possible INTEGER    NOT NULL DEFAULT 7,
  scores_json     TEXT        NOT NULL DEFAULT '[]',   -- [4,5,3,5,4,3,5]
  accuracy_pct    NUMERIC(5,2)NOT NULL DEFAULT 0,
  iq_start        INTEGER     NOT NULL DEFAULT 300,
  iq_end          INTEGER     NOT NULL DEFAULT 300,
  rank_weekly     INTEGER,                             -- leaderboard rank for the week
  strong_cats     TEXT        NOT NULL DEFAULT '[]',   -- ["indian","companies"]
  weak_cats       TEXT        NOT NULL DEFAULT '[]',
  ai_report       TEXT        NOT NULL DEFAULT '',
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weekly_reports_user_idx ON weekly_reports (user_id, week_end DESC);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own weekly reports"
  ON weekly_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role insert reports"
  ON weekly_reports FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Service role update reports"
  ON weekly_reports FOR UPDATE
  USING (TRUE);
