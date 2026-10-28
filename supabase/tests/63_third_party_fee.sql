-- Columns added by 0023_third_party_fee.sql.
\set ON_ERROR_STOP 1

\echo '  1 0023 fee status and generated allowed flag'
do $$
declare
  allowed boolean;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'third_party_fee_status'
  ) then
    raise exception '0023: lawsuits.third_party_fee_status is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'third_party_fee_allowed'
  ) then
    raise exception '0023: lawsuits.third_party_fee_allowed is missing';
  end if;

  -- Own row: the 10_rls_basics fixtures are rolled back and do not exist here.
  insert into public.lawsuits (id, slug, title)
  values ('63000000-0000-4000-8000-000000000063', 'fee-test-63', 'Fee test 63');
  if (select third_party_fee_status from public.lawsuits
       where id = '63000000-0000-4000-8000-000000000063') <> 'unknown'
     or (select third_party_fee_allowed from public.lawsuits
       where id = '63000000-0000-4000-8000-000000000063') is not false then
    raise exception '0023: new lawsuit must default to unknown / not allowed';
  end if;
  update public.lawsuits
     set third_party_fee_status = 'allowed'
   where id = '63000000-0000-4000-8000-000000000063';
  select third_party_fee_allowed into allowed
    from public.lawsuits
   where id = '63000000-0000-4000-8000-000000000063';
  if allowed is not true then
    raise exception '0023: allowed status did not set third_party_fee_allowed';
  end if;
  delete from public.lawsuits where id = '63000000-0000-4000-8000-000000000063';
end $$;
