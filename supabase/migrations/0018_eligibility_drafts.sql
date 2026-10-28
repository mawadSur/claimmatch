-- ClaimMatch 0018: drafted structured eligibility rules awaiting human approve.
-- EXPAND ONLY. Do not edit 0017 or earlier.
--
-- A script may write pending rows from title / description / class definition.
-- Nothing here publishes to lawsuits.eligibility. An admin must approve.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.eligibility_rule_drafts;

create table if not exists public.eligibility_rule_drafts (
  id                uuid primary key default gen_random_uuid(),
  lawsuit_id        uuid not null references public.lawsuits (id) on delete cascade,
  eligibility       jsonb not null default '{}'::jsonb,
  eligibility_text  text,
  source_excerpt    text,
  rationale         jsonb not null default '{}'::jsonb,
  status            text not null default 'pending',
  created_at        timestamptz not null default now(),
  reviewed_by       uuid references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  review_notes      text
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'eligibility_rule_drafts_status_check'
       and conrelid = 'public.eligibility_rule_drafts'::regclass
  ) then
    alter table public.eligibility_rule_drafts
      add constraint eligibility_rule_drafts_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

comment on table public.eligibility_rule_drafts is
  'Proposed structured eligibility rules. status starts pending. Never auto-published onto lawsuits.eligibility.';

create index if not exists eligibility_rule_drafts_status_idx
  on public.eligibility_rule_drafts (status, created_at desc);
create index if not exists eligibility_rule_drafts_lawsuit_idx
  on public.eligibility_rule_drafts (lawsuit_id);

-- One pending draft per settlement so a re-run updates the open proposal.
create unique index if not exists eligibility_rule_drafts_pending_lawsuit_idx
  on public.eligibility_rule_drafts (lawsuit_id)
  where status = 'pending';

alter table public.eligibility_rule_drafts enable row level security;

revoke all on table public.eligibility_rule_drafts from public, anon, authenticated;
