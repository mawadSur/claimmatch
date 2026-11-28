-- ClaimMatch 0056: PIN-gated email-to-administrator + 7-day paper-form fallback.
-- EXPAND ONLY. Do not edit 0055 or earlier.
--
-- Apply in numeric order. 0052 and 0053 add the notice columns used by the
-- replacement public.claim_apply_change(...); 0055 adds the drip schema it extends.
-- Feature flags (default off): PIN_ADMIN_OUTREACH_ENABLED, PIN_ADMIN_EMAIL_ENABLED,
-- PAPER_FALLBACK_UI_ENABLED, PAPER_FALLBACK_REMINDER_ENABLED.
-- This migration only adds columns, RPCs, and a drip kind. It does not send email.
--
-- Unapplied to production until an owner applies it. Safe to re-run.
-- Writes stay on the service role (0008 revoked authenticated UPDATE on claims).
--
-- Rollback:
--   drop function if exists public.claim_request_pin_admin_email(uuid, uuid);
--   drop function if exists public.claim_record_pin_admin_email_sent(uuid, uuid, text, text);
--   drop function if exists public.claim_record_paper_fallback(uuid, uuid);
--   alter table public.claims drop column if exists pin_admin_email_requested_at;
--   alter table public.claims drop column if exists pin_admin_email_sent_at;
--   alter table public.claims drop column if exists pin_admin_email_provider_id;
--   alter table public.claims drop column if exists pin_admin_email_error;
--   alter table public.claims drop column if exists paper_fallback_at;
--   (restore 0055 drip kind checks)

alter table public.claims
  add column if not exists pin_admin_email_requested_at timestamptz;

alter table public.claims
  add column if not exists pin_admin_email_sent_at timestamptz;

alter table public.claims
  add column if not exists pin_admin_email_provider_id text;

alter table public.claims
  add column if not exists pin_admin_email_error text;

alter table public.claims
  add column if not exists paper_fallback_at timestamptz;

comment on column public.claims.pin_admin_email_requested_at is
  'When the member asked Lawsuit AI to email the administrator for a notice or claim ID. Sending is gated by PIN_ADMIN_EMAIL_ENABLED.';
comment on column public.claims.pin_admin_email_sent_at is
  'When the PIN-gated administrator email was accepted by the mail provider. Null until send succeeds.';
comment on column public.claims.pin_admin_email_provider_id is
  'Mail provider id for the PIN-gated administrator email, when send succeeded.';
comment on column public.claims.pin_admin_email_error is
  'Last send error for the PIN-gated administrator email. Cleared on success.';
comment on column public.claims.paper_fallback_at is
  'When the 7-day paper-form fallback was recorded for this PIN-gated claim. Idempotent.';

-- Allow the new columns in the existing transactional updater.
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
                    'requested_notice_at',
                    'pin_admin_email_requested_at', 'pin_admin_email_sent_at',
                    'pin_admin_email_provider_id', 'pin_admin_email_error',
                    'paper_fallback_at')
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
      then (p_changes->>'requested_notice_at')::timestamptz else requested_notice_at end,
    pin_admin_email_requested_at = case when p_changes ? 'pin_admin_email_requested_at'
      then (p_changes->>'pin_admin_email_requested_at')::timestamptz else pin_admin_email_requested_at end,
    pin_admin_email_sent_at = case when p_changes ? 'pin_admin_email_sent_at'
      then (p_changes->>'pin_admin_email_sent_at')::timestamptz else pin_admin_email_sent_at end,
    pin_admin_email_provider_id = case when p_changes ? 'pin_admin_email_provider_id'
      then nullif(btrim(p_changes->>'pin_admin_email_provider_id'), '') else pin_admin_email_provider_id end,
    pin_admin_email_error = case when p_changes ? 'pin_admin_email_error'
      then nullif(btrim(p_changes->>'pin_admin_email_error'), '') else pin_admin_email_error end,
    paper_fallback_at = case when p_changes ? 'paper_fallback_at'
      then (p_changes->>'paper_fallback_at')::timestamptz else paper_fallback_at end
  where id = p_claim_id
  returning * into v_new;

  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_new.id, v_new.user_id, v_old.status::text, v_new.status::text, p_actor, coalesce(p_detail, '{}'::jsonb));

  return to_jsonb(v_new);
end $$;

revoke all on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_apply_change(uuid, uuid, text, jsonb, text, jsonb) to service_role;

