-- Market Samachar — Engagement Ecosystem
-- Run in: Supabase Dashboard → SQL Editor
-- Requires: 001_profiles.sql to have been run first
--
-- Adds:
--   • referral_code / referred_by / virtual_coin_balance columns to profiles
--   • samachar_coins  — full coin transaction ledger
--   • virtual_portfolio / virtual_holdings / virtual_orders — paper-trading
--   • stock_price_cache — server-managed price cache (no RLS needed)
--   • daily_predictions / user_predictions — rich prediction market
--   • news_impact_questions / user_news_impact_answers — news MCQ
--   • ipo_predictions / user_ipo_predictions — IPO arena

-- ─── 1. Extend profiles ───────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS virtual_coin_balance INTEGER NOT NULL DEFAULT 1000;

-- Populate referral_code for existing rows (8-char uppercase alphanumeric)
UPDATE public.profiles
SET referral_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Enforce NOT NULL after back-fill
ALTER TABLE public.profiles ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_idx ON public.profiles (referral_code);
CREATE INDEX        IF NOT EXISTS profiles_referred_by_idx   ON public.profiles (referred_by);

-- ─── 2. samachar_coins (coin transaction ledger) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.samachar_coins (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type   TEXT         NOT NULL,
  -- action_type values:
  --   QUIZ_CORRECT, QUIZ_BONUS, DAILY_STREAK, ADMIN_GRANT, PURCHASE
  --   PREDICTION_VOTE, PREDICTION_CORRECT
  --   NEWS_IMPACT_CORRECT
  --   IPO_PREDICTION, IPO_CORRECT
  --   VIRTUAL_TRADE, PORTFOLIO_PROFIT
  --   REFERRAL
  amount        INTEGER      NOT NULL,     -- positive = earned, negative = spent
  balance_after INTEGER      NOT NULL,     -- running balance after this tx
  ref_id        TEXT,                      -- optional: source row id
  note          TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.samachar_coins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own coin ledger"
  ON public.samachar_coins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can write coin ledger"
  ON public.samachar_coins FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS samachar_coins_user_id_idx    ON public.samachar_coins (user_id);
CREATE INDEX IF NOT EXISTS samachar_coins_action_idx     ON public.samachar_coins (action_type);
CREATE INDEX IF NOT EXISTS samachar_coins_created_at_idx ON public.samachar_coins (created_at DESC);

-- ─── 3. stock_price_cache (server-managed, no per-user RLS) ───────────────────

CREATE TABLE IF NOT EXISTS public.stock_price_cache (
  id             BIGSERIAL   PRIMARY KEY,
  symbol         TEXT        NOT NULL UNIQUE,
  company_name   TEXT        NOT NULL,
  current_price  NUMERIC     NOT NULL,
  change_percent NUMERIC     NOT NULL DEFAULT 0,
  last_updated   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS — public read, service role write only
ALTER TABLE public.stock_price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read stock prices"
  ON public.stock_price_cache FOR SELECT
  USING (true);

CREATE POLICY "Service role can write stock prices"
  ON public.stock_price_cache FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS stock_price_cache_symbol_idx ON public.stock_price_cache (symbol);

-- ─── 4. Virtual Portfolio ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.virtual_portfolio (
  id                    BIGSERIAL    PRIMARY KEY,
  user_id               UUID         NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_invested_coins  INTEGER      NOT NULL DEFAULT 0,
  current_value_coins   INTEGER      NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own portfolio"
  ON public.virtual_portfolio FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages portfolio"
  ON public.virtual_portfolio FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS virtual_portfolio_user_id_idx ON public.virtual_portfolio (user_id);

-- ─── 5. Virtual Holdings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.virtual_holdings (
  id                   BIGSERIAL    PRIMARY KEY,
  user_id              UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol               TEXT         NOT NULL,
  company_name         TEXT         NOT NULL,
  quantity             INTEGER      NOT NULL CHECK (quantity > 0),
  avg_buy_price_coins  NUMERIC      NOT NULL,
  bought_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE public.virtual_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own holdings"
  ON public.virtual_holdings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages holdings"
  ON public.virtual_holdings FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS virtual_holdings_user_id_idx ON public.virtual_holdings (user_id);

-- ─── 6. Virtual Orders ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.virtual_orders (
  id                   BIGSERIAL    PRIMARY KEY,
  user_id              UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol               TEXT         NOT NULL,
  order_type           TEXT         NOT NULL CHECK (order_type IN ('BUY', 'SELL')),
  quantity             INTEGER      NOT NULL CHECK (quantity > 0),
  price_at_execution   NUMERIC      NOT NULL,
  coins_used           INTEGER      NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'EXECUTED' CHECK (status IN ('EXECUTED', 'CANCELLED', 'FAILED')),
  executed_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own orders"
  ON public.virtual_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages orders"
  ON public.virtual_orders FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS virtual_orders_user_id_idx ON public.virtual_orders (user_id);
CREATE INDEX IF NOT EXISTS virtual_orders_symbol_idx  ON public.virtual_orders (symbol);

-- ─── 7. Daily Predictions (admin-authored questions) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_predictions (
  id              BIGSERIAL    PRIMARY KEY,
  question        TEXT         NOT NULL,
  prediction_type TEXT         NOT NULL CHECK (prediction_type IN ('NIFTY_DIRECTION', 'STOCK_DIRECTION', 'CUSTOM')),
  symbol          TEXT,
  correct_answer  TEXT,
  resolves_at     TIMESTAMPTZ  NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read predictions"
  ON public.daily_predictions FOR SELECT
  USING (true);

CREATE POLICY "Service role manages predictions"
  ON public.daily_predictions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS daily_predictions_resolves_at_idx ON public.daily_predictions (resolves_at);

-- ─── 8. User Predictions (user votes) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_predictions (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prediction_id BIGINT       NOT NULL REFERENCES public.daily_predictions(id) ON DELETE CASCADE,
  answer        TEXT         NOT NULL,
  is_correct    BOOLEAN,
  coins_awarded INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, prediction_id)
);

ALTER TABLE public.user_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prediction votes"
  ON public.user_predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prediction votes"
  ON public.user_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages prediction votes"
  ON public.user_predictions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS user_predictions_user_id_idx  ON public.user_predictions (user_id);
CREATE INDEX IF NOT EXISTS user_predictions_pred_id_idx  ON public.user_predictions (prediction_id);

-- ─── 9. News Impact Questions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.news_impact_questions (
  id             BIGSERIAL    PRIMARY KEY,
  article_id     TEXT         NOT NULL,   -- matches news_items.id in SQLite
  question_text  TEXT         NOT NULL,
  option_a       TEXT         NOT NULL,
  option_b       TEXT         NOT NULL,
  option_c       TEXT         NOT NULL,
  option_d       TEXT         NOT NULL,
  correct_option TEXT         NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  symbol         TEXT,
  expires_at     TIMESTAMPTZ  NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.news_impact_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read news impact questions"
  ON public.news_impact_questions FOR SELECT
  USING (true);

CREATE POLICY "Service role manages news impact questions"
  ON public.news_impact_questions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS news_impact_questions_article_idx ON public.news_impact_questions (article_id);
CREATE INDEX IF NOT EXISTS news_impact_questions_expires_idx ON public.news_impact_questions (expires_at);

-- ─── 10. User News Impact Answers ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_news_impact_answers (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id     BIGINT       NOT NULL REFERENCES public.news_impact_questions(id) ON DELETE CASCADE,
  selected_option TEXT         NOT NULL CHECK (selected_option IN ('A', 'B', 'C', 'D')),
  is_correct      BOOLEAN      NOT NULL,
  coins_awarded   INTEGER      NOT NULL DEFAULT 0,
  answered_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

ALTER TABLE public.user_news_impact_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own news impact answers"
  ON public.user_news_impact_answers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own news impact answers"
  ON public.user_news_impact_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages news impact answers"
  ON public.user_news_impact_answers FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS user_news_impact_answers_user_idx ON public.user_news_impact_answers (user_id);
CREATE INDEX IF NOT EXISTS user_news_impact_answers_qid_idx  ON public.user_news_impact_answers (question_id);

-- ─── 11. IPO Predictions (admin-authored) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ipo_predictions (
  id             BIGSERIAL    PRIMARY KEY,
  ipo_name       TEXT         NOT NULL,
  symbol         TEXT,
  open_date      DATE,
  listing_date   DATE,
  question_type  TEXT         NOT NULL CHECK (question_type IN ('GMP', 'SUBSCRIPTION', 'LISTING_PRICE')),
  correct_answer TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.ipo_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read IPO predictions"
  ON public.ipo_predictions FOR SELECT
  USING (true);

CREATE POLICY "Service role manages IPO predictions"
  ON public.ipo_predictions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS ipo_predictions_listing_date_idx ON public.ipo_predictions (listing_date);

-- ─── 12. User IPO Predictions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_ipo_predictions (
  id                BIGSERIAL    PRIMARY KEY,
  user_id           UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ipo_prediction_id BIGINT       NOT NULL REFERENCES public.ipo_predictions(id) ON DELETE CASCADE,
  answer            TEXT         NOT NULL,
  is_correct        BOOLEAN,
  coins_awarded     INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, ipo_prediction_id)
);

ALTER TABLE public.user_ipo_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own IPO predictions"
  ON public.user_ipo_predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own IPO predictions"
  ON public.user_ipo_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages IPO predictions"
  ON public.user_ipo_predictions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS user_ipo_predictions_user_id_idx  ON public.user_ipo_predictions (user_id);
CREATE INDEX IF NOT EXISTS user_ipo_predictions_ipo_pred_idx ON public.user_ipo_predictions (ipo_prediction_id);
