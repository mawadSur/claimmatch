-- Claim deadline reminder send log from 0030.
\set ON_ERROR_STOP 1

\echo '  1 table, kind check, unique (claim_id, kind)'
do $$
begin
  if to_regclass('public.claim_reminder_sends') is null then
    raise exception '0030: claim_reminder_sends is missing';
  end if;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000030', 'reminders-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000030',
  'reminder-test-settlement',
  'Reminder test settlement'
)
on conflict (id) do nothing;

insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status)
values (
  'c0000000-0000-4000-8000-000000000030',
  'a0000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000030',
  'Reminder test settlement',
  'self_file'
)
on conflict (id) do nothing;

insert into public.claim_reminder_sends (user_id, claim_id, lawsuit_id, kind)
values (
  'a0000000-0000-4000-8000-000000000030',
  'c0000000-0000-4000-8000-000000000030',
  '10000000-0000-4000-8000-000000000030',
  '7d'
);

do $$
begin
  begin
    insert into public.claim_reminder_sends (user_id, claim_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000030',
      'c0000000-0000-4000-8000-000000000030',
      'soon'
    );
    raise exception '0030: accepted an unknown reminder kind';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.claim_reminder_sends (user_id, claim_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000030',
      'c0000000-0000-4000-8000-000000000030',
      '7d'
    );
    raise exception '0030: accepted a duplicate claim/kind send';
  exception
    when unique_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot access claim_reminder_sends'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.claim_reminder_sends', 'select')
     or has_table_privilege('anon', 'public.claim_reminder_sends', 'insert') then
    raise exception '0030: anon must not access claim_reminder_sends';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000030';
do $$
begin
  if has_table_privilege('authenticated', 'public.claim_reminder_sends', 'select')
     or has_table_privilege('authenticated', 'public.claim_reminder_sends', 'insert') then
    raise exception '0030: authenticated must not access claim_reminder_sends';
  end if;
end $$;
rollback;

delete from public.claim_reminder_sends
 where claim_id = 'c0000000-0000-4000-8000-000000000030';
delete from public.claims
 where id = 'c0000000-0000-4000-8000-000000000030';
delete from public.lawsuits
 where id = '10000000-0000-4000-8000-000000000030';
