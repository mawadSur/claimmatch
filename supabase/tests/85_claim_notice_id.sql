-- Columns and RPCs added by 0052_claim_notice_id.sql.
-- notice_id lives on claims (per claim), never on claim_profiles.
-- Writes stay on service_role. No new tables (10_rls_basics unchanged).
\set ON_ERROR_STOP 1

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000052', 'notice-id-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000052',
  'notice-id-test-settlement',
  'Notice ID test'
)
on conflict (id) do nothing;

\echo '  1 claims.notice_id exists and is length-capped'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'claims' and column_name = 'notice_id'
  ) then
    raise exception '0052: claims.notice_id is missing';
  end if;
end $$;

do $$
begin
  begin
    insert into public.claims (user_id, lawsuit_id, lawsuit_title, status, notice_id)
    values (
      'a0000000-0000-4000-8000-000000000052',
      '10000000-0000-4000-8000-000000000052',
      'Notice ID test',
      'self_file',
      repeat('x', 81)
    );
    raise exception '0052: notice_id length check accepted 81 chars';
  exception when check_violation then
    null;
  end;
end $$;

\echo '  2 claim_set_notice_id creates the claim and stores the ID'
do $$
declare
  v jsonb;
begin
  v := public.claim_set_notice_id(
    'a0000000-0000-4000-8000-000000000052',
    '10000000-0000-4000-8000-000000000052',
    '  ABC-99  '
  );
  if v->>'notice_id' is distinct from 'ABC-99' then
    raise exception '0052: claim_set_notice_id did not save the trimmed ID';
  end if;
  if v->>'status' is distinct from 'self_file' then
    raise exception '0052: new claim was not self_file';
  end if;
end $$;

\echo '  3 claim_apply_change can update notice_id'
do $$
declare
  v jsonb;
  c uuid;
begin
  select id into c from public.claims
   where user_id = 'a0000000-0000-4000-8000-000000000052'
     and lawsuit_id = '10000000-0000-4000-8000-000000000052';
  v := public.claim_apply_change(c, 'a0000000-0000-4000-8000-000000000052', 'self_file',
                                 '{"notice_id":"XYZ-1"}', 'user', '{}');
  if v->>'notice_id' is distinct from 'XYZ-1' then
    raise exception '0052: claim_apply_change did not update notice_id';
  end if;
end $$;

\echo '  4 API roles cannot execute claim_set_notice_id'
do $$
begin
  begin
    set local role authenticated;
    set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000052';
    perform public.claim_set_notice_id(
      'a0000000-0000-4000-8000-000000000052',
      '10000000-0000-4000-8000-000000000052',
      'SHOULD-FAIL'
    );
    raise exception '0052: authenticated ran claim_set_notice_id';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '0052: authenticated ran%' then raise;
      end if;
  end;
end $$;

rollback;
