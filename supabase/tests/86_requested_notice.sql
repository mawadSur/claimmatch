-- Columns and RPCs added by 0053_requested_notice.sql.
-- Writes stay on service_role. Guests never write this column.
\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000053', 'notice-req-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000053',
  'notice-request-test-settlement',
  'Notice request test'
)
on conflict (id) do nothing;

\echo '  1 claims.requested_notice_at exists'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'claims' and column_name = 'requested_notice_at'
  ) then
    raise exception '0053: claims.requested_notice_at is missing';
  end if;
end $$;

\echo '  2 claim_mark_notice_requested creates the claim and stamps the time'
do $$
declare
  v jsonb;
begin
  v := public.claim_mark_notice_requested(
    'a0000000-0000-4000-8000-000000000053',
    '10000000-0000-4000-8000-000000000053'
  );
  if v->>'requested_notice_at' is null then
    raise exception '0053: claim_mark_notice_requested did not set requested_notice_at';
  end if;
  if v->>'status' is distinct from 'self_file' then
    raise exception '0053: new claim was not self_file';
  end if;
end $$;

\echo '  3 a second mark keeps the original timestamp'
do $$
declare
  first timestamptz;
  second timestamptz;
begin
  select requested_notice_at into first from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000053'
     and lawsuit_id = '10000000-0000-4000-8000-000000000053';
  perform public.claim_mark_notice_requested(
    'a0000000-0000-4000-8000-000000000053',
    '10000000-0000-4000-8000-000000000053'
  );
  select requested_notice_at into second from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000053'
     and lawsuit_id = '10000000-0000-4000-8000-000000000053';
  if first is distinct from second then
    raise exception '0053: second mark overwrote requested_notice_at';
  end if;
end $$;

\echo '  4 API roles cannot execute claim_mark_notice_requested'
do $$
begin
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000053';
    perform public.claim_mark_notice_requested(
      'a0000000-0000-4000-8000-000000000053',
      '10000000-0000-4000-8000-000000000053'
    );
    raise exception '0053: authenticated ran claim_mark_notice_requested';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '0053: authenticated ran%' then raise;
      end if;
  end;
end $$;

rollback;
