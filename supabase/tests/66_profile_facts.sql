-- Columns, type check, and RLS added by 0027_profile_v2.sql.
-- Authenticated users read/write only their own profile_facts.
-- Anon cannot. admin_access_log is service-role only.
\set ON_ERROR_STOP 1

create function pg_temp.visible_rows(query text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n;
exception when insufficient_privilege then
  return null;
end $$;

create function pg_temp.rows_changed(stmt text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return null;
end $$;

\echo '  1 0027 tables and constraints'
do $$
begin
  if to_regclass('public.profile_facts') is null then
    raise exception '0027: profile_facts table is missing';
  end if;
  if to_regclass('public.admin_access_log') is null then
    raise exception '0027: admin_access_log table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits' and column_name = 'tags'
  ) then
    raise exception '0027: lawsuits.tags is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'profile_facts_type_check'
       and conrelid = 'public.profile_facts'::regclass
  ) then
    raise exception '0027: profile_facts_type_check is missing';
  end if;
end $$;

\echo '  2 type check rejects unknown fact types'
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000027', 'profile-facts-a@example.test'),
  ('b0000000-0000-4000-8000-000000000027', 'profile-facts-b@example.test')
on conflict (id) do nothing;

do $$
begin
  begin
    insert into public.profile_facts (user_id, type, value)
    values ('a0000000-0000-4000-8000-000000000027', 'health', 'medication');
    raise exception '0027: type check accepted health';
  exception when check_violation then
    null;
  end;
end $$;

insert into public.profile_facts (id, user_id, type, value, start_date, end_date, source)
values (
  'f0000000-0000-4000-8000-000000000027',
  'a0000000-0000-4000-8000-000000000027',
  'purchase',
  'Toyota',
  '2021-03-01',
  '2021-03-01',
  'test'
);

\echo '  3 a signed-in user reads and writes only their own facts'
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000027';
do $$
declare
  n bigint;
begin
  n := pg_temp.visible_rows($q$select 1 from public.profile_facts
    where user_id = 'a0000000-0000-4000-8000-000000000027'$q$);
  if n is distinct from 1 then
    raise exception '0027: user A should read their own fact, got %', n;
  end if;
  n := pg_temp.visible_rows($q$select 1 from public.profile_facts
    where user_id = 'b0000000-0000-4000-8000-000000000027'$q$);
  if n <> 0 then
    raise exception '0027: user A can read another user''s facts';
  end if;

  n := pg_temp.rows_changed($q$insert into public.profile_facts (user_id, type, value)
    values ('a0000000-0000-4000-8000-000000000027', 'brand', 'Honda')$q$);
  if n is distinct from 1 then
    raise exception '0027: user A should insert their own fact, got %', n;
  end if;
  n := pg_temp.rows_changed($q$insert into public.profile_facts (user_id, type, value)
    values ('b0000000-0000-4000-8000-000000000027', 'brand', 'Ford')$q$);
  if n <> 0 then
    raise exception '0027: user A created a fact for user B';
  end if;
  n := pg_temp.rows_changed($q$update public.profile_facts set value = 'changed'
    where user_id = 'b0000000-0000-4000-8000-000000000027'$q$);
  if n <> 0 then
    raise exception '0027: user A updated user B''s facts';
  end if;
end $$;
reset role;
rollback;

\echo '  4 anon cannot read or write profile_facts or admin_access_log'
begin;
set local role anon;
do $$
declare
  n bigint;
begin
  n := pg_temp.visible_rows('select 1 from public.profile_facts');
  if n <> 0 then
    raise exception '0027: anon can read profile_facts';
  end if;
  n := pg_temp.visible_rows('select 1 from public.admin_access_log');
  if n <> 0 then
    raise exception '0027: anon can read admin_access_log';
  end if;
  n := pg_temp.rows_changed($q$insert into public.profile_facts (user_id, type, value)
    values ('a0000000-0000-4000-8000-000000000027', 'brand', 'x')$q$);
  if n <> 0 then
    raise exception '0027: anon inserted a profile_fact';
  end if;
  n := pg_temp.rows_changed($q$insert into public.admin_access_log (admin_id, action)
    values ('a0000000-0000-4000-8000-000000000027', 'list')$q$);
  if n <> 0 then
    raise exception '0027: anon inserted an admin_access_log row';
  end if;
end $$;
reset role;
rollback;

\echo '  5 authenticated cannot read or write admin_access_log'
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000027';
do $$
declare
  n bigint;
begin
  n := pg_temp.visible_rows('select 1 from public.admin_access_log');
  if n <> 0 then
    raise exception '0027: user A can read admin_access_log';
  end if;
  n := pg_temp.rows_changed($q$insert into public.admin_access_log (admin_id, action)
    values ('a0000000-0000-4000-8000-000000000027', 'reveal')$q$);
  if n <> 0 then
    raise exception '0027: user A inserted an admin_access_log row';
  end if;
end $$;
reset role;
rollback;
