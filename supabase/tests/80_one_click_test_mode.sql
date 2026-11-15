-- One-click test mode (0046): test jobs, filing_enqueue_test and the is_test
-- guard. One transaction, rolled back at the end. Fixture ids end in 46.
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
                '"format":"claimmatch.packet.v1","lawsuit_id":"10000000-0000-4000-8000-000000000046",'
                '"spec":{"id":"50000000-0000-4000-8000-000000000046","version":1}}',
                pg_temp.sha('I declare under penalty of perjury that the above is true.'), p_claim,
                pg_temp.sha('All persons who bought the product.'))
$$;
create function pg_temp.sign(p_claim uuid, p_user uuid, p_packet uuid, p_consent uuid, p_key text)
returns uuid language sql as $$
  select (public.filing_sign_packet(p_claim, p_user, p_packet, pg_temp.sha(pg_temp.canon(p_claim)),
    pg_temp.canon(p_claim), '50000000-0000-4000-8000-000000000046',
    'I declare under penalty of perjury that the above is true.', 'agent-auth-test',
    'I authorize Lawsuit AI to submit this one claim for me.', 'Test Member', 'administrator_email', p_consent,
    'password', now() - interval '2 minutes', 'session-46', '203.0.113.7', 'probe', p_key) -> 'signature' ->> 'id')::uuid
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000046', 'occ-tester@example.test'),
  ('b0000000-0000-4000-8000-000000000046', 'occ-real@example.test'),
  ('e0000000-0000-4000-8000-000000000046', 'occ-reviewer46@example.test');
insert into public.lawsuits (id, slug, title, status, review_status, deadline) values
  ('10000000-0000-4000-8000-000000000046', 'occ-test-mode', 'TEST settlement',
   'open'::lawsuit_status, 'published'::review_status, current_date + 60);
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status) values
  ('c0000000-0000-4000-8000-0000000000a6', 'a0000000-0000-4000-8000-000000000046',
   '10000000-0000-4000-8000-000000000046', 'TEST settlement', 'preparing'),
  ('c0000000-0000-4000-8000-0000000000b6', 'b0000000-0000-4000-8000-000000000046',
   '10000000-0000-4000-8000-000000000046', 'TEST settlement', 'preparing');
insert into public.staff_roles (user_id, role) values ('e0000000-0000-4000-8000-000000000046', 'legal_reviewer');
insert into public.filing_specs (id, lawsuit_id, version, content) values
  ('50000000-0000-4000-8000-000000000046', '10000000-0000-4000-8000-000000000046', 1,
   '{"attestation": {"text": "I declare under penalty of perjury that the above is true."},
     "class_definition": {"text": "All persons who bought the product.", "source_url": "https://official.example.test/notice"},
     "official_form": {"url": "https://official.example.test/claim"}}');
select public.filing_approve_spec('50000000-0000-4000-8000-000000000046',
  'e0000000-0000-4000-8000-000000000046', 'Test spec.', '[{"kind": "claim_form"}]');
insert into public.claim_packets (id, claim_id, user_id, lawsuit_id, spec_id, spec_version, answers) values
  ('70000000-0000-4000-8000-0000000000a6', 'c0000000-0000-4000-8000-0000000000a6',
   'a0000000-0000-4000-8000-000000000046', '10000000-0000-4000-8000-000000000046',
   '50000000-0000-4000-8000-000000000046', 1, '{}'),
  ('70000000-0000-4000-8000-0000000000b6', 'c0000000-0000-4000-8000-0000000000b6',
   'b0000000-0000-4000-8000-000000000046', '10000000-0000-4000-8000-000000000046',
   '50000000-0000-4000-8000-000000000046', 1, '{}');
insert into public.esign_consents (id, user_id, text_version, full_text, text_sha256) values
  ('90000000-0000-4000-8000-0000000000a6', 'a0000000-0000-4000-8000-000000000046', 'esign-test', 'I agree.',
   pg_temp.sha('I agree.')),
  ('90000000-0000-4000-8000-0000000000b6', 'b0000000-0000-4000-8000-000000000046', 'esign-test', 'I agree.',
   pg_temp.sha('I agree.'));

