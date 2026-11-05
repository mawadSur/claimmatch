-- ClaimMatch 0029: held-closure triage (official-site checks) and ingest
-- auto-close audit for past-deadline holds.
-- EXPAND ONLY. Do not edit 0028 or earlier.
--
-- Feature flags (default off): HELD_CLOSURE_TRIAGE_ENABLED,
-- HELD_AUTO_CLOSE_PAST_DEADLINE.
-- This migration only adds a table and widens held_closure_decisions.
-- It does not close any lawsuit.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.held_closure_site_checks;
--   alter table public.held_closure_decisions drop column if exists source;
--   alter table public.held_closure_decisions drop constraint if exists held_closure_decisions_decision_check;
--   alter table public.held_closure_decisions add constraint held_closure_decisions_decision_check
--     check (decision in ('approved', 'dismissed'));

-- ---------------------------------------------------------------------------
-- Official-site probe results for held slugs. Classification only; no body.
-- ---------------------------------------------------------------------------
create table if not exists public.held_closure_site_checks (
  slug          text primary key,
  http_status   integer,
  signal        text not null,
  checked_at    timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'held_closure_site_checks_signal_check'
       and conrelid = 'public.held_closure_site_checks'::regclass
  ) then
    alter table public.held_closure_site_checks
      add constraint held_closure_site_checks_signal_check
      check (signal in ('gone', 'claims_closed', 'still_open', 'timeout', 'error', 'unknown'));
  end if;
end $$;

comment on table public.held_closure_site_checks is
  'Cron-only official-site classification for held closures. Never stores page body. Admin UI reads; never probes from a request.';

create index if not exists held_closure_site_checks_checked_idx
  on public.held_closure_site_checks (checked_at desc);

alter table public.held_closure_site_checks enable row level security;

revoke all on table public.held_closure_site_checks from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ingest may record auto_closed + source when HELD_AUTO_CLOSE_PAST_DEADLINE=1.
-- decided_by stays nullable (system writes use null).
-- ---------------------------------------------------------------------------
alter table public.held_closure_decisions
  add column if not exists source text;

update public.held_closure_decisions
   set source = 'admin'
 where source is null;

alter table public.held_closure_decisions
  alter column source set default 'admin';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'held_closure_decisions_source_check'
       and conrelid = 'public.held_closure_decisions'::regclass
  ) then
    alter table public.held_closure_decisions
      add constraint held_closure_decisions_source_check
      check (source in ('admin', 'auto_past_deadline'));
  end if;
end $$;

alter table public.held_closure_decisions drop constraint if exists held_closure_decisions_decision_check;
alter table public.held_closure_decisions
  add constraint held_closure_decisions_decision_check
  check (decision in ('approved', 'dismissed', 'auto_closed'));

comment on table public.held_closure_decisions is
  'Admin approve/dismiss of ingest held closures, plus ingest auto_closed when the stored deadline is already past and HELD_AUTO_CLOSE_PAST_DEADLINE=1.';

comment on column public.held_closure_decisions.source is
  'Who wrote the row: admin (a person) or auto_past_deadline (ingest flag).';
