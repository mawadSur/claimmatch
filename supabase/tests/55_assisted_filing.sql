-- Columns and RLS added by 0015_assisted_filing.sql.
\set ON_ERROR_STOP 1

\echo '  1 0015 allowlist column and tables'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'assisted_filing_allowed'
  ) then
    raise exception '0015: lawsuits.assisted_filing_allowed is missing';
  end if;
  if to_regclass('public.claim_authorizations') is null then
    raise exception '0015: claim_authorizations is missing';
  end if;
  if to_regclass('public.filing_jobs') is null then
    raise exception '0015: filing_jobs is missing';
  end if;
end $$;

insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000015', 'filing-user@example.test')
on conflict (id) do nothing;
insert into public.lawsuits (id, slug, title, status, review_status, deadline, assisted_filing_allowed)
values (
  '10000000-0000-4000-8000-000000000017',
  'assisted-filing-published',
  'Assisted filing published',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 30,
  false
)
on conflict (id) do nothing;
insert into public.claims (id, user_id, lawsuit_id, lawsuit_title)
values (
  'c0000000-0000-4000-8000-000000000015',
  'a0000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000017',
  'Assisted filing published'
)
on conflict (id) do nothing;

insert into public.claim_authorizations (claim_id, user_id, lawsuit_id, text_version, full_text)
values (
  'c0000000-0000-4000-8000-000000000015',
  'a0000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000017',
  'v1',
  'test authorization text'
);

insert into public.filing_jobs (claim_id, user_id, lawsuit_id, status)
values (
  'c0000000-0000-4000-8000-000000000015',
  'a0000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000017',
  'queued'
);

\echo '  2 allowlist defaults false; filing status check'
do $$
declare
  allowed boolean;
begin
  select assisted_filing_allowed into allowed
    from public.lawsuits
   where id = '10000000-0000-4000-8000-000000000017';
  if allowed is not false then
    raise exception '0015: assisted_filing_allowed should default false';
  end if;

  begin
    insert into public.filing_jobs (claim_id, user_id, lawsuit_id, status)
    values (
      'c0000000-0000-4000-8000-000000000015',
      'a0000000-0000-4000-8000-000000000015',
      '10000000-0000-4000-8000-000000000017',
      'running'
    );
    raise exception '0015: filing_jobs accepted an unknown status';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  3 RLS own-row; anon denied; user cannot insert filing_jobs'
insert into auth.users (id, email)
values ('b0000000-0000-4000-8000-000000000015', 'filing-other@example.test')
on conflict (id) do nothing;

begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.claim_authorizations', 'select')
     or has_table_privilege('anon', 'public.filing_jobs', 'select') then
    raise exception '0015: anon must not read filing tables';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000015';
do $$
declare
  seen int;
  n bigint;
begin
  select count(*) into seen from public.claim_authorizations;
  if seen <> 0 then
    raise exception '0015: user read another authorization';
  end if;
  select count(*) into seen from public.filing_jobs;
  if seen <> 0 then
    raise exception '0015: user read another filing job';
  end if;

  begin
    insert into public.filing_jobs (claim_id, user_id, lawsuit_id, status)
    values (
      'c0000000-0000-4000-8000-000000000015',
      'b0000000-0000-4000-8000-000000000015',
      '10000000-0000-4000-8000-000000000017',
      'queued'
    );
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0015: authenticated inserted a filing_jobs row';
  end if;
end $$;
rollback;

delete from public.filing_jobs where lawsuit_id = '10000000-0000-4000-8000-000000000017';
delete from public.claim_authorizations where lawsuit_id = '10000000-0000-4000-8000-000000000017';
delete from public.claims where id = 'c0000000-0000-4000-8000-000000000015';
delete from public.lawsuits where slug = 'assisted-filing-published';
