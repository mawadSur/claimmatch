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

  update public.lawsuits
     set third_party_fee_status = 'allowed'
   where id = '10000000-0000-4000-8000-000000000001';
  select third_party_fee_allowed into allowed
    from public.lawsuits
   where id = '10000000-0000-4000-8000-000000000001';
  if allowed is not true then
    raise exception '0023: allowed status did not set third_party_fee_allowed';
  end if;
  update public.lawsuits
     set third_party_fee_status = 'unknown'
   where id = '10000000-0000-4000-8000-000000000001';
end $$;
