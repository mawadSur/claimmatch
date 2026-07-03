-- ClaimMatch — initial schema
-- Reverse-engineered from the original WordPress "settlement" model and expanded
-- for eligibility matching, scraping provenance, and email notifications.
--
-- Original WP model:
--   post (category "settlement") -> lawsuits
--   post meta: deadline, no_proof_required -> lawsuits.deadline, lawsuits.proof_required
--   grgt_settlement_responses     -> claims
--   grgt_settlement_statuses      -> claims.status (processing/approved/rejected)
--   receipt number (insert_id)    -> claims.receipt_number

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type claim_status as enum ('processing', 'submitted', 'approved', 'rejected', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lawsuit_status as enum ('open', 'closing_soon', 'closed', 'draft');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Sources (scraper provenance)
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  homepage_url text,
  adapter      text not null default 'generic',   -- key into src/lib/scraper/sources
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lawsuits / settlements
-- ---------------------------------------------------------------------------
create table if not exists public.lawsuits (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  summary           text,                              -- short card excerpt
  description       text,                              -- full body (markdown/plain)
  category          text not null default 'General',   -- e.g. Data Breach, Consumer, Auto
  status            lawsuit_status not null default 'open',
  -- Payout / claim facts (from WP card fields)
  typical_payout    text default 'Varies',             -- kept as text: "$50–$500", "Varies"
  payout_min        numeric,
  payout_max        numeric,
  proof_required    boolean not null default false,    -- WP: no_proof_required inverted
  deadline          date,                              -- claim filing deadline
  -- Eligibility: structured criteria the matcher evaluates against a profile.
  -- Example: {"states":["CA","NY"], "purchased_product": true, "date_range":{"from":"2019-01-01","to":"2023-12-31"}}
  eligibility       jsonb not null default '{}'::jsonb,
  eligibility_text  text,                              -- human-readable "Who qualifies"
  -- Provenance
  source_id         uuid references public.sources(id) on delete set null,
  source_url        text,                              -- canonical page to file the claim
  claim_url         text,                              -- official claim form URL
  external_id       text,                              -- id/hash at the source (dedupe)
  hero_image_url    text,
  is_featured       boolean not null default false,    -- WP "AI Matched" featured cards
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists lawsuits_status_idx    on public.lawsuits (status);
create index if not exists lawsuits_category_idx  on public.lawsuits (category);
create index if not exists lawsuits_deadline_idx  on public.lawsuits (deadline);
create index if not exists lawsuits_featured_idx  on public.lawsuits (is_featured);
create index if not exists lawsuits_title_trgm    on public.lawsuits using gin (title gin_trgm_ops);
create unique index if not exists lawsuits_source_external_idx
  on public.lawsuits (source_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users) — holds eligibility attributes for matching
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  full_name        text,
  state            text,                               -- US state code
  zip              text,
  -- Free-form eligibility attributes collected during onboarding, keyed by slug.
  -- Example: {"owns_car": true, "brands": ["Toyota"], "had_data_breach": true}
  attributes       jsonb not null default '{}'::jsonb,
  email_opt_in     boolean not null default true,      -- match-notification emails
  onboarded        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Matches — computed eligibility between a user and a lawsuit
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  lawsuit_id   uuid not null references public.lawsuits(id) on delete cascade,
  score        numeric not null default 0,             -- 0..1 confidence
  reasons      jsonb not null default '[]'::jsonb,      -- ["Lives in CA", "Owns a Toyota"]
  notified_at  timestamptz,                             -- when the match email was sent
  dismissed    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (user_id, lawsuit_id)
);

create index if not exists matches_user_idx on public.matches (user_id);

-- ---------------------------------------------------------------------------
-- Claims — a user's filed response to a lawsuit (WP settlement_responses)
-- ---------------------------------------------------------------------------
create table if not exists public.claims (
  id             uuid primary key default gen_random_uuid(),
  receipt_number bigint generated always as identity,   -- WP receipt number
  user_id        uuid not null references auth.users(id) on delete cascade,
  lawsuit_id     uuid not null references public.lawsuits(id) on delete cascade,
  lawsuit_title  text not null,                          -- denormalized snapshot
  status         claim_status not null default 'processing',
  -- Structured answers used to auto-fill the official claim form.
  form_data      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, lawsuit_id)
);

create index if not exists claims_user_idx on public.claims (user_id);

-- ---------------------------------------------------------------------------
-- Email subscribers (non-authenticated leads / newsletter)
-- ---------------------------------------------------------------------------
create table if not exists public.subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  state        text,
  interests    text[] default '{}',
  confirmed    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists lawsuits_touch on public.lawsuits;
create trigger lawsuits_touch before update on public.lawsuits
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists claims_touch on public.claims;
create trigger claims_touch before update on public.claims
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.lawsuits    enable row level security;
alter table public.sources     enable row level security;
alter table public.profiles    enable row level security;
alter table public.matches     enable row level security;
alter table public.claims      enable row level security;
alter table public.subscribers enable row level security;

-- Lawsuits & sources: publicly readable (the catalog is public marketing content)
drop policy if exists "lawsuits public read" on public.lawsuits;
create policy "lawsuits public read" on public.lawsuits
  for select using (status <> 'draft');

drop policy if exists "sources public read" on public.sources;
create policy "sources public read" on public.sources
  for select using (true);

-- Profiles: a user can see/update only their own row
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- Matches: a user reads/inserts/updates only their own matches
drop policy if exists "own matches read" on public.matches;
create policy "own matches read" on public.matches
  for select using (auth.uid() = user_id);
drop policy if exists "own matches insert" on public.matches;
create policy "own matches insert" on public.matches
  for insert with check (auth.uid() = user_id);
drop policy if exists "own matches update" on public.matches;
create policy "own matches update" on public.matches
  for update using (auth.uid() = user_id);

-- Claims: a user manages only their own claims
drop policy if exists "own claims read" on public.claims;
create policy "own claims read" on public.claims
  for select using (auth.uid() = user_id);
drop policy if exists "own claims insert" on public.claims;
create policy "own claims insert" on public.claims
  for insert with check (auth.uid() = user_id);
drop policy if exists "own claims update" on public.claims;
create policy "own claims update" on public.claims
  for update using (auth.uid() = user_id);

-- Subscribers: anyone may subscribe (insert); no public read
drop policy if exists "anyone subscribe" on public.subscribers;
create policy "anyone subscribe" on public.subscribers
  for insert with check (true);
