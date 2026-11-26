-- ClaimMatch 0052: per-claim notice / claim ID (not the shared claim profile).
-- EXPAND ONLY. Do not edit 0051 or earlier.
--
-- Saved on public.claims.notice_id for the signed-in user's claim on that
-- settlement. Never a PIN, password, or official-site login secret. Guests
-- keep the ID in sessionStorage until they sign in.
--
-- Writes stay on the service role through claim_set_notice_id (0008 revoked
-- authenticated UPDATE on claims). Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop function if exists public.claim_set_notice_id(uuid, uuid, text);
--   alter table public.claims drop column if exists notice_id;

alter table public.claims
  add column if not exists notice_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claims_notice_id_len'
       and conrelid = 'public.claims'::regclass
  ) then
    alter table public.claims
      add constraint claims_notice_id_len
      check (notice_id is null or char_length(notice_id) <= 80);
  end if;
end $$;

comment on column public.claims.notice_id is
  'Notice ID or claim ID from the mailed/emailed notice, for this claim only. Never a PIN or password.';

-- Allow notice_id in the existing transactional updater (status still required).
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
                    'user_filed_on', 'corrective_notice_answered_at', 'notice_id')
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
      then (p_changes->>'corrective_notice_answered_at')::timestamptz else corrective_notice_answered_at end,
    notice_id = case when p_changes ? 'notice_id'
      then nullif(btrim(p_changes->>'notice_id'), '') else notice_id end
  where id = p_claim_id
  returning * into v_new;

  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_new.id, v_new.user_id, v_old.status::text, v_new.status::text, p_actor, coalesce(p_detail, '{}'::jsonb));

  return to_jsonb(v_new);
end $$;

revoke all on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) to service_role;

-- Set notice_id without a status transition. Creates the claim in self_file
-- when the user is not tracking this settlement yet.
create or replace function public.claim_set_notice_id(
  p_user_id    uuid,
  p_lawsuit_id uuid,
  p_notice_id  text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim public.claims%rowtype;
  v_title text;
  v_id    text;
begin
  v_id := nullif(btrim(p_notice_id), '');
  if v_id is null or char_length(v_id) > 80 then
    raise exception 'invalid notice id' using errcode = '22023';
  end if;

  select * into v_claim from public.claims
  where user_id = p_user_id and lawsuit_id = p_lawsuit_id
  for update;

  if not found then
    select title into v_title from public.lawsuits where id = p_lawsuit_id;
    insert into public.claims (user_id, lawsuit_id, lawsuit_title, status, notice_id)
    values (
      p_user_id,
      p_lawsuit_id,
      coalesce(nullif(btrim(v_title), ''), 'Settlement'),
      'self_file',
      v_id
    )
    returning * into v_claim;

    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, null, v_claim.status::text, 'user',
            jsonb_build_object('notice_id_set', true));
  else
    update public.claims set notice_id = v_id
    where id = v_claim.id
    returning * into v_claim;

    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, v_claim.status::text, v_claim.status::text, 'user',
            jsonb_build_object('notice_id_set', true));
  end if;

  return to_jsonb(v_claim);
end $$;

revoke all on function public.claim_set_notice_id(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_set_notice_id(uuid, uuid, text) to service_role;
