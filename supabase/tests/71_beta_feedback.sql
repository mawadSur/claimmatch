-- Columns, uniqueness, length check, and RLS added by 0033_beta_feedback.sql.
-- Authenticated users insert/select/update their own row only. Anon cannot.
-- Admins (is_admin) can read every row. No email is sent from this table.
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------------------
-- 1. Table, unique, and length constraints exist.
-- ---------------------------------------------------------------------------
\echo '  1 0033 table and constraints'
do $$
begin
  if to_regclass('public.beta_feedback') is null then
    raise exception '0033: beta_feedback table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'beta_feedback'
       and column_name = 'interview_opt_in'
  ) then
    raise exception '0033: beta_feedback.interview_opt_in is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'beta_feedback_user_id_key'
       and conrelid = 'public.beta_feedback'::regclass
  ) and not exists (
    select 1 from pg_constraint
     where conname = 'beta_feedback_user_id_key'
  ) then
    -- unique (user_id) may be named beta_feedback_user_id_key
    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.beta_feedback'::regclass
         and contype = 'u'
         and pg_get_constraintdef(oid) ilike '%user_id%'
    ) then
      raise exception '0033: unique (user_id) is missing';
    end if;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'beta_feedback_almost_stopped_len'
       and conrelid = 'public.beta_feedback'::regclass
  ) then
    raise exception '0033: beta_feedback_almost_stopped_len is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Length check and one-row-per-user uniqueness.
-- ---------------------------------------------------------------------------
\echo '  2 length check and uniqueness'
insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000033', 'beta-feedback-user@example.test')
on conflict (id) do nothing;

insert into public.beta_feedback (user_id, almost_stopped, interview_opt_in)
values (
  'a0000000-0000-4000-8000-000000000033',
  'The official form was confusing.',
  true
);

do $$
begin
  begin
    update public.beta_feedback
       set almost_stopped = repeat('x', 501)
     where user_id = 'a0000000-0000-4000-8000-000000000033';
    raise exception '0033: length check accepted 501 characters';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.beta_feedback (user_id, whats_missing)
    values (
      'a0000000-0000-4000-8000-000000000033',
      'A deadline reminder'
    );
    raise exception '0033: allowed a second row for the same user';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RLS: own row only; anon denied; cannot insert as someone else;
--    is_admin can read all.
-- ---------------------------------------------------------------------------
\echo '  3 RLS own-row and admin read'
insert into auth.users (id, email)
values
  ('b0000000-0000-4000-8000-000000000033', 'beta-feedback-other@example.test'),
  ('c0000000-0000-4000-8000-000000000033', 'beta-feedback-admin@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, email, is_admin)
values ('c0000000-0000-4000-8000-000000000033', 'beta-feedback-admin@example.test', true)
on conflict (id) do update set is_admin = true;

begin;
set local role anon;
do $$
declare
  n bigint;
begin
  begin
    insert into public.beta_feedback (user_id, dismissed)
    values ('a0000000-0000-4000-8000-000000000033', true);
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0033: anon inserted % beta_feedback row(s)', n;
  end if;
  begin
    if exists (select 1 from public.beta_feedback) then
      raise exception '0033: anon must not read beta_feedback';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;
  if has_table_privilege('anon', 'public.beta_feedback', 'select')
     or has_table_privilege('anon', 'public.beta_feedback', 'insert') then
    raise exception '0033: anon still has select or insert on beta_feedback';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000033';
do $$
declare
  n bigint;
  seen int;
begin
  select count(*) into seen from public.beta_feedback;
  if seen <> 0 then
    raise exception '0033: authenticated user read % other row(s)', seen;
  end if;

  begin
    insert into public.beta_feedback (user_id, dismissed)
    values ('a0000000-0000-4000-8000-000000000033', true);
    get diagnostics n = row_count;
  exception
    when insufficient_privilege then
      n := 0;
  end;
  if n <> 0 then
    raise exception '0033: user inserted a row for someone else';
  end if;

  insert into public.beta_feedback (user_id, whats_missing, interview_opt_in)
  values (
    'b0000000-0000-4000-8000-000000000033',
    'A way to share with a friend',
    false
  );
  select count(*) into seen from public.beta_feedback;
  if seen <> 1 then
    raise exception '0033: user should see only their own row, saw %', seen;
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'c0000000-0000-4000-8000-000000000033';
do $$
declare
  seen int;
begin
  select count(*) into seen from public.beta_feedback;
  if seen < 2 then
    raise exception '0033: admin should read every row, saw %', seen;
  end if;
end $$;
rollback;

delete from public.beta_feedback
 where user_id in (
   'a0000000-0000-4000-8000-000000000033',
   'b0000000-0000-4000-8000-000000000033',
   'c0000000-0000-4000-8000-000000000033'
 );
delete from public.profiles where id = 'c0000000-0000-4000-8000-000000000033';
