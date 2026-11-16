-- Lawsuit AI 0047: test-mode packets never become real filings.
-- EXPAND ONLY: adds one column, two guard triggers and a one-time backfill.
-- Do not edit 0046 or earlier. Safe to re-run (the backfill runs only on the
-- run that adds the column).
--
-- 0046 marks the filing jobs made in one-click test mode (is_test). A test
-- packet signed but never queued (queueing failed, or the tester stopped
-- before the job existed) had no mark, so once ONE_CLICK_FILING_ENABLED is
-- on the repair sweep could queue it through the real filing_enqueue. Now:
--   * claim_packets.is_test marks a packet made in test mode (the app sets it
--     on create, src/lib/filing/v2/persist.ts). A test packet stays a test
--     packet; marking one is always allowed (it can only stop a filing).
--   * Every job for a test packet must be a test job. Checked when the
--     transaction commits, because filing_enqueue_test (0046) inserts the job
--     through filing_enqueue and marks it in the same transaction. A real
--     filing_enqueue of a test packet fails (CM013) and nothing is queued.
--   * Backfill: packets that already have a test job, and, on a database
--     where no real (non-test) filing job exists (one-click never went live
--     there, as on production today), every existing packet.
--
-- Rollback (nothing reads the column unless the app is on this version):
--   drop trigger if exists claim_filing_jobs_test_packet on public.claim_filing_jobs;
--   drop function if exists public.claim_filing_jobs_test_packet();
--   drop trigger if exists claim_packets_test_guard on public.claim_packets;
--   drop function if exists public.claim_packets_test_guard();
--   alter table public.claim_packets drop column if exists is_test;

do $$
declare
  v_new boolean := not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'claim_packets' and column_name = 'is_test');
begin
  alter table public.claim_packets add column if not exists is_test boolean not null default false;
  if v_new then
    update public.claim_packets p set is_test = true
     where exists (select 1 from public.claim_filing_jobs j where j.packet_id = p.id and j.is_test)
        or not exists (select 1 from public.claim_filing_jobs j where not j.is_test);
  end if;
end $$;

comment on column public.claim_packets.is_test is
  'Made in one-click test mode (ONE_CLICK_FILING_TEST_MODE): never queued, sent or exported as a real filing, also after one-click goes live.';
create index if not exists claim_packets_test_idx on public.claim_packets (created_at) where is_test;

create or replace function public.claim_packets_test_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.is_test and not new.is_test then
    raise exception 'a test packet stays a test packet' using errcode = 'CM013';
  end if;
  return new;
end $$;

drop trigger if exists claim_packets_test_guard on public.claim_packets;
create trigger claim_packets_test_guard before update of is_test on public.claim_packets
  for each row execute function public.claim_packets_test_guard();

-- Reads the job as it is at commit (not NEW): filing_enqueue_test marks it
-- after the insert, in the same transaction.
create or replace function public.claim_filing_jobs_test_packet()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.claim_filing_jobs j
               join public.claim_packets p on p.id = j.packet_id
              where j.id = new.id and p.is_test and not j.is_test) then
    raise exception 'a test packet is never queued as a real filing' using errcode = 'CM013';
  end if;
  return null;
end $$;

drop trigger if exists claim_filing_jobs_test_packet on public.claim_filing_jobs;
create constraint trigger claim_filing_jobs_test_packet
  after insert or update of is_test on public.claim_filing_jobs
  deferrable initially deferred
  for each row execute function public.claim_filing_jobs_test_packet();

revoke all on function public.claim_packets_test_guard() from public, anon, authenticated;
revoke all on function public.claim_filing_jobs_test_packet() from public, anon, authenticated;
