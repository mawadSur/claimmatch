-- Owner-apply only. Do not run from CI or this repo's scripts.
-- Do not apply to production from an agent; the owner applies this in the
-- Supabase SQL editor after review.
--
-- Two public backup tables currently have no RLS. Enable RLS with no
-- anon/authenticated policies so only the service role (which bypasses RLS)
-- can read them. IF EXISTS / to_regclass so this is a no-op when a table
-- is not present.
--
-- Rollback (owner only; do not run from CI):
--   alter table if exists public.lawsuits_top20_backup_2026_11 disable row level security;
--   alter table if exists public.owner_apply_eight_easy_submit_backup_20261126 disable row level security;

alter table if exists public.lawsuits_top20_backup_2026_11 enable row level security;
alter table if exists public.owner_apply_eight_easy_submit_backup_20261126 enable row level security;

do $$
begin
  if to_regclass('public.lawsuits_top20_backup_2026_11') is not null then
    execute 'revoke all on table public.lawsuits_top20_backup_2026_11 from anon, authenticated';
  end if;
  if to_regclass('public.owner_apply_eight_easy_submit_backup_20261126') is not null then
    execute 'revoke all on table public.owner_apply_eight_easy_submit_backup_20261126 from anon, authenticated';
  end if;
end $$;
