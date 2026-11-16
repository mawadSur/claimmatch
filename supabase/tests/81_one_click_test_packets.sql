-- One-click test packets (0047): a test packet is never queued as a real
-- filing. One transaction, rolled back at the end. Fixture ids end in 47.
\set ON_ERROR_STOP 1
\o /dev/null
begin;

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

create function pg_temp.sha(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;
create function pg_temp.canon(p_claim uuid) returns text language sql as $$
  select format('{"attestation_sha256":"%s","claim_id":"%s","class_definition_sha256":"%s",'
                '"confirmations":{"class_definition":true,"health_data_consent":null},'
                '"format":"claimmatch.packet.v1","lawsuit_id":"10000000-0000-4000-8000-000000000047",'
                '"spec":{"id":"50000000-0000-4000-8000-000000000047","version":1}}',
                pg_temp.sha('I declare under penalty of perjury that the above is true.'), p_claim,
                pg_temp.sha('All persons who bought the product.'))
$$;
create function pg_temp.sign(p_claim uuid, p_user uuid, p_packet uuid, p_consent uuid, p_key text)
returns uuid language sql as $$
  select (public.filing_sign_packet(p_claim, p_user, p_packet, pg_temp.sha(pg_temp.canon(p_claim)),
    pg_temp.canon(p_claim), '50000000-0000-4000-8000-000000000047',
    'I declare under penalty of perjury that the above is true.', 'agent-auth-test',
    'I authorize Lawsuit AI to submit this one claim for me.', 'Test Member', 'administrator_email', p_consent,
    'password', now() - interval '2 minutes', 'session-47', '203.0.113.7', 'probe', p_key) -> 'signature' ->> 'id')::uuid
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000047', 'occ-tester47@example.test'),
  ('b0000000-0000-4000-8000-000000000047', 'occ-real47@example.test'),
  ('e0000000-0000-4000-8000-000000000047', 'occ-reviewer47@example.test');
insert into public.lawsuits (id, slug, title, status, review_status, deadline) values
  ('10000000-0000-4000-8000-000000000047', 'occ-test-packets', 'TEST settlement',
   'open'::lawsuit_status, 'published'::review_status, current_date + 60);
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status) values
  ('c0000000-0000-4000-8000-0000000000a7', 'a0000000-0000-4000-8000-000000000047',
   '10000000-0000-4000-8000-000000000047', 'TEST settlement', 'preparing'),
  ('c0000000-0000-4000-8000-0000000000b7', 'b0000000-0000-4000-8000-000000000047',
   '10000000-0000-4000-8000-000000000047', 'TEST settlement', 'preparing');
insert into public.staff_roles (user_id, role) values ('e0000000-0000-4000-8000-000000000047', 'legal_reviewer');
insert into public.filing_specs (id, lawsuit_id, version, content) values
  ('50000000-0000-4000-8000-000000000047', '10000000-0000-4000-8000-000000000047', 1,
   '{"attestation": {"text": "I declare under penalty of perjury that the above is true."},
     "class_definition": {"text": "All persons who bought the product.", "source_url": "https://official.example.test/notice"},
     "official_form": {"url": "https://official.example.test/claim"}}');
select public.filing_approve_spec('50000000-0000-4000-8000-000000000047',
  'e0000000-0000-4000-8000-000000000047', 'Test spec.', '[{"kind": "claim_form"}]');
insert into public.claim_packets (id, claim_id, user_id, lawsuit_id, spec_id, spec_version, answers) values
  ('70000000-0000-4000-8000-0000000000a7', 'c0000000-0000-4000-8000-0000000000a7',
   'a0000000-0000-4000-8000-000000000047', '10000000-0000-4000-8000-000000000047',
   '50000000-0000-4000-8000-000000000047', 1, '{}'),
  ('70000000-0000-4000-8000-0000000000b7', 'c0000000-0000-4000-8000-0000000000b7',
   'b0000000-0000-4000-8000-000000000047', '10000000-0000-4000-8000-000000000047',
   '50000000-0000-4000-8000-000000000047', 1, '{}');
