-- ClaimMatch 0030: idempotent send log for 7-day and 1-day claim deadline
-- reminders. EXPAND ONLY. Do not edit 0029 or earlier.
--
-- Feature flag (default off): DEADLINE_REMINDERS_ENABLED.
-- This migration only adds a table. It does not send email.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.claim_reminder_sends;

create table if not exists public.claim_reminder_sends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  claim_id    uuid not null references public.claims(id) on delete cascade,
  lawsuit_id  uuid references public.lawsuits(id) on delete set null,
  kind        text not null,
  sent_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'claim_reminder_sends_kind_check'
       and conrelid = 'public.claim_reminder_sends'::regclass
  ) then
    alter table public.claim_reminder_sends
      add constraint claim_reminder_sends_kind_check
      check (kind in ('7d', '1d'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'claim_reminder_sends_claim_kind_key'
       and conrelid = 'public.claim_reminder_sends'::regclass
  ) then
    alter table public.claim_reminder_sends
      add constraint claim_reminder_sends_claim_kind_key
      unique (claim_id, kind);
  end if;
end $$;

comment on table public.claim_reminder_sends is
  'One row per claim per reminder kind after a successful Resend send. Service role only.';

create index if not exists claim_reminder_sends_user_idx
  on public.claim_reminder_sends (user_id, sent_at desc);

alter table public.claim_reminder_sends enable row level security;

revoke all on table public.claim_reminder_sends from public, anon, authenticated;
