-- ClaimMatch 0037: verification drafts from official-site checks.
-- EXPAND ONLY. Do not edit 0036 or earlier.
--
-- Feature flag (default off): VERIFY_ASSIST_ENABLED.
-- A cron or admin trigger may fetch a listing's official claim / notice page
-- and store a draft of deadline, claims open/closed, who qualifies, proof,
-- and administrator, each with a short verbatim quote and source URL.
-- Drafts are never shown publicly and never set lawsuits.verified_at.
-- An admin must accept (or Close / Republish + verify) before any catalog write.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.verification_drafts;

create table if not exists public.verification_drafts (
  id                     uuid primary key default gen_random_uuid(),
  lawsuit_id             uuid not null references public.lawsuits (id) on delete cascade,
  source_url             text,
  status                 text not null default 'pending',
  claims_status          text,
  deadline               date,
  eligibility_verified   text,
  proof_verified         text,
  administrator          text,
  evidence               jsonb not null default '{}'::jsonb,
  extractor              text,
  http_status            integer,
  robots_allowed         boolean,
  error                  text,
  created_at             timestamptz not null default now(),
  reviewed_by            uuid references auth.users (id) on delete set null,
  reviewed_at            timestamptz,
  review_notes           text
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'verification_drafts_status_check'
       and conrelid = 'public.verification_drafts'::regclass
  ) then
    alter table public.verification_drafts
      add constraint verification_drafts_status_check
      check (status in ('pending', 'accepted', 'rejected', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'verification_drafts_claims_status_check'
       and conrelid = 'public.verification_drafts'::regclass
  ) then
    alter table public.verification_drafts
      add constraint verification_drafts_claims_status_check
      check (claims_status is null or claims_status in ('open', 'closed', 'unknown'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'verification_drafts_proof_verified_check'
       and conrelid = 'public.verification_drafts'::regclass
  ) then
    alter table public.verification_drafts
      add constraint verification_drafts_proof_verified_check
      check (
        proof_verified is null
        or proof_verified in ('yes', 'no', 'optional', 'unknown')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'verification_drafts_extractor_check'
       and conrelid = 'public.verification_drafts'::regclass
  ) then
    alter table public.verification_drafts
      add constraint verification_drafts_extractor_check
      check (extractor is null or extractor in ('anthropic', 'heuristic'));
  end if;
end $$;

comment on table public.verification_drafts is
  'Admin-only drafts of verified fields from an official-site fetch. Never public. Never auto-stamps lawsuits.verified_at.';

comment on column public.verification_drafts.evidence is
  'Per-field { quote, source_url } objects. Quotes are short verbatim excerpts; the page body is not stored.';

comment on column public.verification_drafts.status is
  'pending until an admin accepts or rejects. failed = fetch/robots/extract error. accepted/rejected are terminal.';

create index if not exists verification_drafts_status_idx
  on public.verification_drafts (status, created_at desc);
create index if not exists verification_drafts_lawsuit_idx
  on public.verification_drafts (lawsuit_id, created_at desc);

-- One pending draft per settlement so a re-run updates the open proposal.
create unique index if not exists verification_drafts_pending_lawsuit_idx
  on public.verification_drafts (lawsuit_id)
  where status = 'pending';

alter table public.verification_drafts enable row level security;

revoke all on table public.verification_drafts from public, anon, authenticated;
