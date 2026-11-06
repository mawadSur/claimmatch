-- Defaults, consent RLS, and grants added by 0028_alerts_privacy.sql.
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

\echo '  1 0028 tables, default, and frequency column'
do $$
declare
  opt_default text;
begin
  if to_regclass('public.consent') is null then
    raise exception '0028: consent table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_frequency'
  ) then
    raise exception '0028: profiles.email_frequency is missing';
  end if;
  select column_default into opt_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_opt_in';
  if opt_default is null or opt_default not ilike '%false%' then
    raise exception '0028: email_opt_in default should be false, got %', opt_default;
  end if;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000028', 'alerts-a@example.test'),
  ('b0000000-0000-4000-8000-000000000028', 'alerts-b@example.test')
on conflict (id) do nothing;

-- Existing opted-in row must stay true after the default change.
insert into public.profiles (id, email, email_opt_in, onboarded)
values ('a0000000-0000-4000-8000-000000000028', 'alerts-a@example.test', true, true)
on conflict (id) do update set email_opt_in = excluded.email_opt_in;

\echo '  2 existing email_opt_in stays true; new inserts default false'
do $$
declare
  existing boolean;
  fresh boolean;
begin
  select email_opt_in into existing
    from public.profiles
   where id = 'a0000000-0000-4000-8000-000000000028';
  if existing is distinct from true then
    raise exception '0028: existing email_opt_in was changed, got %', existing;
  end if;

  insert into public.profiles (id, email)
  values ('b0000000-0000-4000-8000-000000000028', 'alerts-b@example.test')
  on conflict (id) do nothing;

  select email_opt_in into fresh
    from public.profiles
   where id = 'b0000000-0000-4000-8000-000000000028';
  if fresh is distinct from false then
    raise exception '0028: new profile email_opt_in should default false, got %', fresh;
  end if;
end $$;

insert into public.consent (user_id, category, policy_version)
values (
  'a0000000-0000-4000-8000-000000000028',
  'purchase',
  '2026-11-04-draft'
)
on conflict do nothing;

\echo '  3 users read and insert only their own consent'
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000028';
do $$
declare
  n bigint;
begin
  n := pg_temp.visible_rows($q$select 1 from public.consent
    where user_id = 'a0000000-0000-4000-8000-000000000028'$q$);
  if n is distinct from 1 then
    raise exception '0028: user A should read their own consent, got %', n;
  end if;
  n := pg_temp.visible_rows($q$select 1 from public.consent
    where user_id = 'b0000000-0000-4000-8000-000000000028'$q$);
  if n <> 0 then
    raise exception '0028: user A can read another user''s consent';
  end if;

  n := pg_temp.rows_changed($q$insert into public.consent (user_id, category, policy_version)
    values ('a0000000-0000-4000-8000-000000000028', 'employer', '2026-11-04-draft')$q$);
  if n is distinct from 1 then
    raise exception '0028: user A should insert their own consent, got %', n;
  end if;
  n := pg_temp.rows_changed($q$insert into public.consent (user_id, category, policy_version)
    values ('b0000000-0000-4000-8000-000000000028', 'employer', '2026-11-04-draft')$q$);
  if n <> 0 then
    raise exception '0028: user A created consent for user B';
  end if;
end $$;
reset role;
rollback;

\echo '  4 anon cannot read or write consent'
begin;
set local role anon;
do $$
declare
  n bigint;
begin
  n := pg_temp.visible_rows('select 1 from public.consent');
  if n <> 0 then
    raise exception '0028: anon can read consent';
  end if;
  n := pg_temp.rows_changed($q$insert into public.consent (user_id, category, policy_version)
    values ('a0000000-0000-4000-8000-000000000028', 'brand', '2026-11-04-draft')$q$);
  if n <> 0 then
    raise exception '0028: anon inserted consent';
  end if;
end $$;
reset role;
rollback;
