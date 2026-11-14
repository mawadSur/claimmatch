-- One-click filing (0037 to 0040): row security, the integrity triggers and
-- the server-only functions. One transaction, rolled back at the end, so it
-- leaves nothing behind. Fixture ids end in 75.
\set ON_ERROR_STOP 1
-- Query results are not needed; \echo still prints the section names.
\o /dev/null
begin;

-- Runs stmt and requires it to fail with SQLSTATE code.
create function pg_temp.expect_error(stmt text, code text) returns void
language plpgsql as $$
declare
  got text;
begin
  begin
    execute stmt;
    got := 'no error';
  exception when others then
    got := sqlstate;
  end;
  if got is distinct from code then
    raise exception 'expected SQLSTATE % but got % from: %', code, got, stmt;
  end if;
end $$;

-- How many rows of a query the current role sees; null without privilege.
create function pg_temp.seen(query text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n;
exception when insufficient_privilege then
  return null;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000a5', 'occ-member-a@example.test'),
  ('b0000000-0000-4000-8000-0000000000b5', 'occ-member-b@example.test'),
  ('e0000000-0000-4000-8000-0000000000e5', 'occ-reviewer@example.test'),
  ('f0000000-0000-4000-8000-0000000000f5', 'occ-agent@example.test');
insert into public.lawsuits (id, slug, title, status, review_status, deadline) values
  ('10000000-0000-4000-8000-000000000075', 'occ-settlement', 'One-click test settlement',
   'open'::lawsuit_status, 'published'::review_status, current_date + 60);
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status) values
  ('c0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000a5',
   '10000000-0000-4000-8000-000000000075', 'One-click test settlement', 'self_file'),
  ('c0000000-0000-4000-8000-0000000000b5', 'b0000000-0000-4000-8000-0000000000b5',
   '10000000-0000-4000-8000-000000000075', 'One-click test settlement', 'self_file');

\echo '  1 API roles: no privilege on staff tables; members read only five tables, write none'
do $$
declare
  t text;
  member_read constant text[] := array['claim_packets', 'claim_documents', 'esign_consents',
                                       'claim_signatures', 'claim_signature_voids'];
begin
  foreach t in array array['staff_roles', 'filing_policies', 'filing_controls', 'filing_specs',
                           'claim_packets', 'claim_documents', 'esign_consents', 'claim_signatures',
                           'claim_signature_voids', 'jev_runs', 'filing_export_batches',
                           'claim_filing_jobs', 'filing_audit_log'] loop
    if has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('anon', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'update')
       or has_table_privilege('anon', 'public.' || t, 'delete') then
      raise exception 'anon has a privilege on public.%', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert')
       or has_table_privilege('authenticated', 'public.' || t, 'update')
       or has_table_privilege('authenticated', 'public.' || t, 'delete') then
      raise exception 'authenticated may write public.%', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'select') <> (t = any (member_read)) then
      raise exception 'authenticated select on public.% should be %', t, t = any (member_read);
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.claim_authorizations', 'insert') then
    raise exception 'Phase 0: members must not insert claim_authorizations';
  end if;
  if has_table_privilege('service_role', 'public.claim_signatures', 'update')
     or has_table_privilege('service_role', 'public.filing_audit_log', 'delete') then
    raise exception 'the service role must not rewrite signatures or delete audit rows';
  end if;
  if has_function_privilege('authenticated', 'public.filing_move_claim(uuid, uuid, text, text, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.filing_job_claim_next(text, text, text, uuid, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.filing_approve_spec(uuid, uuid, text, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.filing_enqueue(uuid, text, uuid, timestamptz, timestamptz, text, jsonb)', 'execute') then
    raise exception 'one-click functions must be executable by the service role only';
  end if;
end $$;

\echo '  2 claim state machine: only the allowed one-click edges'
select pg_temp.expect_error($q$update public.claims set status = 'filing'
  where id = 'c0000000-0000-4000-8000-0000000000a5'$q$, 'CM001');
select pg_temp.expect_error($q$insert into public.claims (user_id, lawsuit_id, lawsuit_title, status)
  values ('e0000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-000000000075', 'x', 'queued')$q$, 'CM001');
