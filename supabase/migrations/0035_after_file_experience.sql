-- ClaimMatch 0035: after-you-file timeline fields and payout-tracker send log.
-- EXPAND ONLY. Do not edit 0034 or earlier.
--
-- Feature flags (default off):
--   CLAIM_TIMELINE_ENABLED
--   PAYOUT_TRACKER_EMAILS_ENABLED
-- This migration only adds columns and a table. It does not send email and
-- does not invent hearing or payment dates.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.lawsuits drop column if exists final_approval_hearing_at;
--   alter table public.lawsuits drop column if exists payment_timing_text;
--   drop table if exists public.payout_tracker_sends;

alter table public.lawsuits
  add column if not exists final_approval_hearing_at date;

alter table public.lawsuits
  add column if not exists payment_timing_text text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'lawsuits_payment_timing_text_len'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    alter table public.lawsuits
      add constraint lawsuits_payment_timing_text_len
      check (payment_timing_text is null or char_length(payment_timing_text) <= 280);
  end if;
end $$;

comment on column public.lawsuits.final_approval_hearing_at is
  'Listed final-approval hearing date from the settlement record. Null means not announced. Never guessed.';
comment on column public.lawsuits.payment_timing_text is
  'Listed payment-timing sentence from the settlement record. Null means not announced. Never guessed. No fee language.';

create table if not exists public.payout_tracker_sends (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  claim_id     uuid not null references public.claims(id) on delete cascade,
  lawsuit_id   uuid references public.lawsuits(id) on delete set null,
  kind         text not null,
  fingerprint  text not null default '',
  sent_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'payout_tracker_sends_kind_check'
       and conrelid = 'public.payout_tracker_sends'::regclass
  ) then
    alter table public.payout_tracker_sends
      add constraint payout_tracker_sends_kind_check
      check (kind in ('hearing_passed', 'payment_timing'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'payout_tracker_sends_claim_kind_fp_key'
       and conrelid = 'public.payout_tracker_sends'::regclass
  ) then
    alter table public.payout_tracker_sends
      add constraint payout_tracker_sends_claim_kind_fp_key
      unique (claim_id, kind, fingerprint);
  end if;
end $$;

comment on table public.payout_tracker_sends is
  'One row per claim per payout-tracker email after a successful Resend send. hearing_passed is once per claim; payment_timing is once per claim per timing text. Service role only.';

create index if not exists payout_tracker_sends_user_idx
  on public.payout_tracker_sends (user_id, sent_at desc);

alter table public.payout_tracker_sends enable row level security;

revoke all on table public.payout_tracker_sends from public, anon, authenticated;
