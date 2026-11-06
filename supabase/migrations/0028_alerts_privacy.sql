-- ClaimMatch 0028: opt-in alerts (new-user default off), email frequency,
-- and a consent log for profile facts.
-- EXPAND ONLY. Do not edit 0027 or earlier.
--
-- Feature flags (default off): MATCH_EMAILS_ENABLED, DIGEST_ENABLED.
-- Per-user opt-in is a second gate. This migration does not change existing
-- profiles.email_opt_in values.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.consent;
--   alter table public.profiles drop column if exists email_frequency;
--   alter table public.profiles alter column email_opt_in set default true;

-- ---------------------------------------------------------------------------
-- New accounts start opted out of marketing/match emails.
-- Existing rows keep whatever they already have.
-- ---------------------------------------------------------------------------
alter table public.profiles
  alter column email_opt_in set default false;

-- ---------------------------------------------------------------------------
-- Frequency: instant (nightly sweep) or weekly (Monday digest).
-- Existing rows stay null and are treated as instant (prior behavior).
-- New rows default to weekly once the person opts in.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email_frequency text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_email_frequency_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_email_frequency_check
      check (email_frequency is null or email_frequency in ('instant', 'weekly'));
  end if;
end $$;

alter table public.profiles
  alter column email_frequency set default 'weekly';

comment on column public.profiles.email_frequency is
  'How often to email new matches: instant (daily sweep) or weekly (digest). Null on older rows is treated as instant.';

grant update (email_frequency) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Consent: recorded when profile facts are collected.
-- ---------------------------------------------------------------------------
create table if not exists public.consent (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category        text not null,
  granted_at      timestamptz not null default now(),
  policy_version  text not null
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'consent_category_check'
       and conrelid = 'public.consent'::regclass
  ) then
    alter table public.consent
      add constraint consent_category_check
      check (category in ('brand', 'product', 'account', 'employer', 'location', 'purchase'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'consent_policy_version_check'
       and conrelid = 'public.consent'::regclass
  ) then
    alter table public.consent
      add constraint consent_policy_version_check
      check (char_length(btrim(policy_version)) > 0 and char_length(policy_version) <= 80);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'consent_user_category_policy_key'
       and conrelid = 'public.consent'::regclass
  ) then
    alter table public.consent
      add constraint consent_user_category_policy_key
      unique (user_id, category, policy_version);
  end if;
end $$;

comment on table public.consent is
  'Per-category consent recorded when a user saves profile facts. RLS: own rows only.';

create index if not exists consent_user_idx
  on public.consent (user_id, granted_at desc);

alter table public.consent enable row level security;

revoke all on table public.consent from public, anon;
grant select, insert on table public.consent to authenticated;

drop policy if exists "own consent read" on public.consent;
create policy "own consent read" on public.consent
  for select using (auth.uid() = user_id);

drop policy if exists "own consent insert" on public.consent;
create policy "own consent insert" on public.consent
  for insert with check (auth.uid() = user_id);