update public.claims set status = 'preparing' where id in ('c0000000-0000-4000-8000-0000000000a5',
                                                         'c0000000-0000-4000-8000-0000000000b5');

\echo '  3 only an active legal_reviewer approves specs and policies, adds reviewers or turns a kill switch off'
-- The founder's bootstrap insert (granted_by null), then the reviewer adds a desk agent.
insert into public.staff_roles (user_id, role) values ('e0000000-0000-4000-8000-0000000000e5', 'legal_reviewer');
insert into public.staff_roles (user_id, role, granted_by) values
  ('f0000000-0000-4000-8000-0000000000f5', 'filing_agent', 'e0000000-0000-4000-8000-0000000000e5');
select pg_temp.expect_error($q$insert into public.staff_roles (user_id, role, granted_by) values
  ('a0000000-0000-4000-8000-0000000000a5', 'legal_reviewer', 'f0000000-0000-4000-8000-0000000000f5')$q$, 'CM006');
select pg_temp.expect_error($q$insert into public.staff_roles (user_id, role, granted_by) values
  ('e0000000-0000-4000-8000-0000000000e5', 'legal_reviewer', 'e0000000-0000-4000-8000-0000000000e5')$q$, '23514');
select pg_temp.expect_error($q$update public.staff_roles set role = 'legal_reviewer'
  where user_id = 'f0000000-0000-4000-8000-0000000000f5'$q$, 'CM014');
select pg_temp.expect_error($q$insert into public.filing_policies (lawsuit_id, version, status, agent_filing,
  approved_by, approved_at, documents_reviewed) values ('10000000-0000-4000-8000-000000000075', 9, 'approved',
  'allowed', 'e0000000-0000-4000-8000-0000000000e5', now(), '[{"kind": "other"}]')$q$, 'CM007');
insert into public.filing_specs (id, lawsuit_id, version, content) values
  ('50000000-0000-4000-8000-000000000075', '10000000-0000-4000-8000-000000000075', 1,
   '{"attestation": {"text": "I declare under penalty of perjury that the above is true."},
     "class_definition": {"text": "All persons who bought the product.", "source_url": "https://official.example.test/notice"},
     "official_form": {"url": "https://official.example.test/claim"}}');
select pg_temp.expect_error($q$select public.filing_approve_spec('50000000-0000-4000-8000-000000000075',
  'f0000000-0000-4000-8000-0000000000f5', 'ok', '[{"kind": "claim_form"}]')$q$, 'CM006');
select pg_temp.expect_error($q$update public.filing_specs set status = 'approved',
  approved_by = 'f0000000-0000-4000-8000-0000000000f5', approved_at = now(),
  documents_reviewed = '[{"kind": "claim_form"}]' where id = '50000000-0000-4000-8000-000000000075'$q$, 'CM006');
select public.filing_approve_spec('50000000-0000-4000-8000-000000000075',
  'e0000000-0000-4000-8000-0000000000e5', 'Checked against the official form.', '[{"kind": "claim_form"}]');
select pg_temp.expect_error($q$update public.filing_specs set content = '{}'
  where id = '50000000-0000-4000-8000-000000000075'$q$, 'CM007');
insert into public.filing_policies (id, lawsuit_id, version, agent_filing, channels) values
  ('60000000-0000-4000-8000-000000000075', '10000000-0000-4000-8000-000000000075', 1, 'allowed',
   '[{"type": "filing_desk", "enabled": true}]');
select public.filing_approve_policy('60000000-0000-4000-8000-000000000075',
  'e0000000-0000-4000-8000-0000000000e5', 'Administrator letter on file.', '[{"kind": "administrator_letter"}]');
select pg_temp.expect_error($q$update public.filing_policies set status = 'superseded'
  where id = '60000000-0000-4000-8000-000000000075'$q$, 'CM006');
insert into public.filing_policies (id, lawsuit_id, version) values
  ('60000000-0000-4000-8000-000000000076', '10000000-0000-4000-8000-000000000075', 2);
