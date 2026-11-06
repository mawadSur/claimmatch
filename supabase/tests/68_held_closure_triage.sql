-- Held-closure triage table and widened decisions from 0029.
\set ON_ERROR_STOP 1

\echo '  1 site-check table and widened decision/source checks'
do $$
begin
  if to_regclass('public.held_closure_site_checks') is null then
    raise exception '0029: held_closure_site_checks is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'held_closure_decisions'
       and column_name = 'source'
  ) then
    raise exception '0029: held_closure_decisions.source is missing';
  end if;
end $$;

insert into public.held_closure_site_checks (slug, http_status, signal)
values ('held-triage-test', 404, 'gone');

insert into public.held_closure_decisions (slug, decision, change_fingerprint, source)
values ('held-triage-auto', 'auto_closed', 'status open -> closed', 'auto_past_deadline');

do $$
begin
  begin
    insert into public.held_closure_site_checks (slug, signal)
    values ('held-bad-signal', 'open');
    raise exception '0029: accepted an unknown site signal';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.held_closure_decisions (slug, decision, change_fingerprint, source)
    values ('held-bad-source', 'approved', 'x', 'cron');
    raise exception '0029: accepted an unknown decision source';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.held_closure_decisions (slug, decision, change_fingerprint)
    values ('held-bad-decision', 'auto', 'x');
    raise exception '0029: accepted an unknown decision';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot access held_closure_site_checks'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.held_closure_site_checks', 'select')
     or has_table_privilege('anon', 'public.held_closure_site_checks', 'insert') then
    raise exception '0029: anon must not access held_closure_site_checks';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
begin
  if has_table_privilege('authenticated', 'public.held_closure_site_checks', 'select')
     or has_table_privilege('authenticated', 'public.held_closure_site_checks', 'insert') then
    raise exception '0029: authenticated must not access held_closure_site_checks';
  end if;
end $$;
rollback;

delete from public.held_closure_site_checks where slug = 'held-triage-test';
delete from public.held_closure_decisions where slug = 'held-triage-auto';
