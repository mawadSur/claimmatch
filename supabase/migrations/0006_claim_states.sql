-- ClaimMatch: claim states for the self-file flow (Phase 0, Part A). EXPAND ONLY.
--
-- ClaimMatch never files or submits a claim for anyone. People file on the
-- official administrator's site and tell ClaimMatch, which tracks the claim.
--
-- Safe on a production database that already has claims, and safe to re-run:
-- nothing is renamed, dropped, deleted or rewritten. It adds enum values,
-- nullable columns (no defaults, so no table rewrite), a CHECK that existing
-- rows skip (NOT VALID), the claim_events log and two server-only functions.
--
-- Order: run this BEFORE deploying the Part A code (that code fails with a
-- clear 503 until it has run). Then deploy. Then run 0007.
--
-- Effect on the code that is live today: its legacy e-sign insert writes
-- status 'submitted' with no confirmation number, which the CHECK below now
-- refuses, so the legacy insert stops writing 'submitted' without a
-- confirmation number (the user sees "Could not file your claim"). This is
-- intended (D38: stop the 'submitted' writes first).
--
-- No statement in this file uses a value it adds: the functions take the
-- status as text and cast it at run time, so the file also works inside a
-- single transaction (for example the Supabase SQL editor).

-- ---------------------------------------------------------------------------
-- 1. New claim states, beside the old ones (expand, then contract)
-- ---------------------------------------------------------------------------
--   self_file          the user still needs to file on the official site ("Not filed yet")
--   reported_filed     the user says they filed; no confirmation number yet ("Reported filed by you")
--   not_reported_filed the deadline passed with no report ("Not reported filed")
--   withdrawn          the user stopped tracking the claim
-- 'submitted' keeps its name. From now on it is valid only with the
-- administrator's confirmation number (CHECK below). Legacy 'submitted' rows
-- (written by the retired e-sign flow, which filed nothing) have no number and
-- the app shows them as "Not filed". 'processing', 'approved', 'rejected' and
-- 'paid' are legacy values the app gives safe labels; dropping them is a later
-- contract step after a founder-reviewed backfill (WP:3107-3120).
alter type public.claim_status add value if not exists 'self_file';
alter type public.claim_status add value if not exists 'reported_filed';
alter type public.claim_status add value if not exists 'not_reported_filed';
alter type public.claim_status add value if not exists 'withdrawn';

-- ---------------------------------------------------------------------------
-- 2. Self-file columns on claims (all nullable; legacy rows keep NULLs)
-- ---------------------------------------------------------------------------
alter table public.claims add column if not exists confirmation_number text;
alter table public.claims add column if not exists reported_filed_at timestamptz;
alter table public.claims add column if not exists user_filed_on date;
alter table public.claims add column if not exists corrective_notice_answered_at timestamptz;

comment on column public.claims.confirmation_number is
  'The settlement administrator''s confirmation number, as the user typed it. Required for status submitted.';
comment on column public.claims.reported_filed_at is
  'When the user told ClaimMatch they filed on the official site (server time).';
comment on column public.claims.user_filed_on is
  'The day the user says they filed on the official site. Optional.';
comment on column public.claims.corrective_notice_answered_at is
  'When the user answered the Phase 0 corrective notice (D42) on a legacy claim.';
comment on column public.claims.filed_at is
  'Legacy column from the retired e-sign flow. Not shown or written by the app.';

-- ---------------------------------------------------------------------------
-- 3. 'submitted' requires a non-empty confirmation number
-- ---------------------------------------------------------------------------
-- NOT VALID: existing legacy rows are not checked, so this never blocks on
-- production data. New rows, and any UPDATE of an existing row, are checked:
-- the app therefore moves a legacy 'submitted' row out of 'submitted' (to
-- self_file, reported_filed or submitted-with-a-number) whenever it changes it.
-- After the founder-approved backfill leaves zero legacy rows, a later
-- migration can run VALIDATE CONSTRAINT.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'claims_submitted_needs_confirmation'
      and conrelid = 'public.claims'::regclass
  ) then
    alter table public.claims
      add constraint claims_submitted_needs_confirmation
      check (status <> 'submitted' or coalesce(btrim(confirmation_number), '') <> '')
      not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. claim_events: an append-only log of every claim change