select public.filing_approve_policy('60000000-0000-4000-8000-000000000076',
  'e0000000-0000-4000-8000-0000000000e5', 'Back to unknown.', '[{"kind": "court_order"}]');
do $$
begin
  if (select status from public.filing_policies where id = '60000000-0000-4000-8000-000000000075') <> 'superseded' then
    raise exception 'approving version 2 must supersede version 1';
  end if;
end $$;
insert into public.filing_controls (lawsuit_id, kill_switch, kill_switch_reason, kill_switch_changed_by)
  values ('10000000-0000-4000-8000-000000000075', true, 'administrator asked us to stop',
          'f0000000-0000-4000-8000-0000000000f5');
select pg_temp.expect_error($q$update public.filing_controls set kill_switch = false,
  kill_switch_changed_by = 'f0000000-0000-4000-8000-0000000000f5'
  where lawsuit_id = '10000000-0000-4000-8000-000000000075'$q$, 'CM006');
set local role service_role;
select pg_temp.expect_error($q$delete from public.filing_controls
  where lawsuit_id = '10000000-0000-4000-8000-000000000075'$q$, '42501');
select pg_temp.expect_error($q$delete from public.filing_policies$q$, '42501');
reset role;
update public.filing_controls set kill_switch = false, kill_switch_changed_by = 'e0000000-0000-4000-8000-0000000000e5'
  where lawsuit_id = '10000000-0000-4000-8000-000000000075';

\echo '  4 packets, documents and consents take their owner from the claim and keep their content'
insert into public.claim_packets (id, claim_id, user_id, lawsuit_id, spec_id, spec_version, answers) values
  ('70000000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-0000000000a5',
   'b0000000-0000-4000-8000-0000000000b5', '10000000-0000-4000-8000-000000000075',
   '50000000-0000-4000-8000-000000000075', 1, '{"purchase_count": 2}'),
  ('70000000-0000-4000-8000-0000000000b5', 'c0000000-0000-4000-8000-0000000000b5',
   'b0000000-0000-4000-8000-0000000000b5', '10000000-0000-4000-8000-000000000075',
   '50000000-0000-4000-8000-000000000075', 1, '{}');
do $$
begin
  if (select user_id from public.claim_packets where id = '70000000-0000-4000-8000-0000000000a5')
     <> 'a0000000-0000-4000-8000-0000000000a5' then
    raise exception 'a packet must take its owner from the claim';
  end if;
end $$;
select pg_temp.expect_error($q$insert into public.claim_documents (claim_id, user_id, packet_id, kind, storage_path, mime, size_bytes)
  values ('c0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000a5',
          '70000000-0000-4000-8000-0000000000a5', 'receipt', 'someone-else/receipt.jpg', 'image/jpeg', 100)$q$, '23514');
insert into public.claim_documents (id, claim_id, user_id, packet_id, kind, storage_path, mime, size_bytes) values
  ('80000000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-0000000000a5',
   'a0000000-0000-4000-8000-0000000000a5', '70000000-0000-4000-8000-0000000000a5', 'receipt',
   'a0000000-0000-4000-8000-0000000000a5/c0000000-0000-4000-8000-0000000000a5/80000000-0000-4000-8000-0000000000a5.jpg',
   'image/jpeg', 100);
update public.claim_documents set status = 'stored', stored_at = now(), sha256 = repeat('a', 64)
 where id = '80000000-0000-4000-8000-0000000000a5';
select pg_temp.expect_error($q$update public.claim_documents set sha256 = repeat('b', 64)
  where id = '80000000-0000-4000-8000-0000000000a5'$q$, 'CM002');
insert into public.esign_consents (id, user_id, text_version, full_text, text_sha256) values
  ('90000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000a5', 'esign-test', 'I agree.',
   encode(sha256(convert_to('I agree.', 'UTF8')), 'hex')),
  ('90000000-0000-4000-8000-0000000000b5', 'b0000000-0000-4000-8000-0000000000b5', 'esign-test', 'I agree.',
   encode(sha256(convert_to('I agree.', 'UTF8')), 'hex')),
  ('90000000-0000-4000-8000-0000000000c5', 'b0000000-0000-4000-8000-0000000000b5', 'esign-old', 'I agreed.',
   encode(sha256(convert_to('I agreed.', 'UTF8')), 'hex'));
