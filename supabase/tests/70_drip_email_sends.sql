-- Onboarding / filing drip send log from 0031.
\set ON_ERROR_STOP 1

\echo '  1 table, kind check, unique incomplete-onboarding and did-you-file'
do $$
begin
  if to_regclass('public.drip_email_sends') is null then
    raise exception '0031: drip_email_sends is missing';
  end if;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000031', 'drip-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000031',
  'drip-test-settlement',
  'Drip test settlement'
)
on conflict (id) do nothing;

insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status)
values (
  'c0000000-0000-4000-8000-000000000031',
  'a0000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000031',
  'Drip test settlement',
  'self_file'
)
on conflict (id) do nothing;

insert into public.drip_email_sends (user_id, kind)
values (
  'a0000000-0000-4000-8000-000000000031',
  'incomplete_onboarding'
);

insert into public.drip_email_sends (user_id, kind, claim_id)
values (
  'a0000000-0000-4000-8000-000000000031',
  'did_you_file',
  'c0000000-0000-4000-8000-000000000031'
);

do $$
begin
  begin
    insert into public.drip_email_sends (user_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000031',
      'welcome'
    );
    raise exception '0031: accepted an unknown drip kind';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind, claim_id)
    values (
      'a0000000-0000-4000-8000-000000000031',
      'incomplete_onboarding',
      'c0000000-0000-4000-8000-000000000031'
    );
    raise exception '0031: incomplete_onboarding accepted a claim_id';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000031',
      'did_you_file'
    );
    raise exception '0031: did_you_file accepted a null claim_id';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000031',
      'incomplete_onboarding'
    );
    raise exception '0031: accepted a duplicate incomplete_onboarding send';
  exception
    when unique_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind, claim_id)
    values (
      'a0000000-0000-4000-8000-000000000031',
      'did_you_file',
      'c0000000-0000-4000-8000-000000000031'
    );
    raise exception '0031: accepted a duplicate did_you_file send';
  exception
    when unique_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot access drip_email_sends'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.drip_email_sends', 'select')
     or has_table_privilege('anon', 'public.drip_email_sends', 'insert') then
    raise exception '0031: anon must not access drip_email_sends';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000031';
do $$
begin
  if has_table_privilege('authenticated', 'public.drip_email_sends', 'select')
     or has_table_privilege('authenticated', 'public.drip_email_sends', 'insert') then
    raise exception '0031: authenticated must not access drip_email_sends';
  end if;
end $$;
rollback;

delete from public.drip_email_sends
 where user_id = 'a0000000-0000-4000-8000-000000000031';
delete from public.claims
 where id = 'c0000000-0000-4000-8000-000000000031';
delete from public.lawsuits
 where id = '10000000-0000-4000-8000-000000000031';
