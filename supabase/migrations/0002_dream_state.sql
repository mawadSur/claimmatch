-- ClaimMatch — dream-state expansion
-- Business model: "we recover it for you and take a %". Adds the LLM-extraction
-- review pipeline, a job queue, recovery/fee accounting, notifications,
-- referrals, per-claim e-sign authorization, and an admin role.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type review_status as enum ('draft', 'pending_review', 'published', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('queued', 'running', 'done', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recovery_status as enum ('pending', 'awaiting_payout', 'paid', 'denied');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles: admin flag + notification/contact prefs + referral code
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists sms_opt_in boolean not null default false;
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Lawsuits: extraction provenance + review workflow + admin / value fields
-- ---------------------------------------------------------------------------
-- Add review_status nullable first, backfill from the existing status (so a
-- pre-existing draft doesn't get silently published), then lock down.
alter table public.lawsuits add column if not exists review_status review_status;
update public.lawsuits
  set review_status = case when status = 'draft' then 'draft' else 'published' end
  where review_status is null;
alter table public.lawsuits alter column review_status set default 'published';
alter table public.lawsuits alter column review_status set not null;
alter table public.lawsuits add column if not exists extraction_confidence numeric;      -- 0..1 from the LLM
alter table public.lawsuits add column if not exists administrator text;                 -- settlement admin (JND, Angeion, ...)
alter table public.lawsuits add column if not exists raw_source_text text;               -- text the LLM extracted from
alter table public.lawsuits add column if not exists estimated_value_min numeric;        -- per-claimant estimate low
alter table public.lawsuits add column if not exists estimated_value_max numeric;        -- per-claimant estimate high
alter table public.lawsuits add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.lawsuits add column if not exists reviewed_at timestamptz;

create index if not exists lawsuits_review_status_idx on public.lawsuits (review_status);

-- Public read policy: only published rows are visible to the public. (Replaces
-- the 0001 "status <> draft" policy with a review-aware one.)
drop policy if exists "lawsuits public read" on public.lawsuits;
create policy "lawsuits public read" on public.lawsuits
  for select using (review_status = 'published');

-- ---------------------------------------------------------------------------
-- Claims: per-claim e-sign authorization + filing lifecycle
-- ---------------------------------------------------------------------------
alter table public.claims add column if not exists authorized_at timestamptz;      -- user e-signed the services authorization
alter table public.claims add column if not exists signature_name text;            -- typed legal name
alter table public.claims add column if not exists authorization_ip text;
alter table public.claims add column if not exists filed_at timestamptz;           -- we submitted on their behalf
alter table public.claims add column if not exists estimated_value numeric;        -- snapshot estimate at file time

-- ---------------------------------------------------------------------------
-- Recoveries: money recovered + our take (%)
-- ---------------------------------------------------------------------------
create table if not exists public.recoveries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  claim_id      uuid not null references public.claims(id) on delete cascade,
  gross_amount  numeric not null default 0,     -- total the settlement paid
  fee_pct       numeric not null default 0.15,  -- our contingency take
  fee_amount    numeric generated always as (round(gross_amount * fee_pct, 2)) stored,
  net_amount    numeric generated always as (round(gross_amount * (1 - fee_pct), 2)) stored,
  status        recovery_status not null default 'pending',
  received_at   timestamptz,                    -- when the settlement paid out
  paid_out_at   timestamptz,                    -- when we forwarded net to the user
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (claim_id)
);

create index if not exists recoveries_user_idx on public.recoveries (user_id);

-- ---------------------------------------------------------------------------
-- Jobs: durable queue for scrape → extract → match → notify workers
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,                    -- 'scrape' | 'extract' | 'match' | 'notify'
  payload      jsonb not null default '{}'::jsonb,
  status       job_status not null default 'queued',
  attempts     int not null default 0,
  max_attempts int not null default 3,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jobs_pickup_idx on public.jobs (status, run_after);

-- ---------------------------------------------------------------------------
-- Notifications: what we sent each user (email/SMS/push)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  email       text,
  channel     text not null default 'email',    -- 'email' | 'sms'
  type        text not null,                     -- 'new_matches' | 'welcome' | 'recovery_paid' | ...
  subject     text,
  body        text,
  status      text not null default 'sent',      -- 'sent' | 'failed' | 'skipped'
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id);

-- ---------------------------------------------------------------------------
-- Referrals: viral loop
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references auth.users(id) on delete cascade,
  code           text not null,
  referred_email text,
  referred_user  uuid references auth.users(id) on delete set null,
  status         text not null default 'pending',  -- 'pending' | 'signed_up' | 'rewarded'
  created_at     timestamptz not null default now(),
  unique (referrer_id, referred_email)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers for the new mutable tables
-- ---------------------------------------------------------------------------
drop trigger if exists recoveries_touch on public.recoveries;
create trigger recoveries_touch before update on public.recoveries
  for each row execute function public.touch_updated_at();

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-assign a referral code on new profiles (extends 0001 handle_new_user)
-- ---------------------------------------------------------------------------
-- Generate a referral code that is guaranteed unique (retry on the tiny chance
-- of a collision, so a clash never blocks signup).
create or replace function public.gen_referral_code()
returns text language plpgsql as $$
declare code text;
begin
  loop
    code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    public.gen_referral_code()
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Backfill referral codes for any existing rows (row-by-row for uniqueness).
do $$
declare r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles set referral_code = public.gen_referral_code() where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- is_admin() helper — used by RLS policies and app code
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.recoveries    enable row level security;
alter table public.jobs          enable row level security;
alter table public.notifications enable row level security;
alter table public.referrals     enable row level security;

-- Recoveries: a user reads their own; admins read all. Writes are server-only
-- (service role bypasses RLS), so no insert/update policy is granted.
drop policy if exists "own recoveries read" on public.recoveries;
create policy "own recoveries read" on public.recoveries
  for select using (auth.uid() = user_id or public.is_admin());

-- Jobs: admin read only; workers use the service role.
drop policy if exists "admin jobs read" on public.jobs;
create policy "admin jobs read" on public.jobs
  for select using (public.is_admin());

-- Notifications: a user reads their own; admins read all.
drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications
  for select using (auth.uid() = user_id or public.is_admin());

-- Referrals: a user manages their own.
drop policy if exists "own referrals read" on public.referrals;
create policy "own referrals read" on public.referrals
  for select using (auth.uid() = referrer_id);
drop policy if exists "own referrals insert" on public.referrals;
create policy "own referrals insert" on public.referrals
  for insert with check (auth.uid() = referrer_id);

-- Admins can read/moderate the full lawsuit catalog (incl. non-published rows).
drop policy if exists "admin lawsuits all" on public.lawsuits;
create policy "admin lawsuits all" on public.lawsuits
  for all using (public.is_admin()) with check (public.is_admin());

-- Admins can read every profile (for the admin dashboard).
drop policy if exists "admin profiles read" on public.profiles;
create policy "admin profiles read" on public.profiles
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Column-level privilege lockdown on profiles (CRITICAL)
-- RLS scopes rows, not columns, so the "own profile update" policy would
-- otherwise let a user set their own is_admin = true and take over the admin
-- surface. Remove the blanket UPDATE grant and re-grant only the columns a user
-- may legitimately edit. is_admin / referral_code / referred_by / email / id
-- stay server-only (service role bypasses these grants).
-- ---------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
grant update (full_name, state, zip, attributes, email_opt_in, onboarded, phone, sms_opt_in)
  on public.profiles to authenticated;