select pg_temp.expect_error($q$update public.esign_consents set full_text = 'changed', text_sha256 = repeat('c', 64)
  where id = '90000000-0000-4000-8000-0000000000c5'$q$, 'CM014');
update public.esign_consents set withdrawn_at = now() where id = '90000000-0000-4000-8000-0000000000c5';
select pg_temp.expect_error($q$update public.esign_consents set withdrawn_at = now() + interval '1 day'
  where id = '90000000-0000-4000-8000-0000000000c5'$q$, 'CM014');

create function pg_temp.sha(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;
-- A canonical packet as the server builds it (only the keys 0039 checks).
create function pg_temp.canon(p_claim uuid, p_lawsuit text default '10000000-0000-4000-8000-000000000075',
                              p_spec text default '50000000-0000-4000-8000-000000000075') returns text
language sql as $$
  select format('{"attestation_sha256":"%s","claim_id":"%s","class_definition_sha256":"%s",'
                '"confirmations":{"class_definition":true,"health_data_consent":null},'
                '"format":"claimmatch.packet.v1","lawsuit_id":"%s","spec":{"id":"%s","version":1}}',
                pg_temp.sha('I declare under penalty of perjury that the above is true.'), p_claim,
                pg_temp.sha('All persons who bought the product.'), p_lawsuit, p_spec)
$$;
create function pg_temp.sign(p_claim uuid, p_user uuid, p_packet uuid, p_lane text, p_consent uuid, p_key text)
returns jsonb language sql as $$
  select public.filing_sign_packet(p_claim, p_user, p_packet, pg_temp.sha(pg_temp.canon(p_claim)),
    pg_temp.canon(p_claim), '50000000-0000-4000-8000-000000000075',
    'I declare under penalty of perjury that the above is true.', 'agent-auth-test',
    'I authorize Lawsuit AI to submit this one claim for me.', 'Test Member', p_lane, p_consent,
    'password', now() - interval '2 minutes', 'session-75', '203.0.113.7', 'probe', p_key)
$$;

\echo '  5 sign, queue, desk files with a number: claim submitted, signature and packet frozen'
set local role service_role;
do $$
declare
  a_claim  constant uuid := 'c0000000-0000-4000-8000-0000000000a5';
  a_user   constant uuid := 'a0000000-0000-4000-8000-0000000000a5';
  a_packet constant uuid := '70000000-0000-4000-8000-0000000000a5';
  r jsonb;
  sig uuid;
  job uuid;
begin
  update public.claim_packets set packet_hash = pg_temp.sha(pg_temp.canon(a_claim)) where id = a_packet;
  update public.claims set status = 'ready' where id = a_claim;
  -- An email link, or a password sign-in older than 15 minutes, never signs (CM015).
  perform pg_temp.expect_error(format($q$select public.filing_sign_packet(%L, %L, %L, %L, %L,
    '50000000-0000-4000-8000-000000000075', 'I declare under penalty of perjury that the above is true.', 'v',
    'x', 'Test Member', 'filing_desk', '90000000-0000-4000-8000-0000000000a5', %L, now() - %L::interval,
    null, null, null, 'probe-key-stale')$q$, a_claim, a_user, a_packet, pg_temp.sha(pg_temp.canon(a_claim)),
    pg_temp.canon(a_claim), 'magiclink', '1 minute'), 'CM015');
  perform pg_temp.expect_error(format($q$select public.filing_sign_packet(%L, %L, %L, %L, %L,
    '50000000-0000-4000-8000-000000000075', 'I declare under penalty of perjury that the above is true.', 'v',
    'x', 'Test Member', 'filing_desk', '90000000-0000-4000-8000-0000000000a5', %L, now() - %L::interval,
    null, null, null, 'probe-key-stale')$q$, a_claim, a_user, a_packet, pg_temp.sha(pg_temp.canon(a_claim)),
    pg_temp.canon(a_claim), 'password', '16 minutes'), 'CM015');
  r := pg_temp.sign(a_claim, a_user, a_packet, 'filing_desk', '90000000-0000-4000-8000-0000000000a5', 'probe-key-a-1');
  sig := (r -> 'signature' ->> 'id')::uuid;
  if not (r ->> 'created')::boolean or (select status::text from public.claims where id = a_claim) <> 'signed'
     or (select status from public.claim_packets where id = a_packet) <> 'signed' then
    raise exception 'signing must create the signature and move claim and packet to signed: %', r;
  end if;
  r := pg_temp.sign(a_claim, a_user, a_packet, 'filing_desk', '90000000-0000-4000-8000-0000000000a5', 'probe-key-a-1');
  if (r ->> 'created')::boolean or (r -> 'signature' ->> 'id')::uuid <> sig then
    raise exception 'a retried sign with the same key must return the first signature';
  end if;
  perform pg_temp.expect_error($q$update public.claim_signatures set typed_name = 'Someone Else'$q$, '42501');
  perform pg_temp.expect_error(format($q$update public.claim_packets set answers = '{"purchase_count": 9}'
    where id = %L$q$, a_packet), 'CM002');

  r := public.filing_enqueue(sig, 'filing_desk', '60000000-0000-4000-8000-000000000076', now() + interval '2 days');
  job := (r -> 'job' ->> 'id')::uuid;
  if (select status::text from public.claims where id = a_claim) <> 'queued' then
    raise exception 'enqueue must move the claim to queued';
  end if;
  if (public.filing_enqueue(sig, 'filing_desk', null, null) ->> 'created')::boolean then
    raise exception 'enqueue must be idempotent per signature';
  end if;
  perform pg_temp.expect_error(format($q$insert into public.claim_filing_jobs (signature_id, claim_id, user_id,
      lawsuit_id, packet_id, packet_hash, spec_id, channel, idempotency_key)
    select id, claim_id, user_id, lawsuit_id, packet_id, packet_hash, spec_id, 'administrator_email', 'probe-other'
      from public.claim_signatures where id = %L$q$, sig), 'CM012');

  r := public.filing_job_claim_next('filing_desk', 'staff:f0000000-0000-4000-8000-0000000000f5');
  if r is null or (r -> 'job' ->> 'id')::uuid <> job or (r -> 'claim' ->> 'status') <> 'filing' then
    raise exception 'the desk must take the queued job and the claim must show filing: %', r;
  end if;
  if public.filing_job_claim_next('filing_desk', 'staff:f0000000-0000-4000-8000-0000000000f5') is not null then
    raise exception 'nothing else is due';
  end if;
  perform pg_temp.expect_error(format($q$select public.filing_move_claim(%L, %L, 'withdrawn', 'changed_mind')$q$,
    a_claim, a_user), 'CM005');
  perform pg_temp.expect_error(format($q$select public.filing_job_finish(%L, 'staff:someone-else', 'filed',
    'submitted', 'ABC-123')$q$, job), 'CM005');
  perform pg_temp.expect_error(format($q$select public.filing_job_finish(%L,
    'staff:f0000000-0000-4000-8000-0000000000f5', 'queued', 'queued', null, '{}', '[]', 'timeout')$q$, job), '22023');
  r := public.filing_job_finish(job, 'staff:f0000000-0000-4000-8000-0000000000f5', 'filed', 'submitted',
    '  ABC-123 ', '{"desk": true}', '[{"kind": "screenshot"}]', null, 'staff');
  if (select status::text || ' ' || confirmation_number from public.claims where id = a_claim) <> 'submitted ABC-123'
     or (select status from public.claim_packets where id = a_packet) <> 'closed'
     or (select status from public.claim_filing_jobs where id = job) <> 'filed' then
    raise exception 'a filed job with a number must leave the claim submitted and the packet closed';
  end if;
  perform pg_temp.expect_error(format($q$update public.claim_filing_jobs set confirmation_number = 'XYZ'
    where id = %L$q$, job), 'CM013');
  perform pg_temp.expect_error(format($q$update public.claims set status = 'queued' where id = %L$q$, a_claim), 'CM001');
end $$;

\echo '  6 email lane: hand back to the member (needs_you), re-sign, send, then the number arrives'
do $$
declare
  b_claim  constant uuid := 'c0000000-0000-4000-8000-0000000000b5';
  b_user   constant uuid := 'b0000000-0000-4000-8000-0000000000b5';
  b_packet constant uuid := '70000000-0000-4000-8000-0000000000b5';
  r jsonb;
  sig1 uuid;
  sig2 uuid;
  job1 uuid;
  job2 uuid;
begin
  update public.claim_packets set packet_hash = pg_temp.sha(pg_temp.canon(b_claim)) where id = b_packet;
  update public.claims set status = 'ready' where id = b_claim;
  sig1 := (pg_temp.sign(b_claim, b_user, b_packet, 'administrator_email', '90000000-0000-4000-8000-0000000000b5',
    'probe-key-b-1') -> 'signature' ->> 'id')::uuid;
  job1 := (public.filing_enqueue(sig1, 'administrator_email', null, now() + interval '1 day') -> 'job' ->> 'id')::uuid;
  perform public.filing_job_claim_next('administrator_email', 'worker:run-1', 'system');
  r := public.filing_job_finish(job1, 'worker:run-1', 'cancelled', 'needs_you', null, '{}', '[]',
    'packet_incomplete', 'system');
  if (select status::text from public.claims where id = b_claim) <> 'needs_you'
     or not exists (select 1 from public.claim_signature_voids where signature_id = sig1)
     or (select status from public.claim_packets where id = b_packet) <> 'open' then
    raise exception 'a cancelled job must void the signature, reopen the packet and ask the member';
  end if;
  update public.claim_packets set answers = '{"purchase_count": 3}' where id = b_packet;
  update public.claims set status = 'ready' where id = b_claim;
  sig2 := (pg_temp.sign(b_claim, b_user, b_packet, 'administrator_email', '90000000-0000-4000-8000-0000000000b5',
    'probe-key-b-2') -> 'signature' ->> 'id')::uuid;
  job2 := (public.filing_enqueue(sig2, 'administrator_email', null, now() + interval '1 day') -> 'job' ->> 'id')::uuid;
  perform public.filing_job_claim_next('administrator_email', 'worker:run-2', 'system');
  -- Unsure whether it went out: parked, and the member cannot move the claim off it (no duplicate filing).
  perform public.filing_job_finish(job2, 'worker:run-2', 'needs_attention', null, null, '{}', '[]',
    'send_unconfirmed', 'system');
  perform pg_temp.expect_error(format($q$select public.filing_move_claim(%L, %L, 'self_file', 'member_self_file')$q$,
    b_claim, b_user), 'CM005');
  perform public.filing_job_finish(job2, null, 'filed', 'filed_by_claimmatch', null, '{}',
    '[{"kind": "email"}]', null, 'staff');
  if (select status::text from public.claims where id = b_claim) <> 'filed_by_claimmatch' then
    raise exception 'a sent email without a number must show filed_by_claimmatch';
  end if;
  perform pg_temp.expect_error(format($q$select public.filing_record_confirmation(%L,
    'a0000000-0000-4000-8000-0000000000a5', 'N-1')$q$, b_claim), 'P0002');
  perform public.filing_record_confirmation(b_claim, b_user, ' N-77 ');
  if (select status::text || ' ' || confirmation_number from public.claims where id = b_claim) <> 'submitted N-77'
     or (select confirmation_number from public.claim_filing_jobs where id = job2) <> 'N-77' then
    raise exception 'the late number must reach both the claim and the job';
  end if;
end $$;

\echo '  7 member reopens a queued claim, then withdraws: job cancelled, signature voided, packet closed'
reset role;
insert into public.lawsuits (id, slug, title, status, review_status, deadline) values
  ('10000000-0000-4000-8000-000000000076', 'occ-settlement-2', 'Second one-click test settlement',
   'open'::lawsuit_status, 'published'::review_status, current_date + 60);
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status) values
  ('c0000000-0000-4000-8000-0000000000a6', 'a0000000-0000-4000-8000-0000000000a5',
   '10000000-0000-4000-8000-000000000076', 'Second one-click test settlement', 'preparing');
