-- Part A claims (0006, 0007 and 0008): the CHECK on 'submitted', re-running
-- 0006 over legacy rows, the server-only claim functions, the append-only
-- claim_events log, no direct client writes to claims, and the corrective-
-- notice marker. Runs after every migration.
-- Each check raises 'FAIL: ...' on a regression; everything rolls back.
--
-- Sections 1-3 and 5-8 run against the schema the whole migration chain
-- leaves. Sections 4 and 9 re-apply migrations over legacy rows, so each
-- runs in its own transaction: a re-applied 0006 would otherwise restore
-- 0006's functions and policies and hide a later migration that weakened
-- them.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'claims-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'claims-b@example.test');

insert into public.lawsuits (id, slug, title) values
  ('00000000-0000-4000-8000-00000000c001', 'claims-test-one', 'Claims test one'),
  ('00000000-0000-4000-8000-00000000c002', 'claims-test-two', 'Claims test two'),
  ('00000000-0000-4000-8000-00000000c003', 'claims-test-three', 'Claims test three'),
  ('00000000-0000-4000-8000-00000000c004', 'claims-test-four', 'Claims test four');

-- 1. The new states exist beside the old ones.
do $$
begin
  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'claim_status'
        and e.enumlabel in ('self_file', 'reported_filed', 'not_reported_filed', 'withdrawn',
                            'processing', 'submitted', 'approved', 'rejected', 'paid')) <> 9 then
    raise exception 'FAIL: claim_status is missing a value';
  end if;
end $$;

-- 2. A new 'submitted' claim without a confirmation number is refused.
do $$
begin
  begin
    insert into public.claims (user_id, lawsuit_id, lawsuit_title, status)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'One', 'submitted');
    raise exception 'FAIL: submitted without a confirmation number was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.claims (user_id, lawsuit_id, lawsuit_title, status, confirmation_number)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'One', 'submitted', '   ');
    raise exception 'FAIL: submitted with a blank confirmation number was accepted';
  exception when check_violation then null;
  end;
end $$;

-- 3. 'submitted' with a number, and the new states, are accepted.
insert into public.claims (user_id, lawsuit_id, lawsuit_title, status, confirmation_number)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'One', 'submitted', 'ABC-123');
insert into public.claims (user_id, lawsuit_id, lawsuit_title, status)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c002', 'Two', 'self_file');

-- 3b. 0007's trigger, as the migration chain left it: moving a legacy claim
--     (the D38 correction) sets the corrective-notice marker.
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status) values
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000b2',
   '00000000-0000-4000-8000-00000000c004', 'Four (legacy)', 'processing');
update public.claims set status = 'self_file' where id = '00000000-0000-4000-8000-0000000000d4';
do $$
begin
  if (select corrective_notice_required from public.claims
      where id = '00000000-0000-4000-8000-0000000000d4') is not true then
    raise exception 'FAIL: moving a legacy claim did not keep the corrective-notice marker';
  end if;
end $$;

-- 5. The server functions change a claim and log it in one transaction.
do $$
declare
  v    jsonb;
  v_id uuid;
  n    int;
