-- Table added by 0024_account_deletion.sql.
\set ON_ERROR_STOP 1

\echo '  1 0024 audit table exists and API roles cannot read it'
do $$
begin
  if to_regclass('public.account_deletion_audit') is null then
    raise exception '0024: account_deletion_audit is missing';
  end if;
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
  do $$
  begin
    begin
      perform count(*) from public.account_deletion_audit;
      raise exception '0024: authenticated could read account_deletion_audit';
    exception when insufficient_privilege then
      null;
    end;
  end $$;
rollback;
