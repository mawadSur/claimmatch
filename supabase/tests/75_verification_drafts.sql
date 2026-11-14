-- Verification drafts from 0037_verification_drafts.sql.
\set ON_ERROR_STOP 1

\echo '  1 table, checks, and pending unique'
do $$
begin
  if to_regclass('public.verification_drafts') is null then
    raise exception '0037: verification_drafts is missing';
  end if;
end $$;

insert into public.lawsuits (id, slug, title, status, review_status, deadline)
values (
  '10000000-0000-4000-8000-000000000037',
  'verification-draft-published',
  'Verification draft published',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 40
)
on conflict (id) do nothing;

insert into public.verification_drafts (
  lawsuit_id, source_url, status, claims_status, deadline,
  eligibility_verified, proof_verified, administrator, evidence, extractor
)
values (
  '10000000-0000-4000-8000-000000000037',
  'https://example.test/claim',
  'pending',
  'open',
  current_date + 40,
  'US residents who bought the product.',
  'no',
  'Example Admin Co',
  '{"deadline":{"quote":"Claims must be submitted by May 1, 2027","source_url":"https://example.test/claim"}}'::jsonb,
  'heuristic'
);

do $$
begin
  begin
    insert into public.verification_drafts (lawsuit_id, status)
    values ('10000000-0000-4000-8000-000000000037', 'pending');
    raise exception '0037: allowed a second pending draft for one settlement';
  exception
    when unique_violation then
      null;
  end;
end $$;

do $$
begin
  begin
    insert into public.verification_drafts (lawsuit_id, status, claims_status)
    values ('10000000-0000-4000-8000-000000000037', 'failed', 'maybe');
    raise exception '0037: accepted an unknown claims_status';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.verification_drafts (lawsuit_id, status, proof_verified)
    values ('10000000-0000-4000-8000-000000000037', 'failed', 'maybe');
    raise exception '0037: accepted an unknown proof_verified';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.verification_drafts (lawsuit_id, status)
    values ('10000000-0000-4000-8000-000000000037', 'auto');
    raise exception '0037: accepted an unknown draft status';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot read or write drafts'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.verification_drafts', 'select')
     or has_table_privilege('anon', 'public.verification_drafts', 'insert')
     or has_table_privilege('anon', 'public.verification_drafts', 'update')
     or has_table_privilege('anon', 'public.verification_drafts', 'delete') then
    raise exception '0037: anon must not access verification_drafts';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
begin
  if has_table_privilege('authenticated', 'public.verification_drafts', 'select')
     or has_table_privilege('authenticated', 'public.verification_drafts', 'insert')
     or has_table_privilege('authenticated', 'public.verification_drafts', 'update')
     or has_table_privilege('authenticated', 'public.verification_drafts', 'delete') then
    raise exception '0037: authenticated must not access verification_drafts';
  end if;
end $$;
rollback;

delete from public.verification_drafts where lawsuit_id = '10000000-0000-4000-8000-000000000037';
delete from public.lawsuits where slug = 'verification-draft-published';
