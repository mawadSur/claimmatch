-- ClaimMatch 0019: ingest alert rows for failed or zero-update nightly runs.
-- EXPAND ONLY. Do not edit 0018 or earlier.
--
-- The daily cron writes a row when ingest fails or updates 0 catalog rows.
-- Email via Resend stays off until INGEST_ALERT_EMAILS_ENABLED=1.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.ingest_alerts;

create table if not exists public.ingest_alerts (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  reason      text not null,
  error       text,
  summary     jsonb not null default '{}'::jsonb,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ingest_alerts_reason_check'
       and conrelid = 'public.ingest_alerts'::regclass
  ) then
    alter table public.ingest_alerts
      add constraint ingest_alerts_reason_check
      check (reason in ('failed', 'zero_updates'));
  end if;
end $$;

comment on table public.ingest_alerts is
  'Nightly ingest alerts: failed run or a run that updated 0 rows.';

create index if not exists ingest_alerts_created_idx
  on public.ingest_alerts (created_at desc);

alter table public.ingest_alerts enable row level security;

revoke all on table public.ingest_alerts from public, anon, authenticated;