insert into public.esign_consents (id, user_id, text_version, full_text, text_sha256) values
  ('90000000-0000-4000-8000-0000000000a7', 'a0000000-0000-4000-8000-000000000047', 'esign-test', 'I agree.',
   pg_temp.sha('I agree.')),
  ('90000000-0000-4000-8000-0000000000b7', 'b0000000-0000-4000-8000-000000000047', 'esign-test', 'I agree.',
   pg_temp.sha('I agree.'));

\echo '  1 claim_packets.is_test defaults to false; a test packet stays a test packet'
do $$
begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'claim_packets' and column_name = 'is_test') <> 'false' then
    raise exception 'claim_packets.is_test must default to false';
  end if;
  update public.claim_packets set is_test = true where id = '70000000-0000-4000-8000-0000000000a7';
  perform pg_temp.expect_error($q$update public.claim_packets set is_test = false
                                  where id = '70000000-0000-4000-8000-0000000000a7'$q$, 'CM013');
end $$;

\echo '  2 a test packet signed in test mode is never queued for real; the test path still works'
set local role service_role;
do $$
declare
  t_sig uuid;
  r_sig uuid;
  r jsonb;
begin
  update public.claim_packets set packet_hash = pg_temp.sha(pg_temp.canon(claim_id));
  update public.claims set status = 'ready' where lawsuit_id = '10000000-0000-4000-8000-000000000047';
  t_sig := pg_temp.sign('c0000000-0000-4000-8000-0000000000a7', 'a0000000-0000-4000-8000-000000000047',
    '70000000-0000-4000-8000-0000000000a7', '90000000-0000-4000-8000-0000000000a7', 'probe-key-47-a');
  r_sig := pg_temp.sign('c0000000-0000-4000-8000-0000000000b7', 'b0000000-0000-4000-8000-000000000047',
    '70000000-0000-4000-8000-0000000000b7', '90000000-0000-4000-8000-0000000000b7', 'probe-key-47-b');

  -- The leftover: a test signature with no job. The real enqueue is refused at commit
  -- (forced here with SET CONSTRAINTS) and leaves nothing behind.
  perform pg_temp.expect_error(format($q$
    do $i$ begin
      perform public.filing_enqueue(%L, 'administrator_email', null, now() + interval '1 day');
      set constraints public.claim_filing_jobs_test_packet immediate;
    end $i$ $q$, t_sig), 'CM013');
  if exists (select 1 from public.claim_filing_jobs where signature_id = t_sig)
     or (select status::text from public.claims where id = 'c0000000-0000-4000-8000-0000000000a7') <> 'signed' then
    raise exception 'a refused real enqueue must leave no job and the claim signed';
  end if;

  -- filing_enqueue_test still queues it, as a test job.
  r := public.filing_enqueue_test(t_sig, 'administrator_email', null, now() + interval '1 day');
  set constraints public.claim_filing_jobs_test_packet immediate;
  set constraints public.claim_filing_jobs_test_packet deferred;
  if not (r ->> 'created')::boolean or not (r -> 'job' ->> 'is_test')::boolean then
    raise exception 'filing_enqueue_test must still queue a test packet as a test job: %', r;
  end if;

  -- A real packet still gets a real job.
  r := public.filing_enqueue(r_sig, 'administrator_email', null, now() + interval '1 day');
  set constraints public.claim_filing_jobs_test_packet immediate;
  set constraints public.claim_filing_jobs_test_packet deferred;
  if (r -> 'job' ->> 'is_test')::boolean then
    raise exception 'a real packet must still get a real job: %', r;
  end if;
end $$;
reset role;

\echo '  3 the guard functions are not callable by API roles'
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_filing_jobs_test_packet()', 'execute')
     or has_function_privilege('anon', 'public.claim_packets_test_guard()', 'execute') then
    raise exception '0047 trigger functions must not be executable by API roles';
  end if;
end $$;

rollback;
\o
