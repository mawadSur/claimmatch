-- Row-level security basics for the two roles the Supabase API hands out:
-- anon (the public anon key) and authenticated (a signed-in user's JWT).
-- scripts/db-test.sh runs this file after applying every migration. A failed
-- check raises an exception, and ON_ERROR_STOP ends the run at that check.
--
-- Each test is one transaction: load the fixtures as the superuser (which
-- bypasses RLS), switch to an API role, check, roll back. A signed-in user is
-- impersonated with
--   set local role authenticated; set local request.jwt.claim.sub = '<uuid>';
--
-- "Cannot read" and "cannot change" checks also pass when a later migration
-- revokes the privilege outright (SQLSTATE 42501), so moving writes to the
-- server keeps them green. The positive checks (anon reads published
-- lawsuits; a user reads their own profile and claims) must keep passing.
--
-- Fixture ids:
--   user A                  a0000000-0000-4000-8000-00000000000a
--   user B                  b0000000-0000-4000-8000-00000000000b
--   published lawsuits      10000000-0000-4000-8000-000000000001 and ...002
--   unpublished lawsuits    10000000-0000-4000-8000-000000000003 (draft),
--                           ...004 (pending_review), ...005 (rejected)
--   A's claim, B's claim    c0000000-0000-4000-8000-00000000000a and ...00b
--   B's second claim        c0000000-0000-4000-8000-0000000000b2, on the draft
--                           lawsuit ...003 and without a recovery, so a probe
--                           that inserts a recovery for it cannot hit the
--                           one-recovery-per-claim key
--   source of every lawsuit 20000000-0000-4000-8000-000000000001
-- All matches and the claims ...00a and ...00b are on lawsuit ...001; ...002
-- has none. Every lawsuit has an official claim_url and the source a
-- homepage_url, so a test can prove that no API role can point people at
-- another site. Users A and B each have a recovery, a notification and an
-- event on their claim ...00a or ...00b in claim_events (added by 0006).

-- ---------------------------------------------------------------------------
-- Helpers (in pg_temp, so they disappear when this psql session ends)
-- ---------------------------------------------------------------------------

-- How many rows of a query the current role can see; null when the role has
-- no privilege to run it at all.
create function pg_temp.visible_rows(query text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n;
exception when insufficient_privilege then
  return null;
end $$;

-- Runs one INSERT, UPDATE or DELETE as the current role and returns how many
-- rows it changed, or null when the role was refused outright (no privilege,
-- or a new row failed a policy check). Any other error propagates.
create function pg_temp.rows_changed(stmt text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return null;
end $$;

-- Every public table must be in one of these lists (test 1 checks), so a
-- new table cannot ship without deciding which API writes it allows and
-- adding probes for it.
--   user_tables       rows a signed-in user owns and may change through the
--                     API; tests 4 to 6 check them row by row.
--   protected_tables  the catalog, the server-only tables (including the
--                     share_links and share_link_clicks attribution tables,
--                     admin/service-role only), referrals and subscribers. Tests 3 and 5 try to write them as anon and
--                     as a signed-in user and prove that nothing changed.
--   tables_tested_elsewhere  covered by another file in supabase/tests
--                     (proof_feedback: 54_proof_feedback.sql).
create function pg_temp.user_tables() returns text[]
language sql immutable as $$ select array['profiles', 'claims', 'matches'] $$;

create function pg_temp.protected_tables() returns text[]
language sql immutable as $$
  select array['lawsuits', 'sources', 'jobs', 'notifications', 'recoveries',
               'referrals', 'subscribers', 'claim_events',
               'share_links', 'share_link_clicks',
               'administrators', 'administrator_form_mappings',
               'eligibility_rule_drafts', 'ingest_alerts',
               'account_deletion_audit']
$$;

create function pg_temp.tables_tested_elsewhere() returns text[]
language sql immutable as $$
  select array['proof_feedback', 'claim_authorizations', 'filing_jobs',
               'match_events', 'match_feature_snapshots', 'match_labels']
$$;

-- For each protected table, the row count and an md5 of every row, read as
-- the superuser. A test saves it before switching to an API role and compares
-- it after switching back, so a write that slipped past a policy is caught
-- even when the statement that made it was expected to be refused.
create function pg_temp.protected_tables_fingerprint() returns jsonb
language plpgsql as $$
declare
  t text;
  h text;
  fp jsonb := '{}';
begin
  foreach t in array pg_temp.protected_tables() loop
    execute format(
      'select count(*) || '' row(s), md5 '' || coalesce(md5(string_agg(x::text, '','' order by x::text)), ''-'')
         from public.%I x', t)
      into h;
    fp := fp || jsonb_build_object(t, h);
  end loop;
  return fp;
end $$;

create procedure pg_temp.save_protected_tables()
language plpgsql as $$
begin
  perform set_config('rls_test.protected', pg_temp.protected_tables_fingerprint()::text, true);
end $$;

-- Run as the superuser after an API role has tried its writes.
create procedure pg_temp.assert_protected_tables_unchanged(who text)
language plpgsql as $$
declare
  before jsonb := current_setting('rls_test.protected')::jsonb;
  after jsonb := pg_temp.protected_tables_fingerprint();
  t text;
begin
  for t in select jsonb_object_keys(before) loop
    if before -> t is distinct from after -> t then
      raise exception '% changed public.% (before: %, after: %)',
        who, t, before ->> t, after ->> t;
    end if;
  end loop;
end $$;

create procedure pg_temp.load_fixtures()
language plpgsql as $$
declare
  t text;
begin
  -- Each auth.users row fires the signup trigger that creates the profile.
  insert into auth.users (id, email) values
    ('a0000000-0000-4000-8000-00000000000a', 'rls-user-a@example.test'),
    ('b0000000-0000-4000-8000-00000000000b', 'rls-user-b@example.test');

  -- Every lawsuit is open with a future deadline; only review_status differs.
  insert into public.lawsuits (id, slug, title, status, review_status, deadline) values
    ('10000000-0000-4000-8000-000000000001', 'rls-test-published-1', 'RLS test: published 1',
      'open'::lawsuit_status, 'published'::review_status, current_date + 30),
    ('10000000-0000-4000-8000-000000000002', 'rls-test-published-2', 'RLS test: published 2',
      'open'::lawsuit_status, 'published'::review_status, current_date + 60),
    ('10000000-0000-4000-8000-000000000003', 'rls-test-draft', 'RLS test: draft',
      'open'::lawsuit_status, 'draft'::review_status, current_date + 30),
    ('10000000-0000-4000-8000-000000000004', 'rls-test-pending-review', 'RLS test: pending review',
      'open'::lawsuit_status, 'pending_review'::review_status, current_date + 30),
    ('10000000-0000-4000-8000-000000000005', 'rls-test-rejected', 'RLS test: rejected',
      'open'::lawsuit_status, 'rejected'::review_status, current_date + 30);

  insert into public.sources (id, slug, name, homepage_url) values
    ('20000000-0000-4000-8000-000000000001', 'rls-test-source', 'RLS test source',
      'https://source.example.test/');
  update public.lawsuits
     set source_id = '20000000-0000-4000-8000-000000000001',
         claim_url = 'https://official.example.test/' || slug
   where slug like 'rls-test-%';

  insert into public.claims (id, user_id, lawsuit_id, lawsuit_title) values
    ('c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a',
      '10000000-0000-4000-8000-000000000001', 'RLS test: claim of user A'),
    ('c0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b',
      '10000000-0000-4000-8000-000000000001', 'RLS test: claim of user B'),
    ('c0000000-0000-4000-8000-0000000000b2', 'b0000000-0000-4000-8000-00000000000b',
      '10000000-0000-4000-8000-000000000003', 'RLS test: second claim of user B');

  insert into public.matches (user_id, lawsuit_id) values
    ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001'),
    ('b0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001');

  insert into public.subscribers (email) values ('rls-subscriber@example.test');
  insert into public.notifications (user_id, email, type) values
    ('a0000000-0000-4000-8000-00000000000a', 'rls-user-a@example.test', 'welcome'),
    ('b0000000-0000-4000-8000-00000000000b', 'rls-user-b@example.test', 'welcome');
  insert into public.referrals (referrer_id, code) values
    ('b0000000-0000-4000-8000-00000000000b', 'rls-test-code');
  insert into public.recoveries (user_id, claim_id) values
    ('a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a'),
    ('b0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b');
  insert into public.jobs (type) values ('match');
  -- Attribution tables (0011): admin / service-role only.
  insert into public.share_links (id, code, destination, label) values
    ('30000000-0000-4000-8000-000000000001', 'rls-test-share', '/', 'RLS test share link');
  insert into public.share_link_clicks (code) values ('rls-test-share');
  -- The claim_events_set_user trigger copies the claim's user onto the event.
  insert into public.claim_events (claim_id, user_id, to_status, actor) values
    ('c0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'self_file', 'user'),
    ('c0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', 'self_file', 'user');

  -- Fixtures must exist, or "sees 0 rows" would only mean "the table is empty".
  if (select count(*) from public.profiles
      where id in ('a0000000-0000-4000-8000-00000000000a',
                   'b0000000-0000-4000-8000-00000000000b')) <> 2 then
    raise exception 'fixtures: the signup trigger did not create both profiles';
  end if;
  foreach t in array array['claims', 'matches', 'subscribers', 'notifications',
                           'referrals', 'recoveries', 'jobs', 'sources',
                           'claim_events', 'share_links', 'share_link_clicks'] loop
    if pg_temp.visible_rows(format('select 1 from public.%I', t)) = 0 then
      raise exception 'fixtures: public.% has no rows', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Every public table has RLS on, and no public view lets the API roles
--    around it. Supabase gives anon and authenticated full privileges on new
--    tables by default, so a table without RLS, or a view that runs with its
--    owner's rights, is open to anyone holding the anon key.
-- ---------------------------------------------------------------------------
\echo '  1 every public table has RLS on and write checks; no public view bypasses RLS'
begin;
do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if bad is not null then
    raise exception 'RLS is off for public table(s): %', bad;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not c.relname = any (pg_temp.user_tables() || pg_temp.protected_tables()
                             || pg_temp.tables_tested_elsewhere());
  if bad is not null then
    raise exception 'public table(s) % have no RLS write checks: add each to a list in pg_temp.user_tables(), pg_temp.protected_tables() or pg_temp.tables_tested_elsewhere() in this file, with probes', bad;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('v', 'm')
    and (has_table_privilege('anon', c.oid, 'select')
         or has_table_privilege('authenticated', c.oid, 'select'))
    and not exists (
      select 1 from unnest(c.reloptions) o
      where o ~* '^security_invoker=(true|on|yes|1)$');
  if bad is not null then
    raise exception 'public view(s) % bypass RLS for anon or authenticated: create them with (security_invoker = true) or revoke select', bad;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 2. anon reads published lawsuits and nothing unpublished.
-- ---------------------------------------------------------------------------
\echo '  2 anon reads published lawsuits only'
begin;
call pg_temp.load_fixtures();
set local role anon;
do $$
declare
  seen text[];
begin
  select coalesce(array_agg(slug order by slug), '{}') into seen
  from public.lawsuits
  where slug like 'rls-test-%';
  if seen is distinct from array['rls-test-published-1', 'rls-test-published-2'] then
    raise exception 'anon should see exactly the 2 published fixture lawsuits, saw %', seen;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 3. anon reads no private rows and changes none.
-- ---------------------------------------------------------------------------
\echo '  3 anon reads and changes no private rows, and writes no catalog or server-only table'
begin;
call pg_temp.load_fixtures();
call pg_temp.save_protected_tables();
set local role anon;
do $$
declare
  t text;
  stmt text;
  n bigint;
begin
  foreach t in array array['claims', 'profiles', 'subscribers', 'matches',
                           'notifications', 'referrals', 'recoveries', 'jobs',
                           'claim_events', 'share_links', 'share_link_clicks'] loop
    n := pg_temp.visible_rows(format('select 1 from public.%I', t));
    if n <> 0 then
      raise exception 'anon can read % row(s) of public.%', n, t;
    end if;
  end loop;

  foreach stmt in array array[
    $q$insert into public.claims (user_id, lawsuit_id, lawsuit_title)
       values ('a0000000-0000-4000-8000-00000000000a',
               '10000000-0000-4000-8000-000000000002', 'inserted by anon')$q$,
    $q$update public.claims set lawsuit_title = 'changed by anon'$q$,
    $q$delete from public.claims$q$,
    $q$update public.profiles set full_name = 'changed by anon'$q$,
    $q$delete from public.profiles$q$,
    $q$insert into public.matches (user_id, lawsuit_id)
       values ('a0000000-0000-4000-8000-00000000000a',
               '10000000-0000-4000-8000-000000000002')$q$,
    $q$update public.matches set dismissed = true$q$,
    $q$delete from public.matches$q$,
    $q$update public.subscribers set confirmed = true$q$,
    $q$delete from public.subscribers$q$,
    -- The catalog: an open write here would let anyone point every visitor's
    -- "official site" link at a look-alike.
    $q$insert into public.lawsuits (slug, title, review_status)
       values ('rls-test-by-anon', 'inserted by anon', 'published')$q$,
    $q$update public.lawsuits set claim_url = 'https://evil.example'
       where slug = 'rls-test-published-1'$q$,
    $q$update public.lawsuits set claim_url = 'https://evil.example'$q$,
    $q$delete from public.lawsuits where slug = 'rls-test-published-2'$q$,
    $q$delete from public.lawsuits$q$,
    $q$insert into public.sources (slug, name, homepage_url)
       values ('rls-test-by-anon', 'inserted by anon', 'https://evil.example')$q$,
    $q$update public.sources set homepage_url = 'https://evil.example'$q$,
    $q$delete from public.sources$q$,
    -- Server-only tables.
    $q$insert into public.jobs (type) values ('inserted by anon')$q$,
    $q$update public.jobs set error = 'changed by anon'$q$,
    $q$delete from public.jobs$q$,
    $q$insert into public.notifications (user_id, email, type)
       values ('a0000000-0000-4000-8000-00000000000a', 'rls-user-a@example.test', 'inserted by anon')$q$,
    $q$update public.notifications set subject = 'changed by anon'$q$,
    $q$delete from public.notifications$q$,
    $q$insert into public.recoveries (user_id, claim_id)
       values ('a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-0000000000b2')$q$,
    $q$update public.recoveries set gross_amount = 1000$q$,
    $q$delete from public.recoveries$q$,
    $q$insert into public.referrals (referrer_id, code)
       values ('b0000000-0000-4000-8000-00000000000b', 'x')$q$,
    $q$update public.referrals set code = 'changed by anon'$q$,
    $q$delete from public.referrals$q$,
    $q$insert into public.claim_events (claim_id, user_id, to_status, actor)
       values ('c0000000-0000-4000-8000-00000000000a',
               'a0000000-0000-4000-8000-00000000000a', 'submitted', 'user')$q$,
    $q$update public.claim_events set to_status = 'submitted'$q$,
    $q$delete from public.claim_events$q$,
    -- Attribution tables: admin / service-role only.
    $q$insert into public.share_links (code, destination, label)
       values ('rls-test-by-anon', 'https://evil.example', 'inserted by anon')$q$,
    $q$update public.share_links set destination = 'https://evil.example'$q$,
    $q$delete from public.share_links$q$,
    $q$insert into public.share_link_clicks (code) values ('rls-test-by-anon')$q$,
    $q$update public.share_link_clicks set code = 'changed by anon'$q$,
    $q$delete from public.share_link_clicks$q$
  ] loop
    n := pg_temp.rows_changed(stmt);
    if n <> 0 then
      raise exception 'anon changed % row(s) with: %', n, stmt;
    end if;
  end loop;
end $$;
reset role;
call pg_temp.assert_protected_tables_unchanged('anon');
rollback;

-- ---------------------------------------------------------------------------
-- 4. A signed-in user reads their own profile, claims and matches, nobody
--    else's private rows, and only published lawsuits.
-- ---------------------------------------------------------------------------
\echo '  4 a signed-in user reads only their own rows'
begin;
call pg_temp.load_fixtures();
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
declare
  me constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  r record;
  t text;
  n bigint;
  seen text[];
begin
  n := pg_temp.visible_rows(format('select 1 from public.profiles where id = %L', me));
  if n is distinct from 1 then
    raise exception 'user A should read their own profile, got % row(s)', n;
  end if;
  n := pg_temp.visible_rows(format('select 1 from public.claims where user_id = %L', me));
  if n is distinct from 1 then
    raise exception 'user A should read their own claim, got % row(s)', n;
  end if;
  -- While D50 is in force nothing on screen reads matches, so a later
  -- migration may revoke SELECT on them (n is null then). A role that can
  -- read matches must see its own.
  n := pg_temp.visible_rows(format('select 1 from public.matches where user_id = %L', me));
  if n is not null and n <> 1 then
    raise exception 'user A should read their own match, got % row(s)', n;
  end if;

  for r in
    select * from (values
      ('profiles', 'id'),
      ('claims', 'user_id'),
      ('matches', 'user_id'),
      ('notifications', 'user_id'),
      ('referrals', 'referrer_id'),
      ('recoveries', 'user_id'),
      ('claim_events', 'user_id')
    ) v(tbl, owner_col)
  loop
    n := pg_temp.visible_rows(format(
      'select 1 from public.%I where %I is distinct from %L', r.tbl, r.owner_col, me));
    if n <> 0 then
      raise exception 'user A can read % row(s) of public.% that belong to someone else',
        n, r.tbl;
    end if;
  end loop;

  foreach t in array array['subscribers', 'jobs', 'share_links', 'share_link_clicks'] loop
    n := pg_temp.visible_rows(format('select 1 from public.%I', t));
    if n <> 0 then
      raise exception 'user A can read % row(s) of public.%', n, t;
    end if;
  end loop;

  select coalesce(array_agg(slug order by slug), '{}') into seen
  from public.lawsuits
  where slug like 'rls-test-%';
  if seen is distinct from array['rls-test-published-1', 'rls-test-published-2'] then
    raise exception 'user A should see exactly the 2 published fixture lawsuits, saw %', seen;
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 5. A signed-in user cannot change, delete or create another user's claims,
--    matches or profile, and writes no catalog or server-only table.
-- ---------------------------------------------------------------------------
\echo '  5 a signed-in user cannot change another user''s rows or any catalog or server-only table'
begin;
call pg_temp.load_fixtures();
call pg_temp.save_protected_tables();
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
declare
  stmt text;
  n bigint;
begin
  -- Aimed at user B's rows: must change nothing.
  foreach stmt in array array[
    $q$update public.claims set lawsuit_title = 'changed by A', form_data = '{"by": "A"}'
       where id = 'c0000000-0000-4000-8000-00000000000b'$q$,
    $q$delete from public.claims where id = 'c0000000-0000-4000-8000-00000000000b'$q$,
    $q$insert into public.claims (user_id, lawsuit_id, lawsuit_title)
       values ('b0000000-0000-4000-8000-00000000000b',
               '10000000-0000-4000-8000-000000000002', 'created by A')$q$,
    $q$update public.claims set user_id = 'b0000000-0000-4000-8000-00000000000b'
       where id = 'c0000000-0000-4000-8000-00000000000a'$q$,
    $q$update public.matches set dismissed = true
       where user_id = 'b0000000-0000-4000-8000-00000000000b'$q$,
    $q$insert into public.matches (user_id, lawsuit_id)
       values ('b0000000-0000-4000-8000-00000000000b',
               '10000000-0000-4000-8000-000000000002')$q$,
    $q$update public.profiles set full_name = 'changed by A'
       where id = 'b0000000-0000-4000-8000-00000000000b'$q$,
    $q$delete from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b'$q$,
    $q$insert into public.referrals (referrer_id, code)
       values ('b0000000-0000-4000-8000-00000000000b', 'x')$q$,
    -- The catalog and the server-only tables: not even user A's own rows.
    $q$insert into public.lawsuits (slug, title, review_status)
       values ('rls-test-by-a', 'inserted by A', 'published')$q$,
    $q$update public.lawsuits set claim_url = 'https://evil.example'
       where slug = 'rls-test-published-1'$q$,
    $q$update public.lawsuits set claim_url = 'https://evil.example'$q$,
    $q$delete from public.lawsuits where slug = 'rls-test-published-2'$q$,
    $q$delete from public.lawsuits$q$,
    $q$insert into public.sources (slug, name, homepage_url)
       values ('rls-test-by-a', 'inserted by A', 'https://evil.example')$q$,
    $q$update public.sources set homepage_url = 'https://evil.example'$q$,
    $q$delete from public.sources$q$,
    $q$insert into public.jobs (type) values ('inserted by A')$q$,
    $q$update public.jobs set error = 'changed by A'$q$,
    $q$delete from public.jobs$q$,
    $q$insert into public.notifications (user_id, email, type)
       values ('a0000000-0000-4000-8000-00000000000a', 'rls-user-a@example.test', 'inserted by A')$q$,
    $q$update public.notifications set subject = 'changed by A'$q$,
    $q$delete from public.notifications$q$,
    $q$insert into public.recoveries (user_id, claim_id)
       values ('a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-0000000000b2')$q$,
    $q$update public.recoveries set gross_amount = 1000$q$,
    $q$delete from public.recoveries$q$,
    $q$update public.referrals set code = 'changed by A'$q$,
    $q$delete from public.referrals$q$,
    $q$insert into public.claim_events (claim_id, user_id, to_status, actor)
       values ('c0000000-0000-4000-8000-00000000000a',
               'a0000000-0000-4000-8000-00000000000a', 'submitted', 'user')$q$,
    $q$update public.claim_events set to_status = 'submitted'$q$,
    $q$delete from public.claim_events$q$,
    $q$insert into public.share_links (code, destination, label)
       values ('rls-test-by-a', 'https://evil.example', 'inserted by A')$q$,
    $q$update public.share_links set destination = 'https://evil.example'$q$,
    $q$delete from public.share_links$q$,
    $q$insert into public.share_link_clicks (code) values ('rls-test-by-a')$q$,
    $q$update public.share_link_clicks set code = 'changed by A'$q$,
    $q$delete from public.share_link_clicks$q$
  ] loop
    n := pg_temp.rows_changed(stmt);
    if n <> 0 then
      raise exception 'user A changed % row(s) with: %', n, stmt;
    end if;
  end loop;

  -- With no WHERE clause, Postgres applies only the UPDATE or DELETE policy
  -- (no SELECT policy), so these may change user A's own rows; the check
  -- below confirms they reached none of user B's. The two transfers move
  -- user A's claim and match to user B on the unused lawsuit (so they cannot
  -- hit the unique key); only the UPDATE policy's WITH CHECK can refuse them,
  -- and the check below catches one that lets them through.
  foreach stmt in array array[
    $q$update public.claims set lawsuit_title = 'changed by A', form_data = '{"by": "A"}'$q$,
    $q$update public.matches set dismissed = true$q$,
    $q$update public.profiles set full_name = 'changed by A'$q$,
    $q$update public.claims set user_id = 'b0000000-0000-4000-8000-00000000000b',
                                lawsuit_id = '10000000-0000-4000-8000-000000000002'$q$,
    $q$update public.matches set user_id = 'b0000000-0000-4000-8000-00000000000b',
                                 lawsuit_id = '10000000-0000-4000-8000-000000000002'$q$,
    $q$delete from public.claims$q$,
    $q$delete from public.matches$q$,
    $q$delete from public.profiles$q$
  ] loop
    perform pg_temp.rows_changed(stmt);
  end loop;
end $$;
-- Back to the superuser to confirm user B's rows are untouched.
reset role;
do $$
begin
  if not exists (
    select 1 from public.claims
    where id = 'c0000000-0000-4000-8000-00000000000b'
      and user_id = 'b0000000-0000-4000-8000-00000000000b'
      and lawsuit_title = 'RLS test: claim of user B'
      and form_data = '{}'::jsonb) then
    raise exception 'user B''s claim was changed or deleted';
  end if;
  if exists (
    select 1 from public.claims
    where id = 'c0000000-0000-4000-8000-00000000000a'
      and user_id <> 'a0000000-0000-4000-8000-00000000000a') then
    raise exception 'user A handed their claim to another user';
  end if;
  if exists (
    select 1 from public.claims
    where user_id = 'b0000000-0000-4000-8000-00000000000b'
      and lawsuit_id = '10000000-0000-4000-8000-000000000002') then
    raise exception 'user A created a claim in user B''s name';
  end if;
  if not exists (
    select 1 from public.matches
    where user_id = 'b0000000-0000-4000-8000-00000000000b'
      and lawsuit_id = '10000000-0000-4000-8000-000000000001'
      and not dismissed) then
    raise exception 'user B''s match was changed or deleted';
  end if;
  if exists (
    select 1 from public.matches
    where user_id = 'b0000000-0000-4000-8000-00000000000b'
      and lawsuit_id = '10000000-0000-4000-8000-000000000002') then
    raise exception 'user A created a match for user B';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = 'b0000000-0000-4000-8000-00000000000b'
      and full_name is distinct from 'changed by A') then
    raise exception 'user B''s profile was changed or deleted';
  end if;
end $$;
call pg_temp.assert_protected_tables_unchanged('user A');
rollback;

-- ---------------------------------------------------------------------------
-- 6. A signed-in user cannot make themselves an admin or rewrite the profile
--    columns the server owns (0002 grants UPDATE only on editable columns).
--    Not yet checked: INSERT. The "own profile upsert" policy still lets a
--    user who has no profile row insert one with is_admin = true (SEC-9).
--    Add that check in the same change as the migration that revokes it.
-- ---------------------------------------------------------------------------
\echo '  6 a signed-in user cannot write server-owned profile columns'
begin;
call pg_temp.load_fixtures();
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
declare
  stmt text;
  n bigint;
begin
  foreach stmt in array array[
    $q$update public.profiles set is_admin = true
       where id = 'a0000000-0000-4000-8000-00000000000a'$q$,
    $q$update public.profiles set referral_code = 'chosen-by-a'
       where id = 'a0000000-0000-4000-8000-00000000000a'$q$,
    $q$update public.profiles set referred_by = 'b0000000-0000-4000-8000-00000000000b'
       where id = 'a0000000-0000-4000-8000-00000000000a'$q$,
    $q$update public.profiles set email = 'someone-else@example.test'
       where id = 'a0000000-0000-4000-8000-00000000000a'$q$
  ] loop
    n := pg_temp.rows_changed(stmt);
    if n is not null then
      raise exception 'user A was allowed to run (% row(s)): %', n, stmt;
    end if;
  end loop;
end $$;
reset role;
do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = 'a0000000-0000-4000-8000-00000000000a'
      and not is_admin
      and referred_by is null
      and email = 'rls-user-a@example.test'
      and referral_code is distinct from 'chosen-by-a') then
    raise exception 'user A''s server-owned profile columns changed';
  end if;
end $$;
rollback;
