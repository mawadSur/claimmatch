-- Catalog tests for 0004 (review default) and 0005 (unpublish fictional rows).
-- Runs after every migration has been applied to an empty database. It builds
-- production's situation (fictional rows published, a user with a claim and a
-- match on one of them, one real row), then re-applies 0005 and checks it.

\set ON_ERROR_STOP 1

-- 0004: a row written without review_status waits for review.
insert into public.lawsuits (slug, title) values ('catalog-test-default', 'Default test');
do $$
begin
  if (select review_status from public.lawsuits where slug = 'catalog-test-default') <> 'pending_review' then
    raise exception '0004: new lawsuits must default to pending_review';
  end if;
end $$;
delete from public.lawsuits where slug = 'catalog-test-default';

-- Production-like state.
insert into public.sources (slug, name, adapter)
values ('sample-aggregator', 'Sample Settlement Aggregator', 'sample-aggregator')
on conflict (slug) do update set enabled = true;
insert into public.sources (slug, name, adapter)
values ('catalog-test-real', 'Real source', 'settlesignal')
on conflict (slug) do nothing;

insert into public.lawsuits (slug, title, review_status, status, is_featured, external_id, source_id) values
  -- a seed row: matched by slug, no external_id
  ('robocall-tcpa-settlement', 'Unwanted Robocall (TCPA) Settlement', 'published', 'open', true, null, null),
  ('healthcare-provider-data-breach-2025', 'Regional Health System Data Breach Settlement', 'published', 'closing_soon', true, null, null),
  -- a sample-adapter row whose slug drifted: matched by external_id
  ('heartburn-renamed', 'Heartburn Medication Impurity Settlement', 'published', 'open', false,
   'sample-aggregator:heartburn-rx-recall-2025', (select id from public.sources where slug = 'sample-aggregator')),
  -- a sample-adapter row matched only by its source
  ('sample-only-by-source', 'Made-up row', 'published', 'open', false,
   'sample-aggregator:something-new', (select id from public.sources where slug = 'sample-aggregator')),
  -- a real row that must not change
  ('catalog-test-real-settlement', 'Real Settlement', 'published', 'open', true,
   'settlesignal:real-1', (select id from public.sources where slug = 'catalog-test-real'));

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000040', 'catalog-test@example.com');
insert into public.claims (user_id, lawsuit_id, lawsuit_title)
select '00000000-0000-4000-8000-000000000040', id, title from public.lawsuits where slug = 'robocall-tcpa-settlement';
insert into public.matches (user_id, lawsuit_id, score)
select '00000000-0000-4000-8000-000000000040', id, 1 from public.lawsuits where slug = 'robocall-tcpa-settlement';

-- Without the D38 confirmation, 0005 refuses and changes nothing.
\echo '40_catalog_fictional: the next ERROR from 0005 is expected (D38 guard).'
\set ON_ERROR_STOP 0
\ir ../migrations/0005_unpublish_fictional.sql
\set ON_ERROR_STOP 1
do $$
begin
  if exists (select 1 from public.lawsuits where review_status = 'rejected') then
    raise exception '0005 changed rows without the D38 confirmation';
  end if;
  if not (select enabled from public.sources where slug = 'sample-aggregator') then
    raise exception '0005 disabled the sample source without the D38 confirmation';
  end if;
end $$;

-- With the confirmation, 0005 unpublishes every fictional row.
set claimmatch.d38_export_done = 'yes';
\ir ../migrations/0005_unpublish_fictional.sql

do $$
declare n int;
begin
  select count(*) into n from public.lawsuits
   where slug in ('robocall-tcpa-settlement', 'healthcare-provider-data-breach-2025',
                  'heartburn-renamed', 'sample-only-by-source')
     and review_status = 'rejected' and status = 'closed' and not is_featured;
  if n <> 4 then
    raise exception '0005 unpublished % of 4 fictional rows', n;
  end if;

  if not exists (select 1 from public.lawsuits where slug = 'catalog-test-real-settlement'
                  and review_status = 'published' and status = 'open' and is_featured) then
    raise exception '0005 changed a real settlement';
  end if;

  -- Never a DELETE: the user's claim and match survive.
  if (select count(*) from public.claims where user_id = '00000000-0000-4000-8000-000000000040') <> 1
     or (select count(*) from public.matches where user_id = '00000000-0000-4000-8000-000000000040') <> 1 then
    raise exception '0005 removed claims or matches';
  end if;

  if (select enabled from public.sources where slug = 'sample-aggregator') then
    raise exception '0005 left the sample-aggregator source enabled';
  end if;
end $$;

-- Idempotent: a second run touches nothing.
create temporary table catalog_test_after_first as
select slug, updated_at from public.lawsuits;
\ir ../migrations/0005_unpublish_fictional.sql
do $$
begin
  if exists (
    select 1 from public.lawsuits l
      join catalog_test_after_first a on a.slug = l.slug
     where l.updated_at <> a.updated_at
  ) then
    raise exception '0005 is not idempotent: a second run rewrote rows';
  end if;
end $$;

-- The anon role (the public site) no longer sees the fictional rows.
set role anon;
do $$
begin
  if exists (select 1 from public.lawsuits where slug in ('robocall-tcpa-settlement', 'heartburn-renamed')) then
    raise exception 'RLS still shows fictional rows to the public';
  end if;
  if not exists (select 1 from public.lawsuits where slug = 'catalog-test-real-settlement') then
    raise exception 'RLS hides the real settlement from the public';
  end if;
end $$;
reset role;

-- Clean up so later test files start from an empty catalog.
delete from auth.users where id = '00000000-0000-4000-8000-000000000040';
delete from public.lawsuits
 where slug in ('robocall-tcpa-settlement', 'healthcare-provider-data-breach-2025', 'heartburn-renamed',
                'sample-only-by-source', 'catalog-test-real-settlement');
delete from public.sources where slug in ('sample-aggregator', 'catalog-test-real');
reset claimmatch.d38_export_done;

\echo '40_catalog_fictional: ok'
