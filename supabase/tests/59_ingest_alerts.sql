-- Ingest alerts from 0019_ingest_alerts.sql.
\set ON_ERROR_STOP 1

\echo '  1 table and reason check'
do $$
begin
  if to_regclass('public.ingest_alerts') is null then
    raise exception '0019: ingest_alerts is missing';
  end if;
end $$;

insert into public.ingest_alerts (job, reason, error)
values ('daily', 'failed', 'feed timed out');

do $$
begin
  begin
    insert into public.ingest_alerts (job, reason)
    values ('daily', 'timeout');
    raise exception '0019: accepted an unknown alert reason';
  exception
    when check_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot access ingest_alerts'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.ingest_alerts', 'select')
     or has_table_privilege('anon', 'public.ingest_alerts', 'insert') then
    raise exception '0019: anon must not access ingest_alerts';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
begin
  if has_table_privilege('authenticated', 'public.ingest_alerts', 'select')
     or has_table_privilege('authenticated', 'public.ingest_alerts', 'insert') then
    raise exception '0019: authenticated must not access ingest_alerts';
  end if;
end $$;
rollback;

delete from public.ingest_alerts where job = 'daily' and error = 'feed timed out';
