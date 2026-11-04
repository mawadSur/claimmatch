-- ClaimMatch 0027: richer profiles (profile_facts), structured lawsuit tags,
-- and an admin access-audit log for user views.
-- EXPAND ONLY. Do not edit 0026 or earlier.
--
-- Feature flags (default off): PROFILE_V2_ENABLED, MATCH_STORE_ENABLED.
-- This migration only adds tables/columns. It does not change email_opt_in
-- defaults or existing profile rows.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.admin_access_log;
--   drop table if exists public.profile_facts;
--   alter table public.lawsuits drop column if exists tags;

-- ---------------------------------------------------------------------------
-- profile_facts: structured purchases, employers, locations, etc.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_facts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  value       text not null,
  start_date  date,
  end_date    date,
  source      text,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_facts_type_check'
       and conrelid = 'public.profile_facts'::regclass
  ) then
    alter table public.profile_facts
      add constraint profile_facts_type_check
      check (type in ('brand', 'product', 'account', 'employer', 'location', 'purchase'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profile_facts_value_check'
       and conrelid = 'public.profile_facts'::regclass
  ) then
    alter table public.profile_facts
      add constraint profile_facts_value_check
      check (char_length(btrim(value)) > 0 and char_length(value) <= 200);
  end if;
end $$;

comment on table public.profile_facts is
  'User-supplied brands, products, accounts, employers, locations, and purchases used for matching. RLS: own rows only.';

create index if not exists profile_facts_user_idx
  on public.profile_facts (user_id, type);

alter table public.profile_facts enable row level security;

revoke all on table public.profile_facts from public, anon;
grant select, insert, update, delete on table public.profile_facts to authenticated;

drop policy if exists "own profile_facts read" on public.profile_facts;
create policy "own profile_facts read" on public.profile_facts
  for select using (auth.uid() = user_id);

drop policy if exists "own profile_facts insert" on public.profile_facts;
create policy "own profile_facts insert" on public.profile_facts
  for insert with check (auth.uid() = user_id);

drop policy if exists "own profile_facts update" on public.profile_facts;
create policy "own profile_facts update" on public.profile_facts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile_facts delete" on public.profile_facts;
create policy "own profile_facts delete" on public.profile_facts
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Structured tags on lawsuits (extracted during ingest; null/empty = unknown)
-- ---------------------------------------------------------------------------
alter table public.lawsuits
  add column if not exists tags jsonb not null default '{}'::jsonb;

comment on column public.lawsuits.tags is
  'Conservative structured tags: {brands, employers, states, class_period_start, class_period_end}. Empty/omitted when unknown.';

-- ---------------------------------------------------------------------------
-- Admin access audit: every list/detail/reveal of a user is logged.
-- Service-role / admin writes only. No API role may read or write.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_access_log (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references auth.users(id) on delete cascade,
  target_user_id  uuid references auth.users(id) on delete set null,
  action          text not null,
  path            text,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'admin_access_log_action_check'
       and conrelid = 'public.admin_access_log'::regclass
  ) then
    alter table public.admin_access_log
      add constraint admin_access_log_action_check
      check (action in ('list', 'detail', 'reveal'));
  end if;
end $$;

comment on table public.admin_access_log is
  'Audit log of admin views of user records. Contact reveal is logged separately.';

create index if not exists admin_access_log_admin_idx
  on public.admin_access_log (admin_id, created_at desc);

create index if not exists admin_access_log_target_idx
  on public.admin_access_log (target_user_id, created_at desc);

alter table public.admin_access_log enable row level security;

revoke all on table public.admin_access_log from public, anon, authenticated;
