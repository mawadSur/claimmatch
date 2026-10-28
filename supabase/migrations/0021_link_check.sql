-- ClaimMatch 0021: official claim-link checker columns.
-- EXPAND ONLY. Do not edit 0020 or earlier.
--
-- Weekly HEAD/GET of published open claim_url values. Never auto-unpublishes.
-- The checker stays off until LINK_CHECK_ENABLED=1.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.lawsuits drop column if exists link_status;
--   alter table public.lawsuits drop column if exists link_http_status;
--   alter table public.lawsuits drop column if exists link_checked_at;

alter table public.lawsuits
  add column if not exists link_status text;

alter table public.lawsuits
  add column if not exists link_http_status integer;

alter table public.lawsuits
  add column if not exists link_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'lawsuits_link_status_check'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    alter table public.lawsuits
      add constraint lawsuits_link_status_check
      check (link_status is null or link_status in ('ok', 'redirect', 'broken', 'timeout', 'error'));
  end if;
end $$;

comment on column public.lawsuits.link_status is
  'Last official-link check: ok, redirect, broken, timeout or error. Null until checked.';
comment on column public.lawsuits.link_checked_at is
  'When the official claim_url was last probed. Never used to unpublish.';

create index if not exists lawsuits_link_status_idx
  on public.lawsuits (link_status)
  where link_status is not null and link_status <> 'ok' and link_status <> 'redirect';
