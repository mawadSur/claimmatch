-- ClaimMatch 0053: mark that the member requested a notice/claim ID.
-- EXPAND ONLY. Do not edit 0052 or earlier.
--
-- Unapplied to production until an owner applies it. Safe to re-run.
-- Writes stay on the service role through claim_mark_notice_requested
-- (0008 revoked authenticated UPDATE on claims). Guests keep the step in
-- sessionStorage until they sign in. Lawsuit AI never sends the request email.
--
-- Rollback:
--   drop function if exists public.claim_mark_notice_requested(uuid, uuid);
--   alter table public.claims drop column if exists requested_notice_at;

alter table public.claims
  add column if not exists requested_notice_at timestamptz;

comment on column public.claims.requested_notice_at is
  'When the member marked that they requested a notice or claim ID from the administrator. We never send that email.';

-- Allow requested_notice_at in the existing transactional updater.
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
                    'user_filed_on', 'corrective_notice_answered_at', 'notice_id',
                    'requested_notice_at')
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
      then nullif(btrim(p_changes->>'notice_id'), '') else notice_id end,
    requested_notice_at = case when p_changes ? 'requested_notice_at'
      then (p_changes->>'requested_notice_at')::timestamptz else requested_notice_at end
  where id = p_claim_id
  returning * into v_new;

  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_new.id, v_new.user_id, v_old.status::text, v_new.status::text, p_actor, coalesce(p_detail, '{}'::jsonb));

  return to_jsonb(v_new);
end $$;

revoke all on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) to service_role;

create or replace function public.claim_mark_notice_requested(
  p_user_id    uuid,
  p_lawsuit_id uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim public.claims%rowtype;
  v_title text;
  v_at    timestamptz := now();
begin
  select * into v_claim from public.claims
  where user_id = p_user_id and lawsuit_id = p_lawsuit_id
  for update;

  if not found then
    select title into v_title from public.lawsuits where id = p_lawsuit_id;
    insert into public.claims (user_id, lawsuit_id, lawsuit_title, status, requested_notice_at)
    values (
      p_user_id,
      p_lawsuit_id,
      coalesce(nullif(btrim(v_title), ''), 'Settlement'),
      'self_file',
      v_at
    )
    returning * into v_claim;

    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, null, v_claim.status::text, 'user',
            jsonb_build_object('notice_requested', true));
  elsif v_claim.requested_notice_at is null then
    update public.claims set requested_notice_at = v_at
    where id = v_claim.id
    returning * into v_claim;

    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, v_claim.status::text, v_claim.status::text, 'user',
            jsonb_build_object('notice_requested', true));
  end if;

  return to_jsonb(v_claim);
end $$;

revoke all on function public.claim_mark_notice_requested(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_mark_notice_requested(uuid, uuid) to service_role;
