-- Lawsuit AI 0046: one-click filing test mode (ONE_CLICK_FILING_TEST_MODE).
-- EXPAND ONLY: adds columns, a guard trigger and one server-only function.
-- Do not edit 0044 or earlier. Safe to re-run.
--
-- In test mode (src/lib/filing/one-click-access.ts) only internal testers can
-- start one-click, and every job they create is a test job:
--   * claim_filing_jobs.is_test marks it. The worker sends a test job's email
--     only to ONE_CLICK_TEST_INBOX, never calls an administrator API for it,
--     and a real bulk export never includes it.
--   * filing_enqueue_test queues a signature exactly as filing_enqueue (0043)
--     and marks the new job in the same transaction, so no worker can take it
--     before it is marked.
--   * A test job stays a test job; a real job can be marked only while it is
--     queued and was never tried.
--   * filing_export_batches.is_test marks a test-mode bulk file.
--
-- Rollback (nothing reads these unless the app's test mode is on):
--   drop function if exists public.filing_enqueue_test(uuid, text, uuid, timestamptz, timestamptz, text, jsonb);
--   drop trigger if exists claim_filing_jobs_test_guard on public.claim_filing_jobs;
--   drop function if exists public.claim_filing_jobs_test_guard();
--   alter table public.claim_filing_jobs drop column if exists is_test;
--   alter table public.filing_export_batches drop column if exists is_test;

alter table public.claim_filing_jobs
  add column if not exists is_test boolean not null default false;
comment on column public.claim_filing_jobs.is_test is
  'Created in one-click test mode (ONE_CLICK_FILING_TEST_MODE): sent only to the test inbox, never to an administrator, never in a real bulk export.';
create index if not exists claim_filing_jobs_test_idx on public.claim_filing_jobs (created_at) where is_test;

alter table public.filing_export_batches
  add column if not exists is_test boolean not null default false;
comment on column public.filing_export_batches.is_test is
  'A bulk file made in one-click test mode: test jobs only, never uploaded to an administrator.';

create or replace function public.claim_filing_jobs_test_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.is_test is distinct from old.is_test then
    if old.is_test then
      raise exception 'a test filing job stays a test job' using errcode = 'CM013';
    end if;
    if old.status <> 'queued' or old.attempt <> 0 then
      raise exception 'only a new queued job can be marked as a test job' using errcode = 'CM013';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists claim_filing_jobs_test_guard on public.claim_filing_jobs;
create trigger claim_filing_jobs_test_guard before update on public.claim_filing_jobs
  for each row execute function public.claim_filing_jobs_test_guard();

-- filing_enqueue (0043), then the new job is marked is_test before anyone can
-- see it. A repeat for the same signature returns that job, which must
-- already be a test job (a real job is never turned into one here).
create or replace function public.filing_enqueue_test(
  p_signature_id uuid,
  p_channel      text,
  p_policy_id    uuid,
  p_due_by       timestamptz,
  p_run_after    timestamptz default null,
  p_actor        text default 'system',
  p_detail       jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
  v_job public.claim_filing_jobs%rowtype;
begin
  v_out := public.filing_enqueue(p_signature_id, p_channel, p_policy_id, p_due_by, p_run_after, p_actor,
                                 coalesce(p_detail, '{}'::jsonb));
  select * into v_job from public.claim_filing_jobs where id = (v_out -> 'job' ->> 'id')::uuid for update;
  if not found then
    raise exception 'the queued job is missing' using errcode = 'P0002';
  end if;
  if coalesce((v_out ->> 'created')::boolean, false) then
    update public.claim_filing_jobs set is_test = true where id = v_job.id returning * into v_job;
  elsif not v_job.is_test then
    raise exception 'this signature already has a real filing job' using errcode = 'CM013';
  end if;
  return jsonb_set(v_out, '{job}', to_jsonb(v_job));
end $$;

revoke all on function public.claim_filing_jobs_test_guard() from public, anon, authenticated;
revoke all on function public.filing_enqueue_test(uuid, text, uuid, timestamptz, timestamptz, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.filing_enqueue_test(uuid, text, uuid, timestamptz, timestamptz, text, jsonb)
  to service_role;