insert into public.filing_specs (id, lawsuit_id, version, status, content, approved_by, approved_at, documents_reviewed)
  select '50000000-0000-4000-8000-000000000076', '10000000-0000-4000-8000-000000000076', 1, 'draft', content,
         null, null, null from public.filing_specs where id = '50000000-0000-4000-8000-000000000075';
select public.filing_approve_spec('50000000-0000-4000-8000-000000000076',
  'e0000000-0000-4000-8000-0000000000e5', 'Checked.', '[{"kind": "claim_form"}]');
insert into public.claim_packets (id, claim_id, spec_id, spec_version) values
  ('70000000-0000-4000-8000-0000000000a6', 'c0000000-0000-4000-8000-0000000000a6',
   '50000000-0000-4000-8000-000000000076', 1);
set local role service_role;
do $$
declare
  c   constant uuid := 'c0000000-0000-4000-8000-0000000000a6';
  u   constant uuid := 'a0000000-0000-4000-8000-0000000000a5';
  p   constant uuid := '70000000-0000-4000-8000-0000000000a6';
  doc text := pg_temp.canon(c, '10000000-0000-4000-8000-000000000076', '50000000-0000-4000-8000-000000000076');
  bad text;
  r jsonb;
  sig uuid;
  job uuid;
begin
  update public.claims set status = 'ready' where id = c;
  -- The canonical packet must carry the approved statement's hash (CM010).
  bad := replace(doc, pg_temp.sha('I declare under penalty of perjury that the above is true.'), repeat('0', 64));
  update public.claim_packets set packet_hash = pg_temp.sha(bad) where id = p;
  perform pg_temp.expect_error(format($q$select public.filing_sign_packet(%L, %L, %L, %L, %L,
    '50000000-0000-4000-8000-000000000076', 'I declare under penalty of perjury that the above is true.', 'v', 'x',
    'Test Member', 'filing_desk', '90000000-0000-4000-8000-0000000000a5', 'password', now(), null, null, null,
    'probe-key-a-3')$q$, c, u, p, pg_temp.sha(bad), bad), 'CM010');
  update public.claim_packets set packet_hash = pg_temp.sha(doc) where id = p;
  r := public.filing_sign_packet(c, u, p, pg_temp.sha(doc), doc, '50000000-0000-4000-8000-000000000076',
    'I declare under penalty of perjury that the above is true.', 'agent-auth-test', 'I authorize it.',
    'Test Member', 'filing_desk', '90000000-0000-4000-8000-0000000000a5', 'password', now(), null, null, null,
    'probe-key-a-2');
  sig := (r -> 'signature' ->> 'id')::uuid;
  job := (public.filing_enqueue(sig, 'filing_desk', null, null) -> 'job' ->> 'id')::uuid;
  r := public.filing_move_claim(c, u, 'preparing', 'member_edit');
  if (r ->> 'job_cancelled')::uuid <> job or (r ->> 'signature_voided')::uuid <> sig
     or (select status from public.claim_packets where id = p) <> 'open' then
    raise exception 'reopening must cancel the job, void the signature and open the packet: %', r;
  end if;
  r := public.filing_move_claim(c, u, 'withdrawn', 'changed_mind');
  if (select status::text from public.claims where id = c) <> 'withdrawn'
     or (select status from public.claim_packets where id = p) <> 'closed' then
    raise exception 'withdrawing must close the packet';
  end if;
  perform pg_temp.expect_error(format($q$select public.filing_move_claim(%L, %L, 'preparing', 'again')$q$, c, u), 'CM001');
  -- Even back on self_file, a closed packet never returns to the agent lane.
  update public.claims set status = 'self_file' where id = c;
  perform pg_temp.expect_error(format($q$update public.claims set status = 'preparing' where id = %L$q$, c), 'CM001');
