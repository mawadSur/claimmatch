-- Columns added by 0020_soft_launch.sql.
\set ON_ERROR_STOP 1

\echo '  1 0020 is_internal and cohort'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'is_internal'
  ) then
    raise exception '0020: profiles.is_internal is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'cohort'
  ) then
    raise exception '0020: profiles.cohort is missing';
  end if;
end $$;
