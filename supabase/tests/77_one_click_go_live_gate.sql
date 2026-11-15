-- One-click filing go-live gate (0045): the desk challenge rule and the legal
-- record archive. One transaction, rolled back at the end. Fixture ids end in 77.
\set ON_ERROR_STOP 1
\o /dev/null
begin;

create function pg_temp.expect_error(stmt text, code text) returns void
language plpgsql as $$
declare
  got text;
begin
  begin
    execute stmt;
    got := 'no error';
  exception when others then
    got := sqlstate;
  end;
  if got is distinct from code then
    raise exception 'expected SQLSTATE % but got % from: %', code, got, stmt;
  end if;
end $$;

create function pg_temp.seen(query text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n;
exception when insufficient_privilege then
  return null;
end $$;

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-0000000000e7', 'gate-reviewer@example.test'),
  ('f0000000-0000-4000-8000-0000000000f7', 'gate-agent@example.test');
insert into public.lawsuits (id, slug, title, status, review_status, deadline) values
  ('10000000-0000-4000-8000-000000000077', 'gate-settlement', 'Go-live gate settlement',
   'open'::lawsuit_status, 'published'::review_status, current_date + 60);
insert into public.administrators (id, slug, name) values
  ('20000000-0000-4000-8000-000000000077', 'gate-admin', 'Gate administrator');
insert into public.staff_roles (user_id, role) values ('e0000000-0000-4000-8000-0000000000e7', 'legal_reviewer');
insert into public.staff_roles (user_id, role, granted_by) values
  ('f0000000-0000-4000-8000-0000000000f7', 'filing_agent', 'e0000000-0000-4000-8000-0000000000e7');

\echo '  1 desk challenge rule: stop by default; only a legal_reviewer loosens it; settlements only'
insert into public.filing_controls (lawsuit_id) values ('10000000-0000-4000-8000-000000000077');
do $$
begin
  if (select desk_challenge_mode from public.filing_controls
       where lawsuit_id = '10000000-0000-4000-8000-000000000077') <> 'stop' then
    raise exception 'a new control row must default to stop';
  end if;
end $$;
select pg_temp.expect_error($q$update public.filing_controls set desk_challenge_mode = 'staff_completes_captcha',
  desk_challenge_notes = 'firm approved', desk_challenge_changed_by = 'f0000000-0000-4000-8000-0000000000f7'
  where lawsuit_id = '10000000-0000-4000-8000-000000000077'$q$, 'CM006');
select pg_temp.expect_error($q$update public.filing_controls set desk_challenge_mode = 'staff_completes_captcha',
  desk_challenge_notes = 'firm approved', desk_challenge_changed_by = null
  where lawsuit_id = '10000000-0000-4000-8000-000000000077'$q$, 'CM006');
select pg_temp.expect_error($q$update public.filing_controls set desk_challenge_mode = 'solve_everything',
  desk_challenge_changed_by = 'e0000000-0000-4000-8000-0000000000e7'
  where lawsuit_id = '10000000-0000-4000-8000-000000000077'$q$, '23514');
-- A loosened rule always carries the reviewer's notes.
select pg_temp.expect_error($q$update public.filing_controls set desk_challenge_mode = 'staff_completes_captcha',
  desk_challenge_changed_by = 'e0000000-0000-4000-8000-0000000000e7'
  where lawsuit_id = '10000000-0000-4000-8000-000000000077'$q$, '23514');
update public.filing_controls set desk_challenge_mode = 'staff_completes_captcha',
  desk_challenge_notes = 'Site terms reviewed; staff complete the CAPTCHA themselves.',
  desk_challenge_changed_by = 'e0000000-0000-4000-8000-0000000000e7', desk_challenge_changed_at = now()
  where lawsuit_id = '10000000-0000-4000-8000-000000000077';
-- Unrelated updates by anyone keep working while the rule stays loosened.
update public.filing_controls set kill_switch = true, kill_switch_reason = 'pause',
  kill_switch_changed_by = 'f0000000-0000-4000-8000-0000000000f7'
  where lawsuit_id = '10000000-0000-4000-8000-000000000077';
-- Back to stop: anyone in the console.
update public.filing_controls set desk_challenge_mode = 'stop',
  desk_challenge_changed_by = 'f0000000-0000-4000-8000-0000000000f7'
  where lawsuit_id = '10000000-0000-4000-8000-000000000077';
-- Never on an administrator row, never born loosened without a reviewer.
select pg_temp.expect_error($q$insert into public.filing_controls (administrator_id, desk_challenge_mode,
  desk_challenge_notes, desk_challenge_changed_by) values ('20000000-0000-4000-8000-000000000077',
  'staff_completes_captcha', 'x', 'e0000000-0000-4000-8000-0000000000e7')$q$, '23514');
delete from public.filing_controls where lawsuit_id = '10000000-0000-4000-8000-000000000077';
select pg_temp.expect_error($q$insert into public.filing_controls (lawsuit_id, desk_challenge_mode,
  desk_challenge_notes, desk_challenge_changed_by) values ('10000000-0000-4000-8000-000000000077',
  'staff_completes_captcha', 'x', 'f0000000-0000-4000-8000-0000000000f7')$q$, 'CM006');
insert into public.filing_controls (lawsuit_id, desk_challenge_mode, desk_challenge_notes, desk_challenge_changed_by)
  values ('10000000-0000-4000-8000-000000000077', 'staff_completes_captcha', 'x',
          'e0000000-0000-4000-8000-0000000000e7');

\echo '  2 legal record archive: server-only, never updated, deletable after retention'
insert into public.filing_legal_record_archive (id, deletion_ref, mode, record_kind, source_id, lawsuit_id,
                                                record, record_sha256, retain_until) values
  ('a1000000-0000-4000-8000-000000000077', gen_random_uuid(), 'anonymize_and_retain', 'claim_signature',
   gen_random_uuid(), '10000000-0000-4000-8000-000000000077', '{"packet_hash": "x"}',
   repeat('a', 64), now() + interval '7 years');
select pg_temp.expect_error($q$update public.filing_legal_record_archive set record = '{}'
  where id = 'a1000000-0000-4000-8000-000000000077'$q$, 'CM014');
-- Only the retain mode may keep a file.
select pg_temp.expect_error($q$insert into public.filing_legal_record_archive (deletion_ref, mode, record_kind,
  source_id, record, record_sha256, storage_path, retain_until) values (gen_random_uuid(), 'anonymize_and_retain',
  'filing_evidence', gen_random_uuid(), '{}', repeat('b', 64), 'u/c/evidence/x.png', now() + interval '1 day')$q$, '23514');
select pg_temp.expect_error($q$insert into public.filing_legal_record_archive (deletion_ref, mode, record_kind,
  source_id, record, record_sha256, retain_until) values (gen_random_uuid(), 'delete',
  'claim_signature', gen_random_uuid(), '{}', repeat('b', 64), now() + interval '1 day')$q$, '23514');
-- One archived copy per source record.
select pg_temp.expect_error($q$insert into public.filing_legal_record_archive (deletion_ref, mode, record_kind,
  source_id, record, record_sha256, retain_until)
  select gen_random_uuid(), mode, record_kind, source_id, record, record_sha256, retain_until
    from public.filing_legal_record_archive where id = 'a1000000-0000-4000-8000-000000000077'$q$, '23505');
-- Deleting the account never touches it (no foreign keys).
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.filing_legal_record_archive'::regclass
              and contype = 'f') then
    raise exception 'the archive must have no foreign keys';
  end if;
end $$;

set local role anon;
do $$ begin if pg_temp.seen('select 1 from public.filing_legal_record_archive') is not null then
  raise exception 'anon must not read the archive'; end if; end $$;
reset role;
set local role authenticated;
do $$ begin if pg_temp.seen('select 1 from public.filing_legal_record_archive') is not null then
  raise exception 'members must not read the archive'; end if; end $$;
select pg_temp.expect_error($q$insert into public.filing_legal_record_archive (deletion_ref, mode, record_kind,
  source_id, record, record_sha256, retain_until) values (gen_random_uuid(), 'retain', 'claim_signature',
  gen_random_uuid(), '{}', repeat('c', 64), now() + interval '1 day')$q$, '42501');
reset role;
set local role service_role;
select pg_temp.expect_error($q$truncate public.filing_legal_record_archive$q$, '42501');
delete from public.filing_legal_record_archive where id = 'a1000000-0000-4000-8000-000000000077';
reset role;

rollback;
\o
