-- ClaimMatch 0033: in-app beta feedback + interview opt-in.
-- EXPAND ONLY. Do not edit 0032 or earlier.
--
-- One row per signed-in user. Free-text answers stay in this table and are
-- never sent to PostHog or emailed. Admins read all rows through the service
-- role (and via is_admin() on authenticated select). Users insert/update/read
-- only their own row. Anon has no access.
--
-- Public UI stays off until BETA_FEEDBACK_ENABLED=1.
-- Safe to re-run. Nothing is deleted.
-- Rollback (not recommended once answers exist; this drops the table):
--   drop table if exists public.beta_feedback;

create table if not exists public.beta_feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  almost_stopped     text,
  whats_missing      text,
  interview_opt_in   boolean not null default false,
  dismissed          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id)
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'beta_feedback_almost_stopped_len'
       and conrelid = 'public.beta_feedback'::regclass
  ) then
    alter table public.beta_feedback
      add constraint beta_feedback_almost_stopped_len
      check (almost_stopped is null or char_length(almost_stopped) <= 500);
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conname = 'beta_feedback_whats_missing_len'
       and conrelid = 'public.beta_feedback'::regclass
  ) then
    alter table public.beta_feedback
      add constraint beta_feedback_whats_missing_len
      check (whats_missing is null or char_length(whats_missing) <= 500);
  end if;
end $$;

comment on table public.beta_feedback is
  'Signed-in soft-beta feedback. Free text is admin-only; never emailed or sent to PostHog.';
comment on column public.beta_feedback.interview_opt_in is
  'User is open to a 15-minute call. Never triggers email from this table.';
comment on column public.beta_feedback.dismissed is
  'True when the prompt was dismissed without a written answer.';

create index if not exists beta_feedback_created_at_idx
  on public.beta_feedback (created_at desc);
create index if not exists beta_feedback_interview_idx
  on public.beta_feedback (interview_opt_in)
  where interview_opt_in = true;

alter table public.beta_feedback enable row level security;

drop policy if exists "own beta_feedback read" on public.beta_feedback;
create policy "own beta_feedback read" on public.beta_feedback
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own beta_feedback insert" on public.beta_feedback;
create policy "own beta_feedback insert" on public.beta_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own beta_feedback update" on public.beta_feedback;
create policy "own beta_feedback update" on public.beta_feedback
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.beta_feedback from public, anon;
grant select, insert, update on table public.beta_feedback to authenticated;
revoke delete, truncate on table public.beta_feedback from authenticated;