end $$;
reset role;

\echo '  8 members read only their own one-click rows and never jobs, Jev runs or staff tables'
insert into public.jev_runs (claim_id, user_id, packet_id, mode, triggered_by, outcome, rule_set_hash, engine_version)
values ('c0000000-0000-4000-8000-0000000000b5', 'b0000000-0000-4000-8000-0000000000b5',
        '70000000-0000-4000-8000-0000000000a5', 'pre_sign', 'member_sign', 'pass', 'probe', 'jev-test');
insert into public.filing_audit_log (actor_id, action, claim_id)
values ('f0000000-0000-4000-8000-0000000000f5', 'view_packet', 'c0000000-0000-4000-8000-0000000000a5');
-- A desk screenshot of A's filed claim: server-side only (it names the staff member who uploaded it).
insert into public.claim_documents (claim_id, user_id, job_id, source, kind, storage_path, mime, size_bytes,
                                    status, sha256, stored_at, uploaded_by)
select j.claim_id, j.user_id, j.id, 'staff_evidence', 'confirmation_screenshot',
       j.user_id || '/' || j.claim_id || '/evidence/' || j.id || '.png', 'image/png', 10, 'stored',
       repeat('d', 64), now(), 'f0000000-0000-4000-8000-0000000000f5'
  from public.claim_filing_jobs j where j.claim_id = 'c0000000-0000-4000-8000-0000000000a5';
