-- ClaimMatch 0020: soft-launch cohort and internal-user flags.
-- EXPAND ONLY. Do not edit 0019 or earlier.
--
-- profiles.is_internal (default false) marks testers listed in INTERNAL_EMAILS
-- so analytics can exclude them. profiles.cohort is set from a share-link
-- campaign that starts with "soft-" (e.g. soft-1).
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.profiles drop column if exists is_internal;
--   alter table public.profiles drop column if exists cohort;

alter table public.profiles
  add column if not exists is_internal boolean not null default false;

alter table public.profiles
  add column if not exists cohort text;

comment on column public.profiles.is_internal is
  'True when the account email is on INTERNAL_EMAILS. Exclude from traction counts.';
comment on column public.profiles.cohort is
  'First-touch soft-launch tag (share-link campaign starting with soft-). Set once.';

create index if not exists profiles_cohort_idx
  on public.profiles (cohort)
  where cohort is not null;
