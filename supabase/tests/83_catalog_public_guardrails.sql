-- Columns added by 0050_catalog_public_guardrails.sql.
\set ON_ERROR_STOP 1

\echo '  1 0050 is_test and deadline_override columns'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'is_test'
  ) then
    raise exception '0050: lawsuits.is_test is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'deadline_override'
  ) then
    raise exception '0050: lawsuits.deadline_override is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'deadline_override_note'
  ) then
    raise exception '0050: lawsuits.deadline_override_note is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'deadline_override_at'
  ) then
    raise exception '0050: lawsuits.deadline_override_at is missing';
  end if;
end $$;

\echo '  2 0050 is_test defaults false and override is nullable'
do $$
declare
  test_default text;
  override_nullable text;
begin
  select column_default::text into test_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lawsuits' and column_name = 'is_test';
  if test_default is null or position('false' in test_default) = 0 then
    raise exception '0050: lawsuits.is_test must default false, got %', test_default;
  end if;
  select is_nullable into override_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lawsuits' and column_name = 'deadline_override';
  if override_nullable <> 'YES' then
    raise exception '0050: lawsuits.deadline_override must be nullable';
  end if;
end $$;
