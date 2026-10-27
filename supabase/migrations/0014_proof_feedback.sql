-- ClaimMatch 0014: proof_feedback crowd signal (C12).
-- EXPAND ONLY. 0012 and 0013 are already applied on production — do not
-- renumber or edit them.
--
-- One row per signed-in user and settlement. Answers are unverified crowd
-- signal and are never shown as fact on public pages. Admins read counts
-- through the service role.
--
-- RLS: authenticated users may insert and select their own row only.
-- Anon has no access. No updates or deletes from API roles.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback (not recommended once answers exist; this drops the table):
--   drop table if exists public.proof_feedback;

create table if not exists public.proof_feedback (
  id          uuid primary key default gen_random_uuid(),
  lawsuit_id  uuid not null references public.lawsuits (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  answer      text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, lawsuit_id)
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'proof_feedback_answer_check'
       and conrelid = 'public.proof_feedback'::regclass
  ) then
    alter table public.proof_feedback
      add constraint proof_feedback_answer_check
      check (answer in ('yes', 'no', 'not_sure'));
  end if;
end $$;

comment on table public.proof_feedback is
  'Signed-in answers to "Did the official site ask for proof?". Unverified crowd signal; never shown as fact.';
comment on column public.proof_feedback.answer is
  'yes / no / not_sure. One row per user and settlement.';

create index if not exists proof_feedback_lawsuit_idx
  on public.proof_feedback (lawsuit_id);

alter table public.proof_feedback enable row level security;

drop policy if exists "own proof_feedback read" on public.proof_feedback;
create policy "own proof_feedback read" on public.proof_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own proof_feedback insert" on public.proof_feedback
;
create policy "own proof_feedback insert" on public.proof_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on table public.proof_feedback from public, anon;
grant select, insert on table public.proof_feedback to authenticated;
revoke update, delete, truncate on table public.proof_feedback from authenticated;
