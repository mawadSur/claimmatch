-- After-you-file timeline columns and payout-tracker send log from 0035.
\set ON_ERROR_STOP 1

\echo '  1 lawsuit hearing/timing columns and payout_tracker_sends table'
do $$
begin
  if to_regclass('public.payout_tracker_sends') is null then
    raise exception '0035: payout_tracker_sends is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'final_approval_hearing_at'
  ) then
    raise exception '0035: lawsuits.final_approval_hearing_at is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'payment_timing_text'
  ) then
    raise exception '0035: lawsuits.payment_timing_text is missing';
  end if;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000035', 'tracker-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title, final_approval_hearing_at, payment_timing_text)
values (
  '10000000-0000-4000-8000-000000000035',
  'tracker-test-settlement',
  'Tracker test settlement',
  '2027-03-15',
  'Checks mailed after final approval'
)
on conflict (id) do nothing;

insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status)
values (
  'c0000000-0000-4000-8000-000000000035',
  'a0000000-0000-4000-8000-000000000035',
  '10000000-0000-4000-8000-000000000035',
  'Tracker test settlement',
  'reported_filed'
)
on conflict (id) do nothing;

insert into public.payout_tracker_sends (user_id, claim_id, lawsuit_id, kind, fingerprint)
values (
  'a0000000-0000-4000-8000-000000000035',
  'c0000000-0000-4000-8000-000000000035',
  '10000000-0000-4000-8000-000000000035',
  'hearing_passed',
  ''
);

do $$
begin
  begin
    insert into public.payout_tracker_sends (user_id, claim_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000035',
      'c0000000-0000-4000-8000-000000000035',
      'soon'
    );
    raise exception '0035: accepted an unknown payout-tracker kind';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.payout_tracker_sends (user_id, claim_id, kind, fingerprint)
    values (
      'a0000000-0000-4000-8000-000000000035',
      'c0000000-0000-4000-8000-000000000035',
      'hearing_passed',
      ''
    );
    raise exception '0035: accepted a duplicate claim/kind/fingerprint send';
  exception
    when unique_violation then
      null;
  end;
  begin
    update public.lawsuits
       set payment_timing_text = repeat('x', 281)
     where id = '10000000-0000-4000-8000-000000000035';
    raise exception '0035: accepted payment_timing_text over 280 characters';
  exception
    when check_violation then
      null;
  end;
end $$;

insert into public.payout_tracker_sends (user_id, claim_id, lawsuit_id, kind, fingerprint)
values (
  'a0000000-0000-4000-8000-000000000035',
  'c0000000-0000-4000-8000-000000000035',
  '10000000-0000-4000-8000-000000000035',
  'payment_timing',
  'Checks mailed after final approval'
);

\echo '  2 API roles cannot access payout_tracker_sends'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.payout_tracker_sends', 'select')
     or has_table_privilege('anon', 'public.payout_tracker_sends', 'insert') then
    raise exception '0035: anon must not access payout_tracker_sends';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000035';
do $$
begin
  if has_table_privilege('authenticated', 'public.payout_tracker_sends', 'select')
     or has_table_privilege('authenticated', 'public.payout_tracker_sends', 'insert') then
    raise exception '0035: authenticated must not access payout_tracker_sends';
  end if;
end $$;
rollback;

delete from public.payout_tracker_sends
 where claim_id = 'c0000000-0000-4000-8000-000000000035';
delete from public.claims
 where id = 'c0000000-0000-4000-8000-000000000035';
delete from public.lawsuits
 where id = '10000000-0000-4000-8000-000000000035';
