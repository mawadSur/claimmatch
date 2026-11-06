-- ClaimMatch 0031: idempotent send log for onboarding / filing drip emails.
-- EXPAND ONLY. Do not edit 0030 or earlier.
--
-- Feature flag (default off): ONBOARDING_DRIP_ENABLED.
-- This migration only adds a table. It does not send email.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.drip_email_sends;

create table if not exists public.drip_email_sends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  claim_id    uuid references public.claims(id) on delete cascade,
  sent_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'drip_email_sends_kind_check'
       and conrelid = 'public.drip_email_sends'::regclass
  ) then
    alter table public.drip_email_sends
      add constraint drip_email_sends_kind_check
      check (kind in ('incomplete_onboarding', 'did_you_file'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'drip_email_sends_kind_claim_check'
       and conrelid = 'public.drip_email_sends'::regclass
  ) then
    alter table public.drip_email_sends
      add constraint drip_email_sends_kind_claim_check
      check (
        (kind = 'incomplete_onboarding' and claim_id is null)
        or
        (kind = 'did_you_file' and claim_id is not null)
      );
  end if;
end $$;

-- NULL claim_id is not unique under a plain UNIQUE constraint, so incomplete
-- onboarding is one row per user, and "did you file?" is one row per claim.
create unique index if not exists drip_email_sends_incomplete_user_key
  on public.drip_email_sends (user_id)
  where kind = 'incomplete_onboarding';

create unique index if not exists drip_email_sends_did_you_file_claim_key
  on public.drip_email_sends (user_id, claim_id)
  where kind = 'did_you_file' and claim_id is not null;

comment on table public.drip_email_sends is
  'One row per drip kind after a successful Resend send. incomplete_onboarding is per user; did_you_file is per claim. Service role only.';

create index if not exists drip_email_sends_user_idx
  on public.drip_email_sends (user_id, sent_at desc);

alter table public.drip_email_sends enable row level security;

revoke all on table public.drip_email_sends from public, anon, authenticated;
