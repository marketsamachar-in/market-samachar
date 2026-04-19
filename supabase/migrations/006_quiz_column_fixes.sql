-- Market Samachar — Quiz table fixes
-- Adds missing iq_change column and updates score constraint for 20-question quiz
-- Run in: Supabase Dashboard → SQL Editor

-- ─── 1. Add iq_change column (was inserted by server but never in schema) ──────
alter table public.quiz_attempts
  add column if not exists iq_change integer not null default 0;

-- ─── 2. Update score constraint from 0–5 to 0–20 ─────────────────────────────
alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_score_check;

alter table public.quiz_attempts
  add constraint quiz_attempts_score_check check (score between 0 and 20);

-- ─── 3. Rebuild leaderboard_alltime view to include iq totals ────────────────
create or replace view public.leaderboard_alltime as
  select
    qa.user_id,
    p.name,
    p.avatar,
    p.investor_iq,
    count(*)                  as days_played,
    sum(qa.score)             as total_score,
    sum(qa.coins_earned)      as total_coins,
    sum(qa.iq_change)         as total_iq_gained,
    round(avg(qa.score)::numeric, 2) as avg_score
  from public.quiz_attempts qa
  join public.profiles p on p.id = qa.user_id
  group by qa.user_id, p.name, p.avatar, p.investor_iq;
