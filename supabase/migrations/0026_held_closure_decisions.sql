-- ClaimMatch 0026: held-closure review decisions + ingest warning alerts.
-- EXPAND ONLY. Do not edit 0025 or earlier.
--
-- Admins can approve or dismiss a circuit-breaker held closure. The decision
-- is keyed by slug + change fingerprint so a later, different planned close
-- can reappear. Ingest alerts may now record reason = 'warning'.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.held_closure_decisions;
--   alter table public.ingest_alerts drop constraint if exists ingest_alerts_reason_check;
--   alter table public.ingest_alerts add constraint ingest_alerts_reason_check
--     check (reason in ('failed', 'zero_updates'));

create table if not exists public.held_closure_decisions (
  slug                text primary key,
  decision            text not null,
  decided_by          uuid,
  decided_at          timestamptz not null default now(),
  change_fingerprint  text not null,
  applied_patch       jsonb,
  created_at          timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'held_closure_decisions_decision_check'
       and conrelid = 'public.held_closure_decisions'::regclass
  ) then
    alter table public.held_closure_decisions
      add constraint held_closure_decisions_decision_check
      check (decision in ('approved', 'dismissed'));
  end if;
end $$;

comment on table public.held_closure_decisions is
  'Admin approve/dismiss of ingest circuit-breaker held closures. Never auto-applied.';

create index if not exists held_closure_decisions_decided_idx
  on public.held_closure_decisions (decided_at desc);

alter table public.held_closure_decisions enable row level security;

revoke all on table public.held_closure_decisions from public, anon, authenticated;

-- Widen ingest alert reasons. Drop + add is re-runnable.
alter table public.ingest_alerts drop constraint if exists ingest_alerts_reason_check;
alter table public.ingest_alerts
  add constraint ingest_alerts_reason_check
  check (reason in ('failed', 'zero_updates', 'warning'));

comment on table public.ingest_alerts is
  'Nightly ingest alerts: failed run, warning (held closures only), or 0 updates.';