create or replace function public.claim_request_pin_admin_email(
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
    insert into public.claims (
      user_id, lawsuit_id, lawsuit_title, status,
      requested_notice_at, pin_admin_email_requested_at
    )
    values (
      p_user_id,
      p_lawsuit_id,
      coalesce(nullif(btrim(v_title), ''), 'Settlement'),
      'self_file',
      v_at,
      v_at
    )
    returning * into v_claim;

    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, null, v_claim.status::text, 'user',
            jsonb_build_object('pin_admin_email_requested', true));
  else
    if v_claim.pin_admin_email_requested_at is null then
      update public.claims set
        pin_admin_email_requested_at = v_at,
        requested_notice_at = coalesce(requested_notice_at, v_at)
      where id = v_claim.id
      returning * into v_claim;

      insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
      values (v_claim.id, v_claim.user_id, v_claim.status::text, v_claim.status::text, 'user',
              jsonb_build_object('pin_admin_email_requested', true));
    elsif v_claim.requested_notice_at is null then
      update public.claims set requested_notice_at = v_at
      where id = v_claim.id
      returning * into v_claim;
    end if;
  end if;

  return to_jsonb(v_claim);
end $$;

revoke all on function public.claim_request_pin_admin_email(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_request_pin_admin_email(uuid, uuid) to service_role;

create or replace function public.claim_record_pin_admin_email_sent(
  p_user_id     uuid,
  p_claim_id    uuid,
  p_provider_id text,
  p_error       text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim public.claims%rowtype;
  v_at    timestamptz := now();
begin
  select * into v_claim from public.claims
  where id = p_claim_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;

  if v_claim.pin_admin_email_sent_at is not null then
    return to_jsonb(v_claim);
  end if;

  update public.claims set
    pin_admin_email_sent_at = case
      when nullif(btrim(coalesce(p_provider_id, '')), '') is not null then v_at
      else pin_admin_email_sent_at
    end,
    pin_admin_email_provider_id = coalesce(
      nullif(btrim(coalesce(p_provider_id, '')), ''),
      pin_admin_email_provider_id
    ),
    pin_admin_email_error = nullif(btrim(coalesce(p_error, '')), '')
  where id = v_claim.id
  returning * into v_claim;

  if v_claim.pin_admin_email_sent_at is not null then
    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, v_claim.status::text, v_claim.status::text, 'system',
            jsonb_build_object('pin_admin_email_sent', true));
  end if;

  return to_jsonb(v_claim);
end $$;

revoke all on function public.claim_record_pin_admin_email_sent(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_record_pin_admin_email_sent(uuid, uuid, text, text) to service_role;

create or replace function public.claim_record_paper_fallback(
  p_user_id  uuid,
  p_claim_id uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim public.claims%rowtype;
  v_at    timestamptz := now();
begin
  select * into v_claim from public.claims
  where id = p_claim_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;

  if v_claim.paper_fallback_at is not null then
    return to_jsonb(v_claim);
  end if;
  if nullif(btrim(coalesce(v_claim.notice_id, '')), '') is not null then
    return to_jsonb(v_claim);
  end if;
  if v_claim.pin_admin_email_requested_at is null and v_claim.pin_admin_email_sent_at is null then
    return to_jsonb(v_claim);
  end if;

  update public.claims set paper_fallback_at = v_at
  where id = v_claim.id
  returning * into v_claim;

  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_claim.id, v_claim.user_id, v_claim.status::text, v_claim.status::text, 'system',
          jsonb_build_object('paper_fallback', true));

  return to_jsonb(v_claim);
end $$;

revoke all on function public.claim_record_paper_fallback(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_record_paper_fallback(uuid, uuid) to service_role;

alter table public.drip_email_sends
  drop constraint if exists drip_email_sends_kind_check;

alter table public.drip_email_sends
  add constraint drip_email_sends_kind_check
  check (kind in ('incomplete_onboarding', 'did_you_file', 'did_you_file_24h', 'trial_will_end', 'paper_fallback'));

alter table public.drip_email_sends
  drop constraint if exists drip_email_sends_kind_claim_check;

alter table public.drip_email_sends
  add constraint drip_email_sends_kind_claim_check
  check (
    (kind = 'incomplete_onboarding' and claim_id is null and lawsuit_id is null and stripe_subscription_id is null)
    or
    (kind = 'did_you_file' and claim_id is not null and stripe_subscription_id is null)
    or
    (kind = 'did_you_file_24h' and lawsuit_id is not null and stripe_subscription_id is null)
    or
    (kind = 'trial_will_end' and stripe_subscription_id is not null and claim_id is null and lawsuit_id is null)
    or
    (kind = 'paper_fallback' and claim_id is not null and stripe_subscription_id is null)
  );

create unique index if not exists drip_email_sends_paper_fallback_key
  on public.drip_email_sends (user_id, claim_id)
  where kind = 'paper_fallback' and claim_id is not null;

comment on table public.drip_email_sends is
  'One row per drip kind after a successful Resend send. incomplete_onboarding is per user; did_you_file is per claim; did_you_file_24h is per user+lawsuit; trial_will_end is per Stripe subscription; paper_fallback is per claim. Service role only.';
