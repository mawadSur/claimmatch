-- ClaimMatch 0015: assisted filing (stage 2).
-- EXPAND ONLY. Do not edit 0014 or earlier.
--
-- Adds a per-settlement allowlist and the tables that record a per-claim
-- authorization plus the filing job queue. The app never queues a job unless
-- ASSISTED_FILING_ENABLED=1 and lawsuits.assisted_filing_allowed is true.
-- Default for both is off / false.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback (not recommended once authorizations exist):
--   drop table if exists public.filing_jobs;
--   drop table if exists public.claim_authorizations;
--   alter table public.lawsuits drop column if exists assisted_filing_allowed;

alter table public.lawsuits
  add column if not exists assisted_filing_allowed boolean not null default false;

comment on column public.lawsuits.assisted_filing_allowed is
  'When true and ASSISTED_FILING_ENABLED=1, an authorized user may queue an assisted filing job for this settlement. Default false.';

create table if not exists public.claim_authorizations (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  lawsuit_id    uuid not null references public.lawsuits (id) on delete cascade,
  text_version  text not null,
  full_text     text not null,
  signed_at     timestamptz not null default now(),
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  unique (claim_id)
);

comment on table public.claim_authorizations is
  'Per-claim e-sign authorization and attestation. Stores the full text version, timestamp, IP and user agent.';
comment on column public.claim_authorizations.text_version is
  'Stable version key of the authorization text the user signed (e.g. v1).';
comment on column public.claim_authorizations.full_text is
  'Exact authorization and attestation text shown at sign time.';

create index if not exists claim_authorizations_user_idx
  on public.claim_authorizations (user_id);
create index if not exists claim_authorizations_lawsuit_idx
  on public.claim_authorizations (lawsuit_id);

create table if not exists public.filing_jobs (
  id                      uuid primary key default gen_random_uuid(),
  claim_id                uuid not null references public.claims (id) on delete cascade,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  lawsuit_id              uuid not null references public.lawsuits (id) on delete cascade,
  authorization_id        uuid references public.claim_authorizations (id) on delete restrict,
  status                  text not null default 'queued',
  needs_user_reason       text,
  administrator_claim_id  text,
  screenshot_url          text,
  error                   text,
  attempts                integer not null default 0,
  max_attempts            integer not null default 3,
  run_after               timestamptz not null default now(),
  started_at              timestamptz,
  finished_at             timestamptz,
  result                  jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'filing_jobs_status_check'
       and conrelid = 'public.filing_jobs'::regclass
  ) then
    alter table public.filing_jobs
      add constraint filing_jobs_status_check
      check (status in ('queued', 'needs_user', 'submitted', 'confirmed', 'failed'));
  end if;
end $$;

comment on table public.filing_jobs is
  'Assisted-filing job queue. Statuses: queued, needs_user (captcha or missing info), submitted, confirmed, failed.';
comment on column public.filing_jobs.administrator_claim_id is
  'Confirmation / claim id returned by the administrator after a successful submit.';
comment on column public.filing_jobs.screenshot_url is
  'Stored confirmation screenshot URL. Tests and the Playwright stub never take a real one.';

create index if not exists filing_jobs_user_idx on public.filing_jobs (user_id);
create index if not exists filing_jobs_status_idx on public.filing_jobs (status, run_after);
create index if not exists filing_jobs_claim_idx on public.filing_jobs (claim_id);

drop trigger if exists filing_jobs_touch on public.filing_jobs;
create trigger filing_jobs_touch before update on public.filing_jobs
  for each row execute function public.touch_updated_at();

alter table public.claim_authorizations enable row level security;
alter table public.filing_jobs enable row level security;

drop policy if exists "own claim_authorizations read" on public.claim_authorizations;
create policy "own claim_authorizations read" on public.claim_authorizations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own claim_authorizations insert" on public.claim_authorizations;
create policy "own claim_authorizations insert" on public.claim_authorizations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own filing_jobs read" on public.filing_jobs;
create policy "own filing_jobs read" on public.filing_jobs
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.claim_authorizations from public, anon;
grant select, insert on table public.claim_authorizations to authenticated;
revoke update, delete, truncate on table public.claim_authorizations from authenticated;

revoke all on table public.filing_jobs from public, anon;
grant select on table public.filing_jobs to authenticated;
revoke insert, update, delete, truncate on table public.filing_jobs from authenticated;
