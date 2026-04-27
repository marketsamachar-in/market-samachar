-- 007_article_polls.sql
-- Per-article sentiment poll (bullish / bearish / neutral). One vote per user per article.

create table if not exists public.article_polls (
  id         uuid primary key default gen_random_uuid(),
  article_id text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  vote       text not null check (vote in ('bullish', 'bearish', 'neutral')),
  created_at timestamptz default now(),
  constraint article_polls_article_user_unique unique (article_id, user_id)
);

create index if not exists article_polls_article_id_idx
  on public.article_polls (article_id);

alter table public.article_polls enable row level security;

-- SELECT: anyone (anon + authenticated) can read vote counts
drop policy if exists "article_polls_select_all" on public.article_polls;
create policy "article_polls_select_all"
  on public.article_polls
  for select
  to anon, authenticated
  using (true);

-- INSERT: authenticated users may only insert their own vote
drop policy if exists "article_polls_insert_own" on public.article_polls;
create policy "article_polls_insert_own"
  on public.article_polls
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE policies -> RLS denies both by default.
