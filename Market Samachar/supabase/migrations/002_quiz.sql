-- Market Samachar — Bazaar Brain Quiz Tables
-- Run in: Supabase Dashboard → SQL Editor
-- Requires: 001_profiles.sql to have been run first

-- ─── quiz_questions ───────────────────────────────────────────────────────────
-- Mirrors the server-side SQLite cache — useful for querying via Supabase Studio.
-- The authoritative store is SQLite on the server; this is a sync copy.
create table if not exists public.quiz_questions (
  id             uuid primary key default uuid_generate_v4(),
  date           date not null unique,        -- IST date (YYYY-MM-DD)
  questions_json jsonb not null,              -- array of QuizQuestion objects
  created_at     timestamptz not null default now()
);

-- Only admins/service role can write; anyone can read today's questions
alter table public.quiz_questions enable row level security;

create policy "Anyone can read quiz questions"
  on public.quiz_questions for select
  using (true);

create policy "Service role can write quiz questions"
  on public.quiz_questions for all
  using (auth.role() = 'service_role');

-- ─── quiz_attempts ────────────────────────────────────────────────────────────
create table if not exists public.quiz_attempts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  date            date not null,              -- IST date of the quiz
  score           integer not null check (score between 0 and 5),
  time_taken_secs integer not null check (time_taken_secs > 0),
  answers_json    jsonb not null,             -- [{ question_id, selected_index, correct }]
  coins_earned    integer not null default 0,
  created_at      timestamptz not null default now(),

  -- One attempt per user per day
  unique (user_id, date)
);

alter table public.quiz_attempts enable row level security;

-- Users can read their own attempts
create policy "Users can read own attempts"
  on public.quiz_attempts for select
  using (auth.uid() = user_id);

-- Service role inserts on behalf of users (server validates + writes)
create policy "Service role can insert attempts"
  on public.quiz_attempts for insert
  with check (auth.role() = 'service_role');

-- ─── Leaderboard view ─────────────────────────────────────────────────────────
-- Pre-computes per-user totals for fast leaderboard queries.
create or replace view public.leaderboard_alltime as
  select
    qa.user_id,
    p.name,
    p.avatar,
    p.investor_iq,
    count(*)            as days_played,
    sum(qa.score)       as total_score,
    sum(qa.coins_earned) as total_coins,
    round(avg(qa.score)::numeric, 2) as avg_score
  from public.quiz_attempts qa
  join public.profiles p on p.id = qa.user_id
  group by qa.user_id, p.name, p.avatar, p.investor_iq;

-- Indexes for fast leaderboard queries
create index if not exists quiz_attempts_date_idx      on public.quiz_attempts (date);
create index if not exists quiz_attempts_user_date_idx on public.quiz_attempts (user_id, date);
create index if not exists quiz_attempts_score_idx     on public.quiz_attempts (score desc);
