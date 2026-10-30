-- Held-closure decisions and ingest alert warning reason from 0026.
\set ON_ERROR_STOP 1

\echo '  1 table, decision check, warning reason'
do $$
begin
  if to_regclass('public.held_closure_decisions') is null then
    raise exception '0026: held_closure_decisions is missing';
  end if;
end $$;

insert into public.held_closure_decisions (slug, decision, change_fingerprint)
values ('held-test-slug', 'dismissed', 'status open -> closed');

insert into public.ingest_alerts (job, reason, error)
values ('daily', 'warning', '12 closures held for review');

do $$
begin
  begin
    insert into public.held_closure_decisions (slug, decision, change_fingerprint)
    values ('held-bad', 'auto', 'x');
    raise exception '0026: accepted an unknown decision';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.ingest_alerts (job, reason)
    values ('daily', 'timeout');
    raise exception '0026: accepted an unknown alert reason';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot access held_closure_decisions'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.held_closure_decisions', 'select')
     or has_table_privilege('anon', 'public.held_closure_decisions', 'insert') then
    raise exception '0026: anon must not access held_closure_decisions';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
begin
  if has_table_privilege('authenticated', 'public.held_closure_decisions', 'select')
     or has_table_privilege('authenticated', 'public.held_closure_decisions', 'insert') then
    raise exception '0026: authenticated must not access held_closure_decisions';
  end if;
end $$;
rollback;

delete from public.held_closure_decisions where slug = 'held-test-slug';
delete from public.ingest_alerts where job = 'daily' and reason = 'warning';
