-- ClaimMatch 0055: 24-hour did-you-file opens + drip kinds for 24h and trial_will_end.
-- EXPAND ONLY. Do not edit 0054 or earlier.
--
-- Feature flags (default off): DID_YOU_FILE_EMAIL_ENABLED, TRIAL_WILL_END_EMAIL_ENABLED.
-- This migration only adds tables/columns. It does not send email.
--
-- Unapplied to production until an owner applies it. Safe to re-run.
-- Rollback:
--   drop table if exists public.official_form_opens;
--   alter table public.drip_email_sends drop constraint if exists drip_email_sends_kind_check;
--   alter table public.drip_email_sends drop constraint if exists drip_email_sends_kind_claim_check;
--   (then restore 0031 checks); drop indexes/columns added below.

create table if not exists public.official_form_opens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  lawsuit_id uuid not null references public.lawsuits(id) on delete cascade,
  opened_at  timestamptz not null default now(),
  primary key (user_id, lawsuit_id)
);

comment on table public.official_form_opens is
  'First time a signed-in member opened the official claim form for a settlement. Used by the 24-hour did-you-file email. Service role only.';

create index if not exists official_form_opens_opened_at_idx
  on public.official_form_opens (opened_at);

alter table public.official_form_opens enable row level security;

revoke all on table public.official_form_opens from public, anon, authenticated;

alter table public.drip_email_sends
  add column if not exists lawsuit_id uuid references public.lawsuits(id) on delete cascade;

alter table public.drip_email_sends
  add column if not exists stripe_subscription_id text;

alter table public.drip_email_sends
  drop constraint if exists drip_email_sends_kind_check;

alter table public.drip_email_sends
  add constraint drip_email_sends_kind_check
  check (kind in ('incomplete_onboarding', 'did_you_file', 'did_you_file_24h', 'trial_will_end'));

alter table public.drip_email_sends
  drop constraint if exists drip_email_sends_kind_claim_check;

alter table public.drip_email_sends
  add constraint drip_email_sends_kind_claim_check
  check (
    (kind = 'incomplete_onboarding' and claim_id is null and lawsuit_id is null and stripe_subscription_id is null)
    or
    (kind = 'did_you_file' and claim_id is not null and stripe_subscription_id is null)
    or
    (kind = 'did_you_file_24h' and lawsuit_id is not null and stripe_subscription_id is null)
    or
    (kind = 'trial_will_end' and stripe_subscription_id is not null and claim_id is null and lawsuit_id is null)
  );

create unique index if not exists drip_email_sends_did_you_file_24h_key
  on public.drip_email_sends (user_id, lawsuit_id)
  where kind = 'did_you_file_24h' and lawsuit_id is not null;

create unique index if not exists drip_email_sends_trial_will_end_key
  on public.drip_email_sends (stripe_subscription_id)
  where kind = 'trial_will_end' and stripe_subscription_id is not null;

comment on table public.drip_email_sends is
  'One row per drip kind after a successful Resend send. incomplete_onboarding is per user; did_you_file is per claim; did_you_file_24h is per user+lawsuit; trial_will_end is per Stripe subscription. Service role only.';