\echo '  1 columns default to a real job and batch; the new function is service-role only'
do $$
begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'claim_filing_jobs' and column_name = 'is_test') <> 'false' then
    raise exception 'claim_filing_jobs.is_test must default to false';
  end if;
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'filing_export_batches' and column_name = 'is_test') <> 'false' then
    raise exception 'filing_export_batches.is_test must default to false';
  end if;
  if has_function_privilege('authenticated', 'public.filing_enqueue_test(uuid, text, uuid, timestamptz, timestamptz, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.filing_enqueue_test(uuid, text, uuid, timestamptz, timestamptz, text, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.filing_enqueue_test(uuid, text, uuid, timestamptz, timestamptz, text, jsonb)', 'execute') then
    raise exception 'filing_enqueue_test must be executable by the service role only';
  end if;
end $$;

\echo '  2 filing_enqueue_test queues a marked job; filing_enqueue stays real; a test job stays a test job'
set local role service_role;
do $$
declare
  t_sig uuid;
  r_sig uuid;
  t_job uuid;
  r_job uuid;
  r jsonb;
begin
  update public.claim_packets set packet_hash = pg_temp.sha(pg_temp.canon(claim_id));
  update public.claims set status = 'ready' where lawsuit_id = '10000000-0000-4000-8000-000000000046';
  t_sig := pg_temp.sign('c0000000-0000-4000-8000-0000000000a6', 'a0000000-0000-4000-8000-000000000046',
    '70000000-0000-4000-8000-0000000000a6', '90000000-0000-4000-8000-0000000000a6', 'probe-key-46-a');
  r_sig := pg_temp.sign('c0000000-0000-4000-8000-0000000000b6', 'b0000000-0000-4000-8000-000000000046',
    '70000000-0000-4000-8000-0000000000b6', '90000000-0000-4000-8000-0000000000b6', 'probe-key-46-b');

  r := public.filing_enqueue_test(t_sig, 'administrator_email', null, now() + interval '1 day');
  t_job := (r -> 'job' ->> 'id')::uuid;
  if not (r ->> 'created')::boolean or not (r -> 'job' ->> 'is_test')::boolean
     or not (select is_test from public.claim_filing_jobs where id = t_job)
     or (select status::text from public.claims where id = 'c0000000-0000-4000-8000-0000000000a6') <> 'queued' then
    raise exception 'filing_enqueue_test must queue the claim with a job marked is_test: %', r;
  end if;
  r := public.filing_enqueue_test(t_sig, 'administrator_email', null, null);
  if (r ->> 'created')::boolean or (r -> 'job' ->> 'id')::uuid <> t_job then
    raise exception 'filing_enqueue_test must be idempotent per signature';
  end if;

  r_job := (public.filing_enqueue(r_sig, 'administrator_email', null, now() + interval '1 day') -> 'job' ->> 'id')::uuid;
  if (select is_test from public.claim_filing_jobs where id = r_job) then
    raise exception 'filing_enqueue must still create a real job';
  end if;
  -- The same signature through the test function never turns its real job into a test job.
  perform pg_temp.expect_error(format($q$select public.filing_enqueue_test(%L, 'administrator_email', null, null)$q$, r_sig), 'CM013');

  perform pg_temp.expect_error(format($q$update public.claim_filing_jobs set is_test = false where id = %L$q$, t_job), 'CM013');
  -- Once tried, a real job can no longer be marked as a test job.
  perform public.filing_job_claim_next('administrator_email', 'worker:test-46', 'system', r_job, 15);
  perform pg_temp.expect_error(format($q$update public.claim_filing_jobs set is_test = true where id = %L$q$, r_job), 'CM013');
end $$;
reset role;

rollback;
\o