begin
  v := public.claim_start_tracking('00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-00000000c003', 'Three', 'self_file', 'user', '{"action":"start_tracking"}');
  if not (v->>'created')::boolean or v->'claim'->>'status' <> 'self_file' then
    raise exception 'FAIL: expected a new self_file claim, got %', v;
  end if;
  v_id := (v->'claim'->>'id')::uuid;

  v := public.claim_start_tracking('00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-00000000c003', 'Three', 'self_file', 'user', '{}');
  if (v->>'created')::boolean or (v->'claim'->>'id')::uuid <> v_id then
    raise exception 'FAIL: starting twice must return the same claim, got %', v;
  end if;

  v := public.claim_apply_change(v_id, '00000000-0000-4000-8000-0000000000a1', 'self_file',
    '{"status":"reported_filed","reported_filed_at":"2026-10-16T18:00:00Z","user_filed_on":"2026-10-15"}',
    'user', '{"action":"report_filed"}');
  if v->>'status' <> 'reported_filed' or v->>'user_filed_on' <> '2026-10-15' then
    raise exception 'FAIL: report not applied: %', v;
  end if;

  select count(*) into n from public.claim_events where claim_id = v_id;
  if n <> 2 then
    raise exception 'FAIL: expected 2 events (start, report), got %', n;
  end if;
  if not exists (
    select 1 from public.claim_events
    where claim_id = v_id and from_status = 'self_file' and to_status = 'reported_filed'
      and actor = 'user' and user_id = '00000000-0000-4000-8000-0000000000a1'
      and detail->>'action' = 'report_filed'
  ) then
    raise exception 'FAIL: the report event is missing or wrong';
  end if;

  begin
    perform public.claim_apply_change(v_id, '00000000-0000-4000-8000-0000000000a1', 'self_file',
      '{"status":"withdrawn"}', 'user', '{}');
    raise exception 'FAIL: a stale expected status was accepted';
  exception when serialization_failure then null;
  end;

  begin
    perform public.claim_apply_change(v_id, '00000000-0000-4000-8000-0000000000b2', 'reported_filed',
      '{"status":"self_file"}', 'user', '{}');
    raise exception 'FAIL: changed another user''s claim';
  exception when no_data_found then null;
  end;

  begin
    perform public.claim_apply_change(v_id, '00000000-0000-4000-8000-0000000000a1', 'reported_filed',
      '{"user_id":"00000000-0000-4000-8000-0000000000b2"}', 'user', '{}');
    raise exception 'FAIL: an unsupported column was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.claim_apply_change(v_id, '00000000-0000-4000-8000-0000000000a1', 'reported_filed',
      '{"status":"submitted"}', 'user', '{}');
    raise exception 'FAIL: submitted without a number was accepted';
  exception when check_violation then null;
  end;
  select count(*) into n from public.claim_events where claim_id = v_id;
  if n <> 2 then
    raise exception 'FAIL: a refused change was logged (% events)', n;
  end if;

  v := public.claim_apply_change(v_id, '00000000-0000-4000-8000-0000000000a1', 'reported_filed',
    '{"status":"submitted","confirmation_number":" CM-7781 "}', 'user', '{"action":"add_confirmation"}');
  if v->>'status' <> 'submitted' or v->>'confirmation_number' <> 'CM-7781' then
    raise exception 'FAIL: the confirmation number was not applied: %', v;
  end if;

  -- The event's user is always the claim's user.
  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor)
  values (v_id, '00000000-0000-4000-8000-0000000000b2', 'submitted', 'submitted', 'system');
  if exists (select 1 from public.claim_events where claim_id = v_id
             and user_id <> '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL: an event user differs from the claim user';
  end if;

  begin
    insert into public.claim_events (claim_id, user_id, actor) values (v_id, gen_random_uuid(), 'robot');
    raise exception 'FAIL: an unknown actor was accepted';
  exception when check_violation then null;
  end;

  -- Append-only, even for the table owner.
  begin
    update public.claim_events set actor = 'staff' where claim_id = v_id;
    raise exception 'FAIL: an event was edited';
  exception when insufficient_privilege then null;
  end;
end $$;

-- User B gets a claim event too, so the check below that user A sees no one
-- else's events can fail.
do $$
begin
  perform public.claim_start_tracking('00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-00000000c003', 'Three', 'self_file', 'user', '{}');
  if not exists (select 1 from public.claim_events where user_id = '00000000-0000-4000-8000-0000000000b2') then
    raise exception 'FAIL: fixture: user B has no claim event';
  end if;
end $$;

-- 6. After 0007, a signed-in user reads their own claims and events but cannot
--    write claims (no direct status update, insert or delete), cannot write
--    events and cannot run the server functions.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

do $$
declare
  n int;
begin
  select count(*) into n from public.claims;
  if n <> 3 then
    raise exception 'FAIL: user A should see exactly their 3 claims, saw %', n;
  end if;
  -- User A's own 4 events (start, report, number, the rewritten insert), and
  -- none of user B's.
  select count(*) into n from public.claim_events;
  if n <> 4 or exists (select 1 from public.claim_events where user_id <> auth.uid()) then
    raise exception 'FAIL: user A sees the wrong claim events (% rows)', n;
  end if;

  begin
    update public.claims set status = 'submitted', confirmation_number = 'FAKE-1'
    where user_id = auth.uid();
    raise exception 'FAIL: an authenticated user updated claims.status directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.claims (user_id, lawsuit_id, lawsuit_title, status)
    values (auth.uid(), '00000000-0000-4000-8000-00000000c002', 'Two', 'self_file');
    raise exception 'FAIL: an authenticated user inserted a claim directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.claims where user_id = auth.uid();
    raise exception 'FAIL: an authenticated user deleted a claim directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.claim_events (claim_id, user_id, actor)
    select id, user_id, 'user' from public.claims limit 1;
    raise exception 'FAIL: an authenticated user wrote a claim event';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_apply_change(
      (select id from public.claims where status = 'self_file' limit 1), auth.uid(), 'self_file',
      '{"status":"reported_filed"}', 'user', '{}');
    raise exception 'FAIL: an authenticated user ran claim_apply_change';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_start_tracking(auth.uid(), '00000000-0000-4000-8000-00000000c002', 'Two', 'self_file', 'user', '{}');
    raise exception 'FAIL: an authenticated user ran claim_start_tracking';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- An anonymous request carries no user id.
set local request.jwt.claim.sub = '';
set local role anon;
do $$
begin
  if exists (select 1 from public.claims) or exists (select 1 from public.claim_events) then
    raise exception 'FAIL: anon can read claims or claim events';
  end if;
  begin
    update public.claims set status = 'self_file';
    raise exception 'FAIL: anon updated claims';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 6b. The same rules, read from the catalog, so a later migration that loosens
--     a grant, a policy or the append-only trigger fails here even if the
--     runtime checks above happen to pass.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.claim_start_tracking(uuid, uuid, text, text, text, jsonb)',
    'public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'FAIL: % is executable by anon or authenticated', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'FAIL: service_role cannot execute %', fn;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.claim_events', 'insert, update, delete')
     or has_table_privilege('authenticated', 'public.claim_events', 'insert, update, delete')
     or has_table_privilege('service_role', 'public.claim_events', 'update, delete') then
    raise exception 'FAIL: an API role may edit or delete claim events, or a client may append them';
  end if;
  if has_table_privilege('anon', 'public.claims', 'insert, update, delete')
     or has_table_privilege('authenticated', 'public.claims', 'insert, update, delete') then
    raise exception 'FAIL: a client role may write claims directly';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.claim_events'::regclass
                   and tgname = 'claim_events_no_update' and tgenabled <> 'D') then
    raise exception 'FAIL: the append-only trigger on claim_events is missing or disabled';
  end if;
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'claim_events'
               and (cmd <> 'SELECT' or qual is distinct from '(auth.uid() = user_id)')) then
    raise exception 'FAIL: claim_events has a policy other than "own events, read only"';
  end if;
  if position('user_id = p_user_id' in pg_get_functiondef(
       'public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL: claim_apply_change no longer checks that the claim is the user''s';
  end if;
end $$;

-- 7. The service role (route handlers) can run the functions and append events,
--    but never edit or delete events.
set local role service_role;
do $$
begin
  perform public.claim_start_tracking('00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-00000000c002', 'Two', 'self_file', 'user', '{}');
  if not exists (
    select 1 from public.claim_events e join public.claims c on c.id = e.claim_id
    where c.user_id = '00000000-0000-4000-8000-0000000000b2'
      and c.lawsuit_id = '00000000-0000-4000-8000-00000000c002'
  ) then
    raise exception 'FAIL: service_role could not start tracking';
  end if;
  begin
    update public.claim_events set actor = 'staff';
    raise exception 'FAIL: service_role edited events';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.claim_events;
    raise exception 'FAIL: service_role deleted events';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 8. Deleting a claim (account deletion) removes its events by cascade.
do $$
begin
  delete from public.claims
  where user_id = '00000000-0000-4000-8000-0000000000a1'
    and lawsuit_id = '00000000-0000-4000-8000-00000000c003';
  if exists (select 1 from public.claim_events e
             where not exists (select 1 from public.claims c where c.id = e.claim_id)) then
    raise exception 'FAIL: events outlived their claim';
  end if;
end $$;

rollback;

-- 4. Legacy rows, in their own transaction (it re-applies 0006): simulate a
--    'submitted' row written before 0006 (no number), then re-apply 0006 on
--    top of it. It must succeed and leave the CHECK NOT VALID, and any later
--    update of that row must leave 'submitted'.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b2', 'claims-b@example.test');
insert into public.lawsuits (id, slug, title) values
  ('00000000-0000-4000-8000-00000000c001', 'claims-test-one', 'Claims test one');

alter table public.claims drop constraint claims_submitted_needs_confirmation;
insert into public.claims (user_id, lawsuit_id, lawsuit_title, status)
values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c001', 'One (legacy)', 'submitted');
\i supabase/migrations/0006_claim_states.sql

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'claims_submitted_needs_confirmation' and not convalidated
  ) then
    raise exception 'FAIL: expected claims_submitted_needs_confirmation to exist as NOT VALID';
  end if;
  begin
    update public.claims set corrective_notice_answered_at = now()
    where user_id = '00000000-0000-4000-8000-0000000000b2';
    raise exception 'FAIL: a legacy submitted row was updated without leaving submitted';
  exception when check_violation then null;
  end;
end $$;

rollback;

-- 9. 0007: the corrective-notice marker survives the D38 correction. Rows as
--    the retired flows left them, then 0006 and 0007 applied over them (the
--    production order), then the correction that moves them to self_file.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'claims-marker@example.test');
insert into public.lawsuits (id, slug, title) values
  ('00000000-0000-4000-8000-00000000e001', 'claims-marker-one', 'Marker one'),
  ('00000000-0000-4000-8000-00000000e002', 'claims-marker-two', 'Marker two'),
  ('00000000-0000-4000-8000-00000000e003', 'claims-marker-three', 'Marker three'),
  ('00000000-0000-4000-8000-00000000e004', 'claims-marker-four', 'Marker four');

