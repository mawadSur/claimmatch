-- Columns and write rules added by 0013_verified_fields.sql.
-- Anon may read verified columns on published rows. No API role may write them.
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- 1. Columns and the proof_verified check exist.
-- ---------------------------------------------------------------------------
\echo '  1 0013 columns and proof_verified check'
do $$
declare
  missing text;
begin
  select string_agg(col, ', ' order by col) into missing
  from (values
    ('verified_at'),
    ('verified_by'),
    ('eligibility_verified'),
    ('proof_verified'),
    ('form_field_order')
  ) v(col)
  where not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'lawsuits'
       and column_name = v.col
  );
  if missing is not null then
    raise exception '0013: lawsuits is missing column(s): %', missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'lawsuits'
       and column_name = 'form_field_order'
       and data_type = 'ARRAY'
  ) then
    raise exception '0013: form_field_order must be text[]';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'lawsuits_proof_verified_check'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    raise exception '0013: lawsuits_proof_verified_check is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. proof_verified accepts the four values and rejects anything else.
-- ---------------------------------------------------------------------------
\echo '  2 proof_verified check'
insert into public.lawsuits (slug, title, proof_verified)
values ('verified-fields-proof-ok', 'Proof ok', 'optional');
do $$
begin
  begin
    insert into public.lawsuits (slug, title, proof_verified)
    values ('verified-fields-proof-bad', 'Proof bad', 'maybe');
    raise exception '0013: proof_verified accepted a value outside yes/no/optional/unknown';
  exception
    when check_violation then
      null;
  end;
end $$;
delete from public.lawsuits where slug like 'verified-fields-proof-%';

-- ---------------------------------------------------------------------------
-- 3. New columns start null. Anon reads them on published rows.
-- ---------------------------------------------------------------------------
\echo '  3 anon reads verified columns on published rows'
begin;
insert into auth.users (id, email)
values ('d0000000-0000-4000-8000-00000000000d', 'verified-fields-admin@example.test')
on conflict (id) do nothing;
insert into public.lawsuits (
  id, slug, title, status, review_status, deadline,
  eligibility_verified, proof_verified, administrator, verified_at, verified_by
) values (
  '10000000-0000-4000-8000-000000000013',
  'verified-fields-published',
  'Verified fields published',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 30,
  'US residents who bought the product.',
  'no',
  'Example Admin Co',
  now(),
  'd0000000-0000-4000-8000-00000000000d'
);
insert into public.lawsuits (id, slug, title, status, review_status, deadline)
values (
  '10000000-0000-4000-8000-000000000014',
  'verified-fields-draft',
  'Verified fields draft',
  'open'::lawsuit_status,
  'draft'::review_status,
  current_date + 30
);

set local role anon;
do $$
declare
  seen text;
  who text;
  proof text;
  stamped timestamptz;
begin
  select slug, eligibility_verified, proof_verified, verified_at
    into seen, who, proof, stamped
    from public.lawsuits
   where slug = 'verified-fields-published';
  if seen is distinct from 'verified-fields-published' then
    raise exception '0013: anon should read the published verified row';
  end if;
  if who is distinct from 'US residents who bought the product.'
     or proof is distinct from 'no'
     or stamped is null then
    raise exception '0013: anon should see verified columns on published rows';
  end if;

  if exists (select 1 from public.lawsuits where slug = 'verified-fields-draft') then
    raise exception '0013: anon must not read the draft row';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. Anon and authenticated cannot set verification (catalog stays protected).
-- ---------------------------------------------------------------------------
\echo '  4 no API role can write verified columns'
begin;
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000013', 'verified-fields-user@example.test')
on conflict (id) do nothing;
insert into public.lawsuits (id, slug, title, status, review_status, deadline)
values (
  '10000000-0000-4000-8000-000000000015',
  'verified-fields-write-probe',
  'Verified fields write probe',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 30
);

set local role anon;
do $$
declare
  n bigint;
begin
  begin
    update public.lawsuits
       set verified_at = now(),
           eligibility_verified = 'changed by anon'
     where slug = 'verified-fields-write-probe';
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := null;
  end;
  if n <> 0 then
    raise exception '0013: anon changed % verified row(s)', n;
  end if;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000013';
do $$
declare
  n bigint;
begin
  begin
    update public.lawsuits
       set verified_at = now(),
           verified_by = 'a0000000-0000-4000-8000-000000000013',
           proof_verified = 'yes'
     where slug = 'verified-fields-write-probe';
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    n := null;
  end;
  if n <> 0 then
    raise exception '0013: authenticated user changed % verified row(s)', n;
  end if;
end $$;

reset role;
do $$
begin
  if exists (
    select 1 from public.lawsuits
     where slug = 'verified-fields-write-probe'
       and (verified_at is not null
            or eligibility_verified is not null
            or proof_verified is not null)
  ) then
    raise exception '0013: verified columns were written without the admin API';
  end if;
end $$;
rollback;
