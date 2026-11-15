-- Withdrawn is final (0048, founder decision 2026-11-15): no status change
-- out of withdrawn, through either server function or a direct update. One
-- transaction, rolled back at the end. Fixture ids end in 48.
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

insert into auth.users (id, email) values ('a0000000-0000-4000-8000-000000000048', 'withdrawn-final@example.test');
insert into public.lawsuits (id, slug, title) values
  ('10000000-0000-4000-8000-000000000048', 'withdrawn-final-test', 'Withdrawn final test');

\echo '  1 a self-file claim can be withdrawn, then nothing moves it'
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status) values
  ('c0000000-0000-4000-8000-000000000048', 'a0000000-0000-4000-8000-000000000048',
   '10000000-0000-4000-8000-000000000048', 'Withdrawn final test', 'self_file');
set local role service_role;
do $$
declare
  c constant uuid := 'c0000000-0000-4000-8000-000000000048';
  u constant uuid := 'a0000000-0000-4000-8000-000000000048';
  r jsonb;
  s text;
begin
  r := public.claim_apply_change(c, u, 'self_file', '{"status":"withdrawn"}', 'user', '{}');
  if r ->> 'status' <> 'withdrawn' then raise exception 'withdrawing a self-file claim must still work: %', r; end if;

  -- claim_apply_change to every self-file status.
  foreach s in array array['self_file', 'reported_filed', 'not_reported_filed'] loop
    perform pg_temp.expect_error(format($q$select public.claim_apply_change(%L, %L, 'withdrawn', %L, 'user', '{}')$q$,
      c, u, jsonb_build_object('status', s)), 'CM001');
  end loop;
  perform pg_temp.expect_error(format($q$select public.claim_apply_change(%L, %L, 'withdrawn',
    '{"status":"submitted","confirmation_number":"AB-123"}', 'user', '{}')$q$, c, u), 'CM001');
  -- filing_move_claim to every member-side status.
  foreach s in array array['preparing', 'ready', 'needs_you', 'self_file'] loop
    perform pg_temp.expect_error(format($q$select public.filing_move_claim(%L, %L, %L, 'changed_mind')$q$, c, u, s), 'CM001');
  end loop;
  -- A direct update, to any status.
  foreach s in array array['self_file', 'reported_filed', 'submitted', 'preparing', 'processing'] loop
    perform pg_temp.expect_error(format($q$update public.claims set status = %L, confirmation_number = 'AB-123' where id = %L$q$, s, c), 'CM001');
  end loop;

  -- Withdrawn -> withdrawn stays a no-op, and other columns can still change.
  r := public.filing_move_claim(c, u, 'withdrawn', 'changed_mind');
  if (r ->> 'changed')::boolean then raise exception 'withdrawn -> withdrawn must be a no-op: %', r; end if;
  r := public.claim_apply_change(c, u, 'withdrawn', jsonb_build_object('corrective_notice_answered_at', now()), 'user', '{}');
  if r ->> 'status' <> 'withdrawn' or r ->> 'corrective_notice_answered_at' is null then
    raise exception 'a non-status change on a withdrawn claim must still work: %', r;
  end if;
  if (select status::text from public.claims where id = c) <> 'withdrawn' then
    raise exception 'the claim must still be withdrawn';
  end if;
end $$;
reset role;

\echo '  2 the trigger is in place and server-only'
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'claims_withdrawn_final' and tgrelid = 'public.claims'::regclass and tgenabled <> 'D') then
    raise exception 'claims_withdrawn_final trigger is missing or disabled';
  end if;
  if has_function_privilege('authenticated', 'public.claims_withdrawn_final()', 'execute') then
    raise exception 'authenticated must not execute claims_withdrawn_final';
  end if;
end $$;

\o
rollback;
