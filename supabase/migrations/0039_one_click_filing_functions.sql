-- Lawsuit AI 0039: one-click filing, server-only functions for the member side (CONTRACT).
-- EXPAND ONLY. Do not edit 0038 or earlier. Staff-side functions: 0040. Design: docs/designs/one-click-filing.md.
--
-- Each function makes one integrity-critical change in a single transaction
-- and logs the claim change in claim_events (0006). Route handlers and the
-- cron call them with the service-role client after checking who the caller
-- is; no API role may execute them. Rows are locked claim first, then job,
-- then packet, in every function, so two of them never deadlock.
-- claim_events.detail is shown to the member: never put staff names, notes or
-- lock owners in p_detail.
-- Errors: SQLSTATE CMnnn (design doc, section 6), P0002 not found, 22023 bad
-- argument, 23505 a unique rule (for example one open job per claim).
-- Safe to re-run.

-- 1. The one click: store the member's e-signature for the exact packet and
--    move the claim from ready to signed. A retry with the same
--    Idempotency-Key returns the first result. Checks again what the route
--    checked: a fresh sign-in (CM015), the approved spec's statement and class
--    definition hashes inside the canonical packet, the member's confirmation.
create or replace function public.filing_sign_packet(
  p_claim_id                   uuid,
  p_user_id                    uuid,
  p_packet_id                  uuid,
  p_packet_hash                text,
  p_packet_canonical           text,
  p_spec_id                    uuid,
  p_statement_text             text,
  p_authorization_text_version text,
  p_authorization_text         text,
  p_typed_name                 text,
  p_lane                       text,
  p_esign_consent_id           uuid,
  p_auth_method                text,
  p_auth_time                  timestamptz,
  p_session_id                 text,
  p_ip                         inet,
  p_user_agent                 text,
  p_idempotency_key            text,
  p_jev_run_id                 uuid default null,
  p_detail                     jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim  public.claims%rowtype;
  v_packet public.claim_packets%rowtype;
  v_spec   public.filing_specs%rowtype;
  v_sig    public.claim_signatures%rowtype;
  v_doc    jsonb;
begin
  -- Lock first, so a concurrent retry with the same key waits and then gets the first result.
  select * into v_claim from public.claims where id = p_claim_id and user_id = p_user_id for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  select * into v_sig from public.claim_signatures
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_sig.claim_id <> p_claim_id or v_sig.packet_hash <> p_packet_hash then
      raise exception 'this Idempotency-Key was used for another signature' using errcode = 'CM008';
    end if;
    return jsonb_build_object('created', false, 'claim', to_jsonb(v_claim),
      'signature', jsonb_build_object('id', v_sig.id, 'signed_at', v_sig.signed_at,
                                      'packet_hash', v_sig.packet_hash, 'lane', v_sig.lane));
  end if;
  -- Re-authentication (REAUTH_MAX_AGE_SECONDS, FRESH_SIGN_IN_METHODS in contract-base.ts):
  -- a real sign-in within 15 minutes; email links (otp, magiclink, recovery, invite) never count.
  if p_auth_method is null or p_auth_method not in ('password', 'oauth', 'sso/saml', 'totp', 'mfa/totp',
                                                    'mfa/phone', 'mfa/webauthn')
     or p_auth_time is null or p_auth_time < now() - interval '900 seconds' then
    raise exception 'signing needs a sign-in within the last 15 minutes' using errcode = 'CM015';
  end if;
  if v_claim.status::text <> 'ready' then
    raise exception 'the claim is %, not ready to sign', v_claim.status using errcode = 'CM001';
  end if;

  select * into v_packet from public.claim_packets where id = p_packet_id and claim_id = p_claim_id for update;
  if not found then raise exception 'packet not found' using errcode = 'P0002'; end if;
  if v_packet.status <> 'open' then raise exception 'the packet is %', v_packet.status using errcode = 'CM002'; end if;
  if v_packet.packet_hash is distinct from p_packet_hash or v_packet.spec_id is distinct from p_spec_id then
    raise exception 'the packet changed since it was shown' using errcode = 'CM003';
  end if;

  begin
    v_doc := p_packet_canonical::jsonb;
  exception when others then
    raise exception 'the canonical packet is not JSON' using errcode = 'CM003';
  end;
  if v_doc ->> 'format' is distinct from 'claimmatch.packet.v1'
     or v_doc ->> 'claim_id' is distinct from p_claim_id::text
     or v_doc ->> 'lawsuit_id' is distinct from v_claim.lawsuit_id::text
     or v_doc -> 'spec' ->> 'id' is distinct from p_spec_id::text then
    raise exception 'the canonical packet does not describe this claim' using errcode = 'CM003';
  end if;

  select * into v_spec from public.filing_specs where id = p_spec_id;
  if not found or v_spec.status <> 'approved' or v_spec.lawsuit_id <> v_claim.lawsuit_id
     or (v_doc -> 'spec' ->> 'version') is distinct from v_spec.version::text then
    raise exception 'the packet is not on the approved spec for this settlement' using errcode = 'CM009';
  end if;
  if (v_spec.content -> 'attestation' ->> 'text') is distinct from p_statement_text
     or v_doc ->> 'attestation_sha256' is distinct from encode(sha256(convert_to(p_statement_text, 'UTF8')), 'hex') then
    raise exception 'the statement differs from the approved spec' using errcode = 'CM010';
  end if;
  -- The signed text binds the verbatim class definition the member confirmed themselves.
  if v_doc ->> 'class_definition_sha256' is distinct from
       encode(sha256(convert_to(v_spec.content -> 'class_definition' ->> 'text', 'UTF8')), 'hex')
     or v_doc -> 'confirmations' -> 'class_definition' is distinct from 'true'::jsonb then
    raise exception 'the packet does not carry the class definition the member confirmed' using errcode = 'CM003';
  end if;
  if exists (select 1 from public.claim_signatures s where s.claim_id = p_claim_id
              and not exists (select 1 from public.claim_signature_voids v where v.signature_id = s.id)) then
    raise exception 'the claim already has a live signature' using errcode = 'CM004';
  end if;

  insert into public.claim_signatures (
    claim_id, user_id, lawsuit_id, packet_id, spec_id, spec_version, packet_hash, packet_canonical,
    statement_text, statement_sha256, authorization_text_version, authorization_text, typed_name,
    lane, esign_consent_id, auth_method, auth_time, session_id, ip, user_agent, idempotency_key, jev_run_id)
  values (
    p_claim_id, p_user_id, v_claim.lawsuit_id, p_packet_id, p_spec_id, v_spec.version, p_packet_hash,
    p_packet_canonical, p_statement_text, encode(sha256(convert_to(p_statement_text, 'UTF8')), 'hex'),
    p_authorization_text_version, p_authorization_text, btrim(p_typed_name), p_lane, p_esign_consent_id,
    p_auth_method, least(p_auth_time, now()), p_session_id, p_ip, p_user_agent, p_idempotency_key, p_jev_run_id)
  returning * into v_sig;

  update public.claim_packets set status = 'signed', signature_id = v_sig.id, signed_at = v_sig.signed_at
   where id = p_packet_id;
  update public.claims set status = 'signed' where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (p_claim_id, p_user_id, 'ready', 'signed', 'user',
          coalesce(p_detail, '{}'::jsonb)
          || jsonb_build_object('action', 'signed', 'signature_id', v_sig.id, 'lane', p_lane));

  return jsonb_build_object('created', true, 'claim', to_jsonb(v_claim),
    'signature', jsonb_build_object('id', v_sig.id, 'signed_at', v_sig.signed_at,
                                    'packet_hash', v_sig.packet_hash, 'lane', v_sig.lane));
end $$;

-- 2. Queue the filing a live signature authorizes (claim signed -> queued).
--    Idempotent per signature. The job's channel must be the signed lane.
create or replace function public.filing_enqueue(
  p_signature_id uuid,
  p_channel      text,
  p_policy_id    uuid,
  p_due_by       timestamptz,
  p_run_after    timestamptz default null,
  p_actor        text default 'system',
  p_detail       jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sig   public.claim_signatures%rowtype;
  v_claim public.claims%rowtype;
  v_job   public.claim_filing_jobs%rowtype;
begin
  select * into v_sig from public.claim_signatures where id = p_signature_id;
  if not found then raise exception 'signature not found' using errcode = 'P0002'; end if;
  select * into v_claim from public.claims where id = v_sig.claim_id for update;
  select * into v_job from public.claim_filing_jobs where signature_id = p_signature_id;
  if found then
    return jsonb_build_object('created', false, 'job', to_jsonb(v_job), 'claim', to_jsonb(v_claim));
  end if;
  if v_claim.status::text <> 'signed' then
    raise exception 'the claim is %, not signed', v_claim.status using errcode = 'CM001';
  end if;

  insert into public.claim_filing_jobs (signature_id, claim_id, user_id, lawsuit_id, packet_id, packet_hash,
                                        spec_id, policy_id, channel, idempotency_key, run_after, due_by)
  values (p_signature_id, v_sig.claim_id, v_sig.user_id, v_sig.lawsuit_id, v_sig.packet_id, v_sig.packet_hash,
          v_sig.spec_id, p_policy_id, p_channel, 'sig:' || p_signature_id::text, coalesce(p_run_after, now()), p_due_by)
  returning * into v_job;

  update public.claims set status = 'queued' where id = v_claim.id returning * into v_claim;
  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (v_claim.id, v_claim.user_id, 'signed', 'queued', p_actor,
          coalesce(p_detail, '{}'::jsonb)
          || jsonb_build_object('action', 'queued', 'job_id', v_job.id, 'channel', v_job.channel));
  return jsonb_build_object('created', true, 'job', to_jsonb(v_job), 'claim', to_jsonb(v_claim));
end $$;

-- 3. Move a claim that nobody is filing right now back to the member side:
--    edit (preparing / ready), needs_you, finish on the official site
--    (self_file) or withdrawn. Cancels the open (queued) job, voids the live
--    signature and reopens (or, for withdrawn, closes) the packet. Refuses
--    with CM005 while the claim is filing or its job is in_progress, exported
--    or needs_attention. p_reason lands in member-readable rows: member-safe codes only.
create or replace function public.filing_move_claim(
  p_claim_id  uuid,
  p_user_id   uuid,
  p_to_status text,
  p_reason    text,
  p_actor     text default 'user',
  p_detail    jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old       public.claims%rowtype;
  v_claim     public.claims%rowtype;
  v_job       public.claim_filing_jobs%rowtype;
  v_sig_id    uuid;
  v_cancelled uuid;
begin
  if p_to_status is null or p_to_status not in ('preparing', 'ready', 'needs_you', 'self_file', 'withdrawn') then
    raise exception 'filing_move_claim cannot move a claim to %', p_to_status using errcode = '22023';
  end if;
  if p_reason is null or p_reason !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'the reason must be a lowercase code' using errcode = '22023';
  end if;

  select * into v_old from public.claims where id = p_claim_id and user_id = p_user_id for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if v_old.status::text = p_to_status then
    return jsonb_build_object('changed', false, 'claim', to_jsonb(v_old),
                              'job_cancelled', null, 'signature_voided', null);
  end if;

  -- Once a job was taken (in_progress, exported, or needs_attention after a
  -- possible submission) only staff end it, through filing_job_finish.
  if v_old.status::text = 'filing' then
    raise exception 'the claim is being filed right now' using errcode = 'CM005';
  end if;
  select * into v_job from public.claim_filing_jobs
   where claim_id = p_claim_id and status in ('queued', 'in_progress', 'exported', 'needs_attention')
   for update;
  if found then
    if v_job.status in ('in_progress', 'exported', 'needs_attention') then
      raise exception 'the claim is being filed right now' using errcode = 'CM005';
    end if;
    update public.claim_filing_jobs set status = 'cancelled', closed_reason = p_reason, closed_at = now()
     where id = v_job.id;
    v_cancelled := v_job.id;
  end if;

  select s.id into v_sig_id from public.claim_signatures s
   where s.claim_id = p_claim_id
     and not exists (select 1 from public.claim_signature_voids v where v.signature_id = s.id)
   order by s.signed_at desc
   limit 1;
  if v_sig_id is not null then
    insert into public.claim_signature_voids (signature_id, claim_id, user_id, reason, actor, detail)
    values (v_sig_id, p_claim_id, p_user_id, p_reason, p_actor, jsonb_build_object('to_status', p_to_status));
  end if;

  if p_to_status = 'withdrawn' then
    update public.claim_packets set status = 'closed' where claim_id = p_claim_id and status <> 'closed';
  else
    update public.claim_packets set status = 'open', signature_id = null, signed_at = null, revision = revision + 1
     where claim_id = p_claim_id and status = 'signed';
  end if;

  update public.claims set status = p_to_status::public.claim_status where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (p_claim_id, v_claim.user_id, v_old.status::text, p_to_status, p_actor,
          coalesce(p_detail, '{}'::jsonb)
          || jsonb_build_object('action', 'moved', 'reason', p_reason,
                                'job_cancelled', v_cancelled, 'signature_voided', v_sig_id));
  return jsonb_build_object('changed', true, 'claim', to_jsonb(v_claim),
                            'job_cancelled', v_cancelled, 'signature_voided', v_sig_id);
end $$;

-- 4. The administrator's confirmation number arrives after Lawsuit AI filed:
--    claim filed_by_claimmatch -> submitted (the member types it, or staff do).
create or replace function public.filing_record_confirmation(
  p_claim_id            uuid,
  p_user_id             uuid,
  p_confirmation_number text,
  p_actor               text default 'user',
  p_detail              jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_number text := nullif(btrim(p_confirmation_number), '');
  v_old    public.claims%rowtype;
  v_claim  public.claims%rowtype;
begin
  if v_number is null or char_length(v_number) > 100 then
    raise exception 'a confirmation number of 1 to 100 characters is required' using errcode = '22023';
  end if;
  select * into v_old from public.claims where id = p_claim_id and user_id = p_user_id for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if v_old.status::text <> 'filed_by_claimmatch' then
    raise exception 'the claim is %, not waiting for a confirmation number', v_old.status using errcode = 'CM001';
  end if;
  update public.claim_filing_jobs set confirmation_number = v_number
   where claim_id = p_claim_id and status = 'filed' and confirmation_number is null;
  update public.claims set status = 'submitted', confirmation_number = v_number
   where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
  values (p_claim_id, v_claim.user_id, 'filed_by_claimmatch', 'submitted', p_actor,
          coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('action', 'confirmation_recorded'));
  return jsonb_build_object('claim', to_jsonb(v_claim));
end $$;

revoke all on function
  public.filing_sign_packet(uuid, uuid, uuid, text, text, uuid, text, text, text, text, text,
    uuid, text, timestamptz, text, inet, text, text, uuid, jsonb),
  public.filing_enqueue(uuid, text, uuid, timestamptz, timestamptz, text, jsonb),
  public.filing_move_claim(uuid, uuid, text, text, text, jsonb),
  public.filing_record_confirmation(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.filing_sign_packet(uuid, uuid, uuid, text, text, uuid, text, text, text, text, text,
    uuid, text, timestamptz, text, inet, text, text, uuid, jsonb),
  public.filing_enqueue(uuid, text, uuid, timestamptz, timestamptz, text, jsonb),
  public.filing_move_claim(uuid, uuid, text, text, text, jsonb),
  public.filing_record_confirmation(uuid, uuid, text, text, jsonb)
  to service_role;
