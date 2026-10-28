-- Columns added by 0022_payout_reports.sql. Users still cannot write recoveries.
\set ON_ERROR_STOP 1

\echo '  1 0022 recoveries source columns'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'recoveries'
       and column_name = 'source'
  ) then
    raise exception '0022: recoveries.source is missing';
  end if;
end $$;

\echo '  2 authenticated cannot insert recoveries'
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
  do $$
  declare
    n bigint;
  begin
    begin
      insert into public.recoveries (user_id, claim_id, source, fee_pct)
      values (
        'a0000000-0000-4000-8000-00000000000a',
        'c0000000-0000-4000-8000-00000000000a',
        'user_reported',
        0
      );
      get diagnostics n = row_count;
      if n > 0 then
        raise exception '0022: authenticated inserted a recovery';
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end $$;
rollback;