select pg_temp.expect_error($q$insert into public.claim_documents (claim_id, user_id, job_id, source, kind,
  storage_path, mime, size_bytes) select 'c0000000-0000-4000-8000-0000000000a5', j.user_id, j.id, 'staff_evidence',
  'confirmation_screenshot', 'a0000000-0000-4000-8000-0000000000a5/c0000000-0000-4000-8000-0000000000a5/evidence/x.png',
  'image/png', 10 from public.claim_filing_jobs j where j.claim_id = 'c0000000-0000-4000-8000-0000000000b5' limit 1$q$,
  'CM002');
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-0000000000a5';
do $$
begin
  if pg_temp.seen('select 1 from public.claim_packets') <> 2
     or pg_temp.seen('select 1 from public.claim_signatures') <> 2
     or pg_temp.seen('select 1 from public.claim_signature_voids') <> 1
     or pg_temp.seen('select 1 from public.esign_consents') <> 1
     or pg_temp.seen('select 1 from public.claim_documents') <> 1 then
    raise exception 'member A must see exactly their own packets, signatures, voids, consents and documents';
  end if;
  if pg_temp.seen($q$select 1 from public.claim_signatures
                      where user_id <> 'a0000000-0000-4000-8000-0000000000a5'$q$) <> 0 then
    raise exception 'member A can read another member''s signature';
  end if;
  if pg_temp.seen('select 1 from public.claim_filing_jobs') is not null
     or pg_temp.seen('select 1 from public.jev_runs') is not null
     or pg_temp.seen('select 1 from public.staff_roles') is not null
     or pg_temp.seen('select 1 from public.filing_specs') is not null
     or pg_temp.seen('select 1 from public.filing_audit_log') is not null then
    raise exception 'members must not read jobs, Jev runs, specs, staff roles or the audit log';
  end if;
  perform pg_temp.expect_error($q$update public.claim_packets set answers = '{}'$q$, '42501');
  perform pg_temp.expect_error($q$delete from public.claim_documents$q$, '42501');
end $$;
reset role;

\echo '  9 signatures, voids, Jev runs and the audit log are never rewritten, even by the owner'
select pg_temp.expect_error($q$update public.claim_signatures set typed_name = 'x'$q$, 'CM014');
select pg_temp.expect_error($q$update public.claim_signature_voids set reason = 'x'$q$, 'CM014');
select pg_temp.expect_error($q$update public.jev_runs set outcome = 'block'$q$, 'CM014');
select pg_temp.expect_error($q$update public.filing_audit_log set action = 'edited'$q$, 'CM014');
select pg_temp.expect_error($q$delete from public.filing_audit_log$q$, 'CM014');
do $$
begin
  if (select user_id from public.jev_runs where engine_version = 'jev-test') <> 'a0000000-0000-4000-8000-0000000000a5' then
    raise exception 'a Jev run must take its owner from the packet';
  end if;
end $$;

rollback;
\o
