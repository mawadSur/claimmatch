-- Columns, checks, and RLS added by 0051_claim_profile.sql.
-- Authenticated users read/write only their own claim profile.
-- Anon cannot. lawsuits.claim_action_type accepts the six public values or null.
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

\echo '  1 0051 tables and lawsuits columns'
do $$
begin
  if to_regclass('public.claim_profiles') is null then
    raise exception '0051: claim_profiles table is missing';
  end if;
  if to_regclass('public.claim_profile_addresses') is null then
    raise exception '0051: claim_profile_addresses table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits' and column_name = 'claim_action_type'
  ) then
    raise exception '0051: lawsuits.claim_action_type is missing';
  end if;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000051', 'claim-profile-a@example.test'),
  ('b0000000-0000-4000-8000-000000000051', 'claim-profile-b@example.test')
on conflict (id) do nothing;

\echo '  2 payout and VIN checks'
do $$
begin
  begin
    insert into public.claim_profiles (user_id, payout_preference)
    values ('a0000000-0000-4000-8000-000000000051', 'wire_transfer');
    raise exception '0051: payout check accepted wire_transfer';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.claim_profiles (user_id, vehicle_vin)
    values ('a0000000-0000-4000-8000-000000000051', 'IIIIIIIIIIIIIIIII');
    raise exception '0051: VIN check accepted I';
  exception when check_violation then
    null;
  end;
end $$;

insert into public.claim_profiles (user_id, aliases, payout_preference, vehicle_vin)
values (
  'a0000000-0000-4000-8000-000000000051',
  'Ada Byron',
  'check',
  '1HGCM82633A004352'
);

insert into public.claim_profile_addresses (user_id, kind, line1, city, state, zip)
values (
  'a0000000-0000-4000-8000-000000000051',
  'current',
  '1 Main St',
  'Austin',
  'TX',
  '78701'
);

\echo '  3 a signed-in user reads and writes only their own profile'
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000051';
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000051","role":"authenticated"}';

do $$
begin
  if pg_temp.visible_rows('select * from public.claim_profiles') is distinct from 1 then
    raise exception '0051: owner should see their claim_profiles row';
  end if;
  if pg_temp.rows_changed($q$update public.claim_profiles set aliases = 'Ada' where user_id = 'b0000000-0000-4000-8000-000000000051'$q$) is distinct from 0 then
    raise exception '0051: owner updated someone else''s claim_profiles';
  end if;
end $$;
reset role;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000051';
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000051","role":"authenticated"}';
do $$
begin
  if coalesce(pg_temp.visible_rows('select * from public.claim_profiles'), 0) <> 0 then
    raise exception '0051: other user saw claim_profiles';
  end if;
end $$;
reset role;
commit;

begin;
set local role anon;
do $$
begin
  if pg_temp.visible_rows('select * from public.claim_profiles') is not null then
    raise exception '0051: anon could read claim_profiles';
  end if;
end $$;
reset role;
commit;
