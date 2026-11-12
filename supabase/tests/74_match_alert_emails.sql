-- Opt-in match-alert send log and one-click tokens from 0036.
\set ON_ERROR_STOP 1

\echo '  1 tables, unique email+lawsuit, RLS, subscriber unsubscribed_at'
do $$
begin
  if to_regclass('public.match_alert_sends') is null then
    raise exception '0036: match_alert_sends is missing';
  end if;
  if to_regclass('public.match_alert_tokens') is null then
    raise exception '0036: match_alert_tokens is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'subscribers'
       and column_name = 'unsubscribed_at'
  ) then
    raise exception '0036: subscribers.unsubscribed_at is missing';
  end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-4000-8000-000000000036',
  'alert-optin@example.test',
  jsonb_build_object('full_name', 'Alert User', 'email_opt_in', 'true')
)
on conflict (id) do nothing;

insert into auth.users (id, email)
values (
  'a0000000-0000-4000-8000-000000000037',
  'alert-default@example.test'
)
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000036',
  'alert-test-settlement',
  'Alert test settlement'
)
on conflict (id) do nothing;

insert into public.match_alert_sends (email, user_id, lawsuit_id, source)
values (
  'alert-optin@example.test',
  'a0000000-0000-4000-8000-000000000036',
  '10000000-0000-4000-8000-000000000036',
  'profile'
);

insert into public.match_alert_tokens (token_hash, email, lawsuit_id, expires_at)
values (
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'alert-optin@example.test',
  '10000000-0000-4000-8000-000000000036',
  now() + interval '3 days'
);

do $$
declare
  opted boolean;
  defaulted boolean;
begin
  select email_opt_in into opted
    from public.profiles
   where id = 'a0000000-0000-4000-8000-000000000036';
  if opted is not true then
    raise exception '0036: signup email_opt_in true was not stored, got %', opted;
  end if;
  select email_opt_in into defaulted
    from public.profiles
   where id = 'a0000000-0000-4000-8000-000000000037';
  if defaulted is not false then
    raise exception '0036: signup without checkbox should stay opted out, got %', defaulted;
  end if;
end $$;

do $$
begin
  begin
    insert into public.match_alert_sends (email, lawsuit_id, source)
    values (
      'alert-optin@example.test',
      '10000000-0000-4000-8000-000000000036',
      'profile'
    );
    raise exception '0036: accepted a duplicate email+lawsuit send';
  exception
    when unique_violation then
      null;
  end;
  begin
    insert into public.match_alert_sends (email, lawsuit_id, source)
    values (
      'other@example.test',
      '10000000-0000-4000-8000-000000000036',
      'webhook'
    );
    raise exception '0036: accepted an unknown source';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.match_alert_tokens (token_hash, email, lawsuit_id, expires_at)
    values (
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'other@example.test',
      '10000000-0000-4000-8000-000000000036',
      now() + interval '1 day'
    );
    raise exception '0036: accepted a duplicate token_hash';
  exception
    when unique_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot access match-alert tables'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.match_alert_sends', 'select')
     or has_table_privilege('anon', 'public.match_alert_sends', 'insert')
     or has_table_privilege('anon', 'public.match_alert_sends', 'update')
     or has_table_privilege('anon', 'public.match_alert_sends', 'delete')
     or has_table_privilege('anon', 'public.match_alert_tokens', 'select')
     or has_table_privilege('anon', 'public.match_alert_tokens', 'insert')
     or has_table_privilege('anon', 'public.match_alert_tokens', 'update')
     or has_table_privilege('anon', 'public.match_alert_tokens', 'delete') then
    raise exception '0036: anon must not access match-alert tables';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000036';
do $$
begin
  if has_table_privilege('authenticated', 'public.match_alert_sends', 'select')
     or has_table_privilege('authenticated', 'public.match_alert_sends', 'insert')
     or has_table_privilege('authenticated', 'public.match_alert_sends', 'update')
     or has_table_privilege('authenticated', 'public.match_alert_sends', 'delete')
     or has_table_privilege('authenticated', 'public.match_alert_tokens', 'select')
     or has_table_privilege('authenticated', 'public.match_alert_tokens', 'insert')
     or has_table_privilege('authenticated', 'public.match_alert_tokens', 'update')
     or has_table_privilege('authenticated', 'public.match_alert_tokens', 'delete') then
    raise exception '0036: authenticated must not access match-alert tables';
  end if;
end $$;
rollback;

delete from public.match_alert_tokens
 where email = 'alert-optin@example.test';
delete from public.match_alert_sends
 where email = 'alert-optin@example.test';
delete from public.lawsuits
 where id = '10000000-0000-4000-8000-000000000036';