alter table public.claims drop constraint claims_submitted_needs_confirmation;
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status, filed_at, authorized_at) values
  -- the e-sign "Claim filed" row
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1',
   '00000000-0000-4000-8000-00000000e001', 'One', 'submitted', now(), now()),
  -- a legacy status without the e-sign stamps
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1',
   '00000000-0000-4000-8000-00000000e002', 'Two', 'processing', null, null),
  -- moved out of 'submitted' before 0007, stamps kept
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e1',
   '00000000-0000-4000-8000-00000000e003', 'Three', 'self_file', now(), null),
  -- an ordinary Part A claim
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000e1',
   '00000000-0000-4000-8000-00000000e004', 'Four', 'self_file', null, null);
\i supabase/migrations/0006_claim_states.sql
\i supabase/migrations/0007_corrective_notice_marker.sql

do $$
declare
  marked uuid[];
begin
  -- The backfill marks every row with evidence it may update today ('submitted'
  -- rows wait for the trigger: the CHECK refuses updating them in place).
  select array_agg(id order by id) into marked from public.claims
   where user_id = '00000000-0000-4000-8000-0000000000e1' and corrective_notice_required;
  if marked is distinct from array['00000000-0000-4000-8000-0000000000f2',
                                   '00000000-0000-4000-8000-0000000000f3']::uuid[] then
    raise exception 'FAIL: 0007 backfill marked %', marked;
  end if;

  -- The D38 correction: legacy rows to self_file. The trigger marks them all.
  update public.claims set status = 'self_file'
   where user_id = '00000000-0000-4000-8000-0000000000e1'
     and ((status = 'submitted' and coalesce(btrim(confirmation_number), '') = '')
          or status in ('processing', 'approved', 'rejected', 'paid'));
  select array_agg(id order by id) into marked from public.claims
   where user_id = '00000000-0000-4000-8000-0000000000e1' and corrective_notice_required;
  if marked is distinct from array['00000000-0000-4000-8000-0000000000f1',
                                   '00000000-0000-4000-8000-0000000000f2',
                                   '00000000-0000-4000-8000-0000000000f3']::uuid[] then
    raise exception 'FAIL: after the correction the marked claims are %', marked;
  end if;
  if exists (select 1 from public.claims
             where user_id = '00000000-0000-4000-8000-0000000000e1'
               and corrective_notice_answered_at is not null) then
    raise exception 'FAIL: the correction answered the corrective notice';
  end if;

  -- An ordinary claim never gets the marker, and the stamped row keeps it.
  update public.claims set status = 'reported_filed' where id = '00000000-0000-4000-8000-0000000000f4';
  update public.claims set corrective_notice_required = false where id = '00000000-0000-4000-8000-0000000000f1';
  if (select corrective_notice_required from public.claims where id = '00000000-0000-4000-8000-0000000000f4') is not null
     or (select corrective_notice_required from public.claims where id = '00000000-0000-4000-8000-0000000000f1') is not true then
    raise exception 'FAIL: the marker was set on an ordinary claim or cleared on an e-sign row';
  end if;

  -- The user's answer through the server function keeps the marker.
  perform public.claim_apply_change('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1',
    'self_file', jsonb_build_object('corrective_notice_answered_at', now()), 'user', '{"action":"acknowledge_notice"}');
  if (select corrective_notice_required from public.claims where id = '00000000-0000-4000-8000-0000000000f2') is not true then
    raise exception 'FAIL: answering the notice cleared the marker';
  end if;
end $$;

-- Re-running 0007 changes nothing.
\i supabase/migrations/0007_corrective_notice_marker.sql
do $$
begin
  if (select count(*) from public.claims
      where user_id = '00000000-0000-4000-8000-0000000000e1' and corrective_notice_required) <> 3 then
    raise exception 'FAIL: re-running 0007 changed the marker';
  end if;
end $$;

rollback;
