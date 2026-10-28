-- Administrator registry from 0016_administrators.sql.
\set ON_ERROR_STOP 1

\echo '  1 registry seed and filing_method check'
do $$
declare
  n int;
begin
  if to_regclass('public.administrators') is null then
    raise exception '0016: administrators is missing';
  end if;
  select count(*) into n from public.administrators
   where slug in ('epiq', 'kroll', 'jnd', 'angeion');
  if n < 4 then
    raise exception '0016: expected seeded administrators, found %', n;
  end if;
  if exists (select 1 from public.administrators where filing_method <> 'manual') then
    raise exception '0016: seed rows must stay on filing_method = manual';
  end if;

  begin
    insert into public.administrators (slug, name, filing_method)
    values ('bad-method', 'Bad', 'fax');
    raise exception '0016: accepted an unknown filing_method';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot write the registry'
begin;
set local role anon;
do $$
declare
  n bigint := 0;
begin
  begin
    insert into public.administrators (slug, name) values ('evil', 'Evil');
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0016: anon inserted an administrator';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
declare
  n bigint := 0;
begin
  begin
    update public.administrators set filing_method = 'api';
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0016: authenticated updated administrators';
  end if;
  if not exists (select 1 from public.administrators where slug = 'epiq') then
    raise exception '0016: authenticated should read enabled administrators';
  end if;
end $$;
rollback;
