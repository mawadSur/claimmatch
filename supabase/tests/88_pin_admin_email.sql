-- Columns and RPCs added by 0056_pin_admin_email.sql.
-- PIN-gated email-to-administrator + 7-day paper-form fallback.
-- Writes stay on service_role. Guests never write these columns.
-- No new tables (10_rls_basics comment only).
\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000056', 'pin-admin-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000056',
  'pin-admin-email-test-settlement',
  'PIN admin email test'
)
on conflict (id) do nothing;

\echo '  1 claims PIN-admin and paper-fallback columns exist'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'claims' and column_name = 'pin_admin_email_requested_at'
  ) then
    raise exception '0056: claims.pin_admin_email_requested_at is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'claims' and column_name = 'pin_admin_email_sent_at'
  ) then
    raise exception '0056: claims.pin_admin_email_sent_at is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'claims' and column_name = 'paper_fallback_at'
  ) then
    raise exception '0056: claims.paper_fallback_at is missing';
  end if;
end $$;

\echo '  2 claim_request_pin_admin_email creates the claim and stamps the request'
do $$
declare
  v jsonb;
begin
  v := public.claim_request_pin_admin_email(
    'a0000000-0000-4000-8000-000000000056',
    '10000000-0000-4000-8000-000000000056'
  );
  if v->>'pin_admin_email_requested_at' is null then
    raise exception '0056: claim_request_pin_admin_email did not set pin_admin_email_requested_at';
  end if;
  if v->>'requested_notice_at' is null then
    raise exception '0056: claim_request_pin_admin_email did not set requested_notice_at';
  end if;
  if v->>'status' is distinct from 'self_file' then
    raise exception '0056: new claim was not self_file';
  end if;
  if v->>'pin_admin_email_sent_at' is not null then
    raise exception '0056: request RPC must not stamp sent_at';
  end if;
end $$;

\echo '  3 a second request keeps the original timestamp'
do $$
declare
  first timestamptz;
  second timestamptz;
begin
  select pin_admin_email_requested_at into first from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  perform public.claim_request_pin_admin_email(
    'a0000000-0000-4000-8000-000000000056',
    '10000000-0000-4000-8000-000000000056'
  );
  select pin_admin_email_requested_at into second from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  if first is distinct from second then
    raise exception '0056: second request overwrote pin_admin_email_requested_at';
  end if;
end $$;

\echo '  4 claim_record_pin_admin_email_sent stamps sent_at only with a provider id'
do $$
declare
  v_id uuid;
  v jsonb;
begin
  select id into v_id from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  v := public.claim_record_pin_admin_email_sent(
    'a0000000-0000-4000-8000-000000000056',
    v_id,
    '',
    'queued'
  );
  if v->>'pin_admin_email_sent_at' is not null then
    raise exception '0056: empty provider_id stamped sent_at';
  end if;
  v := public.claim_record_pin_admin_email_sent(
    'a0000000-0000-4000-8000-000000000056',
    v_id,
    're_test_1',
    null
  );
  if v->>'pin_admin_email_sent_at' is null then
    raise exception '0056: provider_id did not stamp sent_at';
  end if;
  if v->>'pin_admin_email_provider_id' is distinct from 're_test_1' then
    raise exception '0056: provider_id was not stored';
  end if;
end $$;

\echo '  5 a second send is idempotent'
do $$
declare
  v_id uuid;
  first timestamptz;
  second timestamptz;
begin
  select id, pin_admin_email_sent_at into v_id, first from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  perform public.claim_record_pin_admin_email_sent(
    'a0000000-0000-4000-8000-000000000056',
    v_id,
    're_test_2',
    null
  );
  select pin_admin_email_sent_at into second from public.claims where id = v_id;
  if first is distinct from second then
    raise exception '0056: second send overwrote pin_admin_email_sent_at';
  end if;
end $$;

\echo '  6 claim_record_paper_fallback is idempotent and skips a notice_id'
do $$
declare
  v_id uuid;
  v jsonb;
  first timestamptz;
  second timestamptz;
begin
  select id into v_id from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  v := public.claim_record_paper_fallback(
    'a0000000-0000-4000-8000-000000000056',
    v_id
  );
  if v->>'paper_fallback_at' is null then
    raise exception '0056: paper fallback was not stamped';
  end if;
  first := (v->>'paper_fallback_at')::timestamptz;
  v := public.claim_record_paper_fallback(
    'a0000000-0000-4000-8000-000000000056',
    v_id
  );
  second := (v->>'paper_fallback_at')::timestamptz;
  if first is distinct from second then
    raise exception '0056: second paper fallback overwrote paper_fallback_at';
  end if;

  update public.claims set paper_fallback_at = null, notice_id = 'N-1' where id = v_id;
  v := public.claim_record_paper_fallback(
    'a0000000-0000-4000-8000-000000000056',
    v_id
  );
  if v->>'paper_fallback_at' is not null then
    raise exception '0056: paper fallback stamped after a notice ID';
  end if;
end $$;

\echo '  7 paper_fallback drip kind is unique per claim'
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  insert into public.drip_email_sends (user_id, kind, claim_id)
  values (
    'a0000000-0000-4000-8000-000000000056',
    'paper_fallback',
    v_id
  );
  begin
    insert into public.drip_email_sends (user_id, kind, claim_id)
    values (
      'a0000000-0000-4000-8000-000000000056',
      'paper_fallback',
      v_id
    );
    raise exception '0056: paper_fallback accepted a duplicate user+claim';
  exception
    when unique_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000056',
      'paper_fallback'
    );
    raise exception '0056: paper_fallback accepted a null claim_id';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  8 API roles cannot execute the PIN-admin RPCs'
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000056'
     and lawsuit_id = '10000000-0000-4000-8000-000000000056';
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000056';
    perform public.claim_request_pin_admin_email(
      'a0000000-0000-4000-8000-000000000056',
      '10000000-0000-4000-8000-000000000056'
    );
    raise exception '0056: authenticated ran claim_request_pin_admin_email';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '0056: authenticated ran%' then raise;
      end if;
  end;
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000056';
    perform public.claim_record_paper_fallback(
      'a0000000-0000-4000-8000-000000000056',
      v_id
    );
    raise exception '0056: authenticated ran claim_record_paper_fallback';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '0056: authenticated ran%' then raise;
      end if;
  end;
end $$;

rollback;
