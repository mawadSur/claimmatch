-- Match events, features, labels, and labeled-outcomes view (0017).
\set ON_ERROR_STOP 1

\echo '  1 tables, view, and consent column'
do $$
begin
  if to_regclass('public.match_events') is null
     or to_regclass('public.match_feature_snapshots') is null
     or to_regclass('public.match_labels') is null then
    raise exception '0017: match tables are missing';
  end if;
  if to_regclass('public.match_labeled_outcomes') is null then
    raise exception '0017: match_labeled_outcomes view is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'match_metrics_consent_at'
  ) then
    raise exception '0017: profiles.match_metrics_consent_at is missing';
  end if;
end $$;

insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000017', 'metrics-user@example.test')
on conflict (id) do nothing;
insert into public.lawsuits (id, slug, title, status, review_status, deadline)
values (
  '10000000-0000-4000-8000-000000000018',
  'match-events-published',
  'Match events published',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 30
)
on conflict (id) do nothing;

insert into public.match_events (user_id, lawsuit_id, event_type, score, rank, matched_signals, model_version)
values (
  'a0000000-0000-4000-8000-000000000017',
  '10000000-0000-4000-8000-000000000018',
  'view',
  0.8,
  1,
  '["had_data_breach"]'::jsonb,
  'rule-v1'
);

insert into public.match_labels (user_id, lawsuit_id, label)
values (
  'a0000000-0000-4000-8000-000000000017',
  '10000000-0000-4000-8000-000000000018',
  'filed'
);

\echo '  2 event type check and labeled view'
do $$
declare
  n int;
begin
  begin
    insert into public.match_events (user_id, lawsuit_id, event_type)
    values (
      'a0000000-0000-4000-8000-000000000017',
      '10000000-0000-4000-8000-000000000018',
      'clicked'
    );
    raise exception '0017: accepted an unknown event_type';
  exception
    when check_violation then
      null;
  end;

  select count(*) into n
    from public.match_labeled_outcomes
   where user_id = 'a0000000-0000-4000-8000-000000000017'
     and label = 'filed';
  if n <> 1 then
    raise exception '0017: labeled outcomes view missed the fixture row';
  end if;
end $$;

\echo '  3 RLS own-row only'
insert into auth.users (id, email)
values ('b0000000-0000-4000-8000-000000000017', 'metrics-other@example.test')
on conflict (id) do nothing;

begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.match_events', 'select')
     or has_table_privilege('anon', 'public.match_labels', 'select') then
    raise exception '0017: anon must not read match metrics';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000017';
do $$
declare
  seen int;
begin
  select count(*) into seen from public.match_events;
  if seen <> 0 then
    raise exception '0017: user read another match_event';
  end if;
  insert into public.match_events (user_id, lawsuit_id, event_type)
  values (
    'b0000000-0000-4000-8000-000000000017',
    '10000000-0000-4000-8000-000000000018',
    'impression'
  );
  select count(*) into seen from public.match_events;
  if seen <> 1 then
    raise exception '0017: user should see only their own event, saw %', seen;
  end if;
end $$;
rollback;

delete from public.match_labels where lawsuit_id = '10000000-0000-4000-8000-000000000018';
delete from public.match_events where lawsuit_id = '10000000-0000-4000-8000-000000000018';
delete from public.lawsuits where slug = 'match-events-published';
