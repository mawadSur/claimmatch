-- Columns, uniqueness, and RLS added by 0014_proof_feedback.sql.
-- Authenticated users insert/select their own row only. Anon cannot.
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- 1. Table, check, and unique constraint exist.
-- ---------------------------------------------------------------------------
\echo '  1 0014 table and constraints'
do $$
begin
  if to_regclass('public.proof_feedback') is null then
    raise exception '0014: proof_feedback table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'proof_feedback'
       and column_name = 'answer'
  ) then
    raise exception '0014: proof_feedback.answer is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'proof_feedback_answer_check'
       and conrelid = 'public.proof_feedback'::regclass
  ) then
    raise exception '0014: proof_feedback_answer_check is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Answer check and one-row-per-user uniqueness.
-- ---------------------------------------------------------------------------
\echo '  2 answer check and uniqueness'
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000014', 'proof-feedback-user@example.test')
on conflict (id) do nothing;
insert into public.lawsuits (id, slug, title, status, review_status, deadline)
values (
  '10000000-0000-4000-8000-000000000016',
  'proof-feedback-published',
  'Proof feedback published',
  'open'::lawsuit_status,
  'published'::review_status,
  current_date + 30
)
on conflict (id) do nothing;

insert into public.proof_feedback (lawsuit_id, user_id, answer)
values (
  '10000000-0000-4000-8000-000000000016',
  'a0000000-0000-4000-8000-000000000014',
  'yes'
);

do $$
begin
  begin
    insert into public.proof_feedback (lawsuit_id, user_id, answer)
    values (
      '10000000-0000-4000-8000-000000000016',
      'a0000000-0000-4000-8000-000000000014',
      'maybe'
    );
    raise exception '0014: answer check accepted a value outside yes/no/not_sure';
  exception
    when check_violation then
      null;
    when unique_violation then
      raise exception '0014: unique fired before the answer check';
  end;

  begin
    insert into public.proof_feedback (lawsuit_id, user_id, answer)
    values (
      '10000000-0000-4000-8000-000000000016',
      'a0000000-0000-4000-8000-000000000014',
      'no'
    );
    raise exception '0014: allowed a second row for the same user and settlement';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RLS: own row only; anon denied; cannot insert as someone else.
-- ---------------------------------------------------------------------------
\echo '  3 RLS own-row only'
insert into auth.users (id, email)
values ('b0000000-0000-4000-8000-000000000014', 'proof-feedback-other@example.test')
on conflict (id) do nothing;

begin;
set local role anon;
do $$
declare
  n bigint;
begin
  begin
    insert into public.proof_feedback (lawsuit_id, user_id, answer)
    values (
      '10000000-0000-4000-8000-000000000016',
      'a0000000-0000-4000-8000-000000000014',
      'no'
    );
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0014: anon inserted % proof_feedback row(s)', n;
  end if;
  begin
    if exists (select 1 from public.proof_feedback) then
      raise exception '0014: anon must not read proof_feedback';
    end if;
  exception
    when insufficient_privilege then
      null; -- revoke select from anon is also a pass
  end;
  if has_table_privilege('anon', 'public.proof_feedback', 'select')
     or has_table_privilege('anon', 'public.proof_feedback', 'insert') then
    raise exception '0014: anon still has select or insert on proof_feedback';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000014';
do $$
declare
  n bigint;
  seen int;
begin
  select count(*) into seen from public.proof_feedback;
  if seen <> 0 then
    raise exception '0014: authenticated user read % other row(s)', seen;
  end if;

  begin
    insert into public.proof_feedback (lawsuit_id, user_id, answer)
    values (
      '10000000-0000-4000-8000-000000000016',
      'a0000000-0000-4000-8000-000000000014',
      'no'
    );
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0014: user inserted a row for someone else';
  end if;

  insert into public.proof_feedback (lawsuit_id, user_id, answer)
  values (
    '10000000-0000-4000-8000-000000000016',
    'b0000000-0000-4000-8000-000000000014',
    'not_sure'
  );
  select count(*) into seen from public.proof_feedback;
  if seen <> 1 then
    raise exception '0014: user should see only their own row, saw %', seen;
  end if;
end $$;
rollback;

delete from public.proof_feedback
 where lawsuit_id = '10000000-0000-4000-8000-000000000016';
delete from public.lawsuits where slug = 'proof-feedback-published';
