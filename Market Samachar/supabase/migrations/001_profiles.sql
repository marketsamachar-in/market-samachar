-- Market Samachar — User Profiles
-- Run in: Supabase Dashboard → SQL Editor

-- Enable UUID extension (already enabled on Supabase by default)
create extension if not exists "uuid-ossp";

-- ─── profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  phone           text,
  name            text,
  avatar          text,
  investor_iq     integer not null default 0,
  streak_count    integer not null default 0,
  streak_last_date date,
  coins           integer not null default 0,
  is_pro          boolean not null default false,
  pro_expires_at  timestamptz,
  created_at      timestamptz not null default now()
);

-- Row-Level Security: users can only read/write their own profile
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, name, avatar)
  values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Index for quick pro-status lookups
create index if not exists profiles_is_pro_idx on public.profiles (is_pro);
