-- Columns, uniqueness, screenshot checks, and RLS added by
-- 0049_self_filed_reports.sql. Authenticated users insert/select/update/delete
-- their own row only. Anon cannot. Admins (is_admin) can read every row.
-- Confirmation screenshots live in a private bucket (skipped on plain
-- PostgreSQL). This file never talks to a real host.
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- 1. Table and constraints exist.
-- ---------------------------------------------------------------------------
\echo '  1 0049 table and constraints'
do $$
begin
  if to_regclass('public.self_filed_reports') is null then
    raise exception '0049: self_filed_reports table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'self_filed_reports'
       and column_name = 'confirmation_storage_path'
  ) then
    raise exception '0049: confirmation_storage_path is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.self_filed_reports'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%user_id%'
       and pg_get_constraintdef(oid) ilike '%lawsuit_id%'
  ) then
    raise exception '0049: unique (user_id, lawsuit_id) is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'self_filed_reports_confirmation_number_len'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    raise exception '0049: confirmation_number length check is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'self_filed_reports_confirmation_mime_check'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    raise exception '0049: confirmation_mime check is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'self_filed_reports_confirmation_bytes_check'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    raise exception '0049: confirmation_bytes check is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Length / mime / uniqueness checks.
-- ---------------------------------------------------------------------------
\echo '  2 length, mime, uniqueness'
insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000049', 'self-filed-a@example.test'),
  ('b0000000-0000-4000-8000-000000000049', 'self-filed-b@example.test'),
  ('c0000000-0000-4000-8000-000000000049', 'self-filed-admin@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values ('10000000-0000-4000-8000-000000000049', 'self-filed-test', 'Self-filed test settlement')
on conflict (id) do nothing;

insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status)
values
  ('c1000000-0000-4000-8000-000000000049', 'a0000000-0000-4000-8000-000000000049',
   '10000000-0000-4000-8000-000000000049', 'Self-filed test settlement', 'self_file'),
  ('c2000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000049',
   '10000000-0000-4000-8000-000000000049', 'Self-filed test settlement', 'self_file')
on conflict (id) do nothing;

insert into public.self_filed_reports (user_id, lawsuit_id, claim_id, confirmation_number)
values (
  'a0000000-0000-4000-8000-000000000049',
  '10000000-0000-4000-8000-000000000049',
  'c1000000-0000-4000-8000-000000000049',
  'ABC-1'
);

do $$
begin
  begin
    update public.self_filed_reports
       set confirmation_number = repeat('x', 65)
     where user_id = 'a0000000-0000-4000-8000-000000000049';
    raise exception '0049: length check accepted 65 characters';
  exception
    when check_violation then
      null;
  end;

  begin
    update public.self_filed_reports
       set confirmation_mime = 'application/octet-stream',
           confirmation_bytes = 12,
           confirmation_storage_path = 'a0000000-0000-4000-8000-000000000049/r/confirmation.bin'
     where user_id = 'a0000000-0000-4000-8000-000000000049';
    raise exception '0049: mime check accepted a non-image/PDF type';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.self_filed_reports (user_id, lawsuit_id, claim_id)
    values (
      'a0000000-0000-4000-8000-000000000049',
      '10000000-0000-4000-8000-000000000049',
      'c1000000-0000-4000-8000-000000000049'
    );
    raise exception '0049: allowed a second row for the same user and settlement';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RLS: own row only; anon denied; cannot insert as someone else;
--    is_admin can read all.
-- ---------------------------------------------------------------------------
\echo '  3 RLS own-row and admin read'
insert into public.profiles (id, email, is_admin)
values ('c0000000-0000-4000-8000-000000000049', 'self-filed-admin@example.test', true)
on conflict (id) do update set is_admin = true;

begin;
set local role anon;
do $$
declare
  n bigint;
begin
  begin
    insert into public.self_filed_reports (user_id, lawsuit_id, claim_id)
    values (
      'a0000000-0000-4000-8000-000000000049',
      '10000000-0000-4000-8000-000000000049',
      'c1000000-0000-4000-8000-000000000049'
    );
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
    when unique_violation then
      n := 1;
  end;
  if n <> 0 then
    raise exception '0049: anon inserted % self_filed_reports row(s)', n;
  end if;
  begin
    if exists (select 1 from public.self_filed_reports) then
      raise exception '0049: anon must not read self_filed_reports';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  if has_table_privilege('anon', 'public.self_filed_reports', 'select')
     or has_table_privilege('anon', 'public.self_filed_reports', 'insert') then
    raise exception '0049: anon still has select or insert on self_filed_reports';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000049';
do $$
declare
  n bigint;
  seen int;
begin
  select count(*) into seen from public.self_filed_reports;
  if seen <> 0 then
    raise exception '0049: authenticated user read % other row(s)', seen;
  end if;

  begin
    insert into public.self_filed_reports (user_id, lawsuit_id, claim_id)
    values (
      'a0000000-0000-4000-8000-000000000049',
      '10000000-0000-4000-8000-000000000049',
      'c1000000-0000-4000-8000-000000000049'
    );
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0049: user inserted a row for someone else';
  end if;

  insert into public.self_filed_reports (user_id, lawsuit_id, claim_id)
  values (
    'b0000000-0000-4000-8000-000000000049',
    '10000000-0000-4000-8000-000000000049',
    'c2000000-0000-4000-8000-000000000049'
  );
  select count(*) into seen from public.self_filed_reports;
  if seen <> 1 then
    raise exception '0049: user should see only their own row, saw %', seen;
  end if;

  begin
    update public.self_filed_reports
       set confirmation_number = 'stolen'
     where user_id = 'a0000000-0000-4000-8000-000000000049';
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0049: user updated % other row(s)', n;
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000049';
do $$
declare
  seen int;
begin
  select count(*) into seen from public.self_filed_reports;
  if seen < 2 then
    raise exception '0049: admin should read every row, saw %', seen;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. Private storage bucket (Supabase only; skipped on plain PostgreSQL).
-- ---------------------------------------------------------------------------
\echo '  4 private confirmation bucket'
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0049: no storage schema here; skipping bucket checks';
    return;
  end if;
  if not exists (select 1 from storage.buckets where id = 'self-filed-confirmations' and public = false) then
    raise exception '0049: self-filed-confirmations bucket missing or public';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'self-filed confirmations: members read own'
       and cmd = 'SELECT'
  ) then
    raise exception '0049: members-read-own storage policy is missing';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (qual ilike '%self-filed-confirmations%' or with_check ilike '%self-filed-confirmations%')
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception '0049: an API role can write the private confirmation bucket';
  end if;
end $$;

delete from public.self_filed_reports
 where user_id in (
   'a0000000-0000-4000-8000-000000000049',
   'b0000000-0000-4000-8000-000000000049',
   'c0000000-0000-4000-8000-000000000049'
 );
delete from public.claims
 where id in (
   'c1000000-0000-4000-8000-000000000049',
   'c2000000-0000-4000-8000-000000000049'
 );
delete from public.lawsuits where id = '10000000-0000-4000-8000-000000000049';
delete from public.profiles where id = 'c0000000-0000-4000-8000-000000000049';
