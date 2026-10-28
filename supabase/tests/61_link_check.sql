-- Columns added by 0021_link_check.sql.
\set ON_ERROR_STOP 1

\echo '  1 0021 link check columns'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'link_status'
  ) then
    raise exception '0021: lawsuits.link_status is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'link_checked_at'
  ) then
    raise exception '0021: lawsuits.link_checked_at is missing';
  end if;
end $$;