-- ---------------------------------------------------------------------------
-- Statuses are stored as text, so the log stays readable after the enum is
-- contracted. Rows are written only by the server functions below.
create table if not exists public.claim_events (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references public.claims(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status   text,
  actor       text not null check (actor in ('user', 'system', 'staff')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.claim_events is
  'Append-only log of claim changes (who, from, to, why). Written by server code only.';

create index if not exists claim_events_claim_idx on public.claim_events (claim_id, created_at);
create index if not exists claim_events_user_idx on public.claim_events (user_id, created_at);

-- The event's user is always the claim's user, whatever the caller passed.
create or replace function public.claim_events_set_user()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  select c.user_id into new.user_id from public.claims c where c.id = new.claim_id;
  return new;
end $$;

drop trigger if exists claim_events_set_user on public.claim_events;
create trigger claim_events_set_user before insert on public.claim_events
  for each row execute function public.claim_events_set_user();

-- Events are never edited. (Deletes happen only by cascade when a claim or an
-- account is deleted; API roles have no DELETE privilege below.)
create or replace function public.claim_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'claim_events rows are append-only' using errcode = '42501';
end $$;

drop trigger if exists claim_events_no_update on public.claim_events;
create trigger claim_events_no_update before update on public.claim_events
  for each row execute function public.claim_events_immutable();

alter table public.claim_events enable row level security;

drop policy if exists "own claim events read" on public.claim_events;
create policy "own claim events read" on public.claim_events
  for select using (auth.uid() = user_id);

-- No client writes at all; the service role may only read and append.
revoke insert, update, delete, truncate on public.claim_events from anon, authenticated;
revoke update, delete, truncate on public.claim_events from service_role;
grant select on public.claim_events to authenticated;
grant select, insert on public.claim_events to service_role;

-- ---------------------------------------------------------------------------
-- 5. Server-only functions: change a claim and log it in one transaction
-- ---------------------------------------------------------------------------
-- Called by the Part A route handlers with the service-role client, after the
-- route has verified that the signed-in user owns the claim. Not executable by
-- anon or authenticated.

-- Start tracking a settlement. Creates the user's claim if there is none
-- (status passed as text, e.g. 'self_file') and logs it; an existing claim is
-- returned unchanged. Returns {"created": bool, "claim": {...}}.
create or replace function public.claim_start_tracking(
  p_user_id       uuid,
  p_lawsuit_id    uuid,
  p_lawsuit_title text,
  p_status        text,
  p_actor         text default 'user',
  p_detail        jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim public.claims%rowtype;
begin
  insert into public.claims (user_id, lawsuit_id, lawsuit_title, status)
  values (
    p_user_id,
    p_lawsuit_id,
    coalesce(nullif(btrim(p_lawsuit_title), ''), 'Settlement'),
    p_status::public.claim_status
  )
  on conflict (user_id, lawsuit_id) do nothing
  returning * into v_claim;

  if not found then
    select * into v_claim from public.claims
    where user_id = p_user_id and lawsuit_id = p_lawsuit_id;
    return jsonb_build_object('created', false, 'claim', to_jsonb(v_claim));
  end if;

  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_claim.id, v_claim.user_id, null, v_claim.status::text, p_actor, coalesce(p_detail, '{}'::jsonb));

  return jsonb_build_object('created', true, 'claim', to_jsonb(v_claim));
end $$;

-- Apply one change to a claim the caller has verified the user owns, and log
-- it. Refuses if the claim's status is no longer p_expected_status (another tab
-- or request changed it: SQLSTATE 40001), if the claim is not this user's
-- (P0002), or if p_changes names a column it may not set (22023). The CHECK
-- above still applies, so 'submitted' without a number fails (23514) and
-- nothing is logged. Returns the updated claim as JSON.
create or replace function public.claim_apply_change(
  p_claim_id        uuid,
  p_user_id         uuid,
  p_expected_status text,
  p_changes         jsonb,
  p_actor           text default 'user',
  p_detail          jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old public.claims%rowtype;
  v_new public.claims%rowtype;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k not in ('status', 'confirmation_number', 'reported_filed_at',
                    'user_filed_on', 'corrective_notice_answered_at')
  ) then
    raise exception 'unsupported claim change' using errcode = '22023';
  end if;

  select * into v_old from public.claims
  where id = p_claim_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
  if v_old.status::text is distinct from p_expected_status then
    raise exception 'claim status changed' using errcode = '40001';
  end if;

  update public.claims set
    status = case when p_changes ? 'status'
      then (p_changes->>'status')::public.claim_status else status end,
    confirmation_number = case when p_changes ? 'confirmation_number'
      then nullif(btrim(p_changes->>'confirmation_number'), '') else confirmation_number end,
    reported_filed_at = case when p_changes ? 'reported_filed_at'
      then (p_changes->>'reported_filed_at')::timestamptz else reported_filed_at end,
    user_filed_on = case when p_changes ? 'user_filed_on'
      then (p_changes->>'user_filed_on')::date else user_filed_on end,
    corrective_notice_answered_at = case when p_changes ? 'corrective_notice_answered_at'
      then (p_changes->>'corrective_notice_answered_at')::timestamptz else corrective_notice_answered_at end
  where id = p_claim_id
  returning * into v_new;

  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_new.id, v_new.user_id, v_old.status::text, v_new.status::text, p_actor, coalesce(p_detail, '{}'::jsonb));

  return to_jsonb(v_new);
end $$;

revoke all on function public.claim_start_tracking(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_start_tracking(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) to service_role;
revoke all on function public.claim_events_set_user() from public, anon, authenticated;
revoke all on function public.claim_events_immutable() from public, anon, authenticated;
