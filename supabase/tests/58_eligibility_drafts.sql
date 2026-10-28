-- Eligibility rule drafts from 0018_eligibility_drafts.sql.
\set ON_ERROR_STOP 1

\echo '  1 table and pending unique'
do $$
begin
  if to_regclass('public.eligibility_rule_drafts') is null then
    raise exception '0018: eligibility_rule_drafts is missing';
  end if;
end $$;

insert into public.lawsuits (id, slug, title, status, review_status, deadline)
values (
  '10000000-0000-4000-8000-000000000019',
  'eligibility-draft-published',
  'Eligibility draft published',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 40
)
on conflict (id) do nothing;

insert into public.eligibility_rule_drafts (lawsuit_id, eligibility, status)
values (
  '10000000-0000-4000-8000-000000000019',
  '{"requires":["had_data_breach"]}'::jsonb,
  'pending'
);

do $$
begin
  begin
    insert into public.eligibility_rule_drafts (lawsuit_id, eligibility, status)
    values (
      '10000000-0000-4000-8000-000000000019',
      '{"requires":["owns_vehicle"]}'::jsonb,
      'pending'
    );
    raise exception '0018: allowed a second pending draft for one settlement';
  exception
    when unique_violation then
      null;
  end;
end $$;

\echo '  2 API roles cannot read or write drafts'
begin;
set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.eligibility_rule_drafts', 'select')
     or has_table_privilege('anon', 'public.eligibility_rule_drafts', 'insert') then
    raise exception '0018: anon must not access eligibility_rule_drafts';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';
do $$
begin
  if has_table_privilege('authenticated', 'public.eligibility_rule_drafts', 'select')
     or has_table_privilege('authenticated', 'public.eligibility_rule_drafts', 'insert') then
    raise exception '0018: authenticated must not access eligibility_rule_drafts';
  end if;
end $$;
rollback;

delete from public.eligibility_rule_drafts where lawsuit_id = '10000000-0000-4000-8000-000000000019';
delete from public.lawsuits where slug = 'eligibility-draft-published';
