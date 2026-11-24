-- OWNER ONLY. DO NOT RUN.
--
-- Bookkeeping only: insert a supabase_migrations.schema_migrations row for
-- each of 0041–0049 when that migration's distinctive object already exists
-- and that version is not already recorded. This does not apply migrations,
-- does not create objects, and does not touch flags.
--
-- Verified read-only on production 2026-11-25: 0041–0049 objects are present
-- and not recorded (latest recorded is 0036_match_alert_emails).
--
-- 0032_mobile_client_hardening is already applied AND recorded as
-- version 20261110013803 / name 0032_mobile_client_hardening. This script
-- does not insert 0032.
--
-- 0037_verification_drafts is NOT applied and NOT recorded. Do not insert it.
--
-- Exact version timestamps for 0041–0049 are not in this repo. Do not guess.
-- Replace every OWNER_CONFIRM_VERSION_00xx placeholder in the temp table
-- below with the timestamp you confirm (Supabase format, usually
-- YYYYMMDDHHMMSS) before running. The transaction refuses to proceed while
-- any placeholder remains.
--
-- Column shape used here: (version, name), matching how 0032 was recorded.
-- If your project's table has extra NOT NULL columns, add them explicitly
-- rather than inventing values.

begin;

create temporary table _record_one_click_migrations (
  version text not null,
  name text not null,
  present boolean not null
) on commit drop;

insert into _record_one_click_migrations (version, name, present) values
  (
    'OWNER_CONFIRM_VERSION_0041',
    '0041_one_click_filing',
    to_regclass('public.claim_packets') is not null
  ),
  (
    'OWNER_CONFIRM_VERSION_0042',
    '0042_one_click_filing_guards',
    to_regprocedure('public.filing_has_role(uuid, text)') is not null
    or to_regprocedure('public.claims_filing_status_guard()') is not null
  ),
  (
    'OWNER_CONFIRM_VERSION_0043',
    '0043_one_click_filing_functions',
    to_regprocedure(
      'public.filing_enqueue(uuid, text, uuid, timestamp with time zone, timestamp with time zone, text, jsonb)'
    ) is not null
  ),
  (
    'OWNER_CONFIRM_VERSION_0044',
    '0044_one_click_filing_staff',
    to_regprocedure(
      'public.filing_job_claim_next(text, text, text, uuid, integer)'
    ) is not null
  ),
  (
    'OWNER_CONFIRM_VERSION_0045',
    '0045_one_click_go_live_gate',
    to_regclass('public.filing_legal_record_archive') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'filing_controls'
        and column_name = 'desk_challenge_mode'
    )
  ),
  (
    'OWNER_CONFIRM_VERSION_0046',
    '0046_one_click_test_mode',
    to_regprocedure(
      'public.filing_enqueue_test(uuid, text, uuid, timestamp with time zone, timestamp with time zone, text, jsonb)'
    ) is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'claim_filing_jobs'
        and column_name = 'is_test'
    )
  ),
  (
    'OWNER_CONFIRM_VERSION_0047',
    '0047_one_click_test_packets',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'claim_packets'
        and column_name = 'is_test'
    )
  ),
  (
    'OWNER_CONFIRM_VERSION_0048',
    '0048_withdrawn_final',
    to_regprocedure('public.claims_withdrawn_final()') is not null
  ),
  (
    'OWNER_CONFIRM_VERSION_0049',
    '0049_self_filed_reports',
    to_regclass('public.self_filed_reports') is not null
  );

do $guard$
declare
  leftover text;
begin
  select string_agg(name, ', ' order by name) into leftover
    from _record_one_click_migrations
   where version like 'OWNER_CONFIRM%';
  if leftover is not null then
    raise exception
      'OWNER ONLY: replace OWNER_CONFIRM_VERSION_* placeholders (%) with timestamps you confirm. This script will not guess.',
      leftover;
  end if;
end
$guard$;

insert into supabase_migrations.schema_migrations (version, name)
select c.version, c.name
  from _record_one_click_migrations c
 where c.present
   and not exists (
     select 1
       from supabase_migrations.schema_migrations m
      where m.version = c.version
         or m.name = c.name
   );

commit;
