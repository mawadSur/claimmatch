-- Lawsuit AI 0040: one-click filing, server-only functions for staff and the cron (CONTRACT).
-- EXPAND ONLY. Do not edit 0039 or earlier. Member-side functions: 0039. Design: docs/designs/one-click-filing.md.
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

-- 1. Take the next due queued job on a channel (or one given job) and lock it
--    to p_lock_owner ('staff:<uuid>' for the desk, 'worker:<run id>' for the
--    cron). Claim queued -> filing. Returns null when nothing is due. A job
--    out of step with its claim is parked as needs_attention, never filed.
create or replace function public.filing_job_claim_next(
  p_channel      text,
  p_lock_owner   text,
  p_actor        text default 'staff',
  p_job_id       uuid default null,
  p_lock_minutes integer default 30
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cand  record;
  v_job   public.claim_filing_jobs%rowtype;
  v_claim public.claims%rowtype;
begin
  if nullif(btrim(p_lock_owner), '') is null or p_lock_minutes is null or p_lock_minutes not between 1 and 240 then
    raise exception 'a lock owner and a lock of 1 to 240 minutes are required' using errcode = '22023';
  end if;
  for v_cand in
    select j.id, j.claim_id from public.claim_filing_jobs j
     where j.channel = p_channel and j.status = 'queued' and j.run_after <= now()
       and (p_job_id is null or j.id = p_job_id)
     order by j.due_by nulls last, j.created_at
     limit 25
  loop
    select * into v_claim from public.claims where id = v_cand.claim_id for update skip locked;
    continue when not found;
    select * into v_job from public.claim_filing_jobs where id = v_cand.id and status = 'queued' for update skip locked;
    continue when not found;
    if v_claim.status::text <> 'queued' then
      update public.claim_filing_jobs set status = 'needs_attention', needs_attention_reason = 'claim_out_of_sync'
       where id = v_job.id;
      continue;
    end if;
    update public.claim_filing_jobs
       set status = 'in_progress', locked_at = now(), lock_owner = p_lock_owner,
           lock_expires_at = now() + make_interval(mins => p_lock_minutes), attempt = attempt + 1
     where id = v_job.id
    returning * into v_job;
    update public.claims set status = 'filing' where id = v_claim.id returning * into v_claim;
    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_claim.id, v_claim.user_id, 'queued', 'filing', p_actor,
            jsonb_build_object('action', 'filing_started', 'job_id', v_job.id, 'channel', v_job.channel));
    return jsonb_build_object('job', to_jsonb(v_job), 'claim', to_jsonb(v_claim));
  end loop;
  return null;
end $$;

-- 2. Record what happened to a job, and move its claim, in one step:
--      filed           -> claim filed_by_claimmatch, or submitted with the number
--      rejected        -> claim filing_rejected (the official site or administrator refused it)
--      cancelled       -> claim needs_you or self_file; the signature is voided
--      queued          -> claim queued, only with reason 'not_submitted' (nothing was sent)
--      needs_attention -> claim unchanged (stays filing); a person must look
--      exported        -> claim unchanged (stays filing); in a bulk CSV
--    An in-progress job can be finished only by its lock owner.
create or replace function public.filing_job_finish(
  p_job_id              uuid,
  p_lock_owner          text,
  p_job_status          text,
  p_claim_status        text default null,
  p_confirmation_number text default null,
  p_result              jsonb default '{}'::jsonb,
  p_evidence            jsonb default '[]'::jsonb,
  p_reason              text default null,
  p_actor               text default 'staff',
  p_detail              jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim_id uuid;
  v_old      public.claims%rowtype;
  v_claim    public.claims%rowtype;
  v_job      public.claim_filing_jobs%rowtype;
  v_number   text := nullif(btrim(p_confirmation_number), '');
  v_ok       boolean;
begin
  v_ok := case p_job_status
    when 'filed' then p_claim_status in ('filed_by_claimmatch', 'submitted')
    when 'rejected' then p_claim_status = 'filing_rejected'
    when 'cancelled' then p_claim_status in ('needs_you', 'self_file')
    when 'queued' then p_claim_status = 'queued' and p_reason = 'not_submitted'
    when 'needs_attention' then p_claim_status is null
    when 'exported' then p_claim_status is null
    else false end;
  if not coalesce(v_ok, false) then
    raise exception 'job % with claim % is not a valid outcome', p_job_status, coalesce(p_claim_status, '(unchanged)')
      using errcode = '22023';
  end if;
  if (p_claim_status = 'submitted') <> (v_number is not null) and p_job_status = 'filed' then
    raise exception 'submitted goes with the administrator''s confirmation number, and only submitted'
      using errcode = '22023';
  end if;
  if v_number is not null and (p_job_status <> 'filed' or char_length(v_number) > 100) then
    raise exception 'a confirmation number (up to 100 characters) comes only with a filed job' using errcode = '22023';
  end if;
  if p_job_status in ('rejected', 'cancelled', 'needs_attention', 'queued')
     and (p_reason is null or p_reason !~ '^[a-z][a-z0-9_]{0,63}$') then
    raise exception 'a reason code is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'result must be an object and evidence an array' using errcode = '22023';
  end if;

  select claim_id into v_claim_id from public.claim_filing_jobs where id = p_job_id;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select * into v_old from public.claims where id = v_claim_id for update;
  select * into v_job from public.claim_filing_jobs where id = p_job_id for update;
  if v_job.status not in ('in_progress', 'exported', 'needs_attention') then
    raise exception 'job % is %', v_job.id, v_job.status using errcode = 'CM013';
  end if;
  if v_job.status = 'in_progress' and v_job.lock_owner is distinct from p_lock_owner then
    raise exception 'this job is locked by someone else' using errcode = 'CM005';
  end if;

  update public.claim_filing_jobs set
    status = p_job_status,
    locked_at = null,
    lock_owner = null,
    lock_expires_at = null,
    confirmation_number = coalesce(v_number, confirmation_number),
    result = result || coalesce(p_result, '{}'::jsonb),
    evidence = evidence || coalesce(p_evidence, '[]'::jsonb),
    needs_attention_reason = case when p_job_status = 'needs_attention' then p_reason else needs_attention_reason end,
    closed_reason = case when p_job_status in ('rejected', 'cancelled') then p_reason else closed_reason end,
    filed_at = case when p_job_status = 'filed' then now() else filed_at end,
    closed_at = case when p_job_status in ('filed', 'rejected', 'cancelled') then now() else null end,
    run_after = case when p_job_status = 'queued' then now() else run_after end
  where id = p_job_id
  returning * into v_job;

  if p_job_status = 'cancelled' then
    insert into public.claim_signature_voids (signature_id, claim_id, user_id, reason, actor, detail)
    values (v_job.signature_id, v_job.claim_id, v_job.user_id, p_reason, p_actor, jsonb_build_object('job_id', v_job.id))
    on conflict (signature_id) do nothing;
    update public.claim_packets set status = 'open', signature_id = null, signed_at = null, revision = revision + 1
     where id = v_job.packet_id and status = 'signed';
  elsif p_job_status in ('filed', 'rejected') then
    update public.claim_packets set status = 'closed' where id = v_job.packet_id and status <> 'closed';
  end if;

  v_claim := v_old;
  if p_claim_status is not null and p_claim_status <> v_old.status::text then
    update public.claims
       set status = p_claim_status::public.claim_status,
           confirmation_number = coalesce(v_number, confirmation_number)
     where id = v_old.id
    returning * into v_claim;
    insert into public.claim_events (claim_id, user_id, from_status, to_status, actor, detail)
    values (v_old.id, v_old.user_id, v_old.status::text, p_claim_status, p_actor,
            coalesce(p_detail, '{}'::jsonb)
            || jsonb_build_object('action', 'filing_result', 'job_id', v_job.id, 'job_status', p_job_status,
                                  'channel', v_job.channel, 'reason', p_reason,
                                  'with_confirmation_number', v_number is not null));
  end if;
  return jsonb_build_object('job', to_jsonb(v_job), 'claim', to_jsonb(v_claim));
end $$;

-- 3. Law-firm approvals: a legal_reviewer approves a draft spec or policy
--    version; the previously approved version of that target is superseded.
create or replace function public.filing_approve_spec(
  p_spec_id            uuid,
  p_reviewer_id        uuid,
  p_notes              text,
  p_documents_reviewed jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_spec public.filing_specs%rowtype;
begin
  if not public.filing_has_role(p_reviewer_id, 'legal_reviewer') then
    raise exception 'only a legal_reviewer can approve a filing spec' using errcode = 'CM006';
  end if;
  if nullif(btrim(p_notes), '') is null or jsonb_typeof(p_documents_reviewed) is distinct from 'array'
     or jsonb_array_length(p_documents_reviewed) = 0 then
    raise exception 'approval notes and the documents reviewed are required' using errcode = '22023';
  end if;
  select * into v_spec from public.filing_specs where id = p_spec_id for update;
  if not found then raise exception 'spec not found' using errcode = 'P0002'; end if;
  if v_spec.status <> 'draft' then
    raise exception 'spec % is %, not a draft', v_spec.id, v_spec.status using errcode = 'CM007';
  end if;
  if nullif(btrim(v_spec.content -> 'attestation' ->> 'text'), '') is null
     or nullif(btrim(v_spec.content -> 'class_definition' ->> 'text'), '') is null
     or nullif(btrim(v_spec.content -> 'official_form' ->> 'url'), '') is null then
    raise exception 'the spec lacks the verbatim statement, class definition or official form link'
      using errcode = '22023';
  end if;
  update public.filing_specs set status = 'superseded'
   where lawsuit_id = v_spec.lawsuit_id and status = 'approved';
  update public.filing_specs
     set status = 'approved', approved_by = p_reviewer_id, approved_at = now(),
         approval_notes = btrim(p_notes), documents_reviewed = p_documents_reviewed
   where id = p_spec_id
  returning * into v_spec;
  return to_jsonb(v_spec);
end $$;

create or replace function public.filing_approve_policy(
  p_policy_id          uuid,
  p_reviewer_id        uuid,
  p_notes              text,
  p_documents_reviewed jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_policy public.filing_policies%rowtype;
begin
  if not public.filing_has_role(p_reviewer_id, 'legal_reviewer') then
    raise exception 'only a legal_reviewer can approve a filing policy' using errcode = 'CM006';
  end if;
  if nullif(btrim(p_notes), '') is null or jsonb_typeof(p_documents_reviewed) is distinct from 'array'
     or jsonb_array_length(p_documents_reviewed) = 0 then
    raise exception 'approval notes and the documents reviewed are required' using errcode = '22023';
  end if;
  select * into v_policy from public.filing_policies where id = p_policy_id for update;
  if not found then raise exception 'policy not found' using errcode = 'P0002'; end if;
  if v_policy.status <> 'draft' then
    raise exception 'policy % is %, not a draft', v_policy.id, v_policy.status using errcode = 'CM007';
  end if;
  update public.filing_policies set status = 'superseded', updated_by = p_reviewer_id
   where status = 'approved'
     and ((v_policy.lawsuit_id is not null and lawsuit_id = v_policy.lawsuit_id)
          or (v_policy.administrator_id is not null and administrator_id = v_policy.administrator_id));
  update public.filing_policies
     set status = 'approved', approved_by = p_reviewer_id, approved_at = now(),
         approval_notes = btrim(p_notes), documents_reviewed = p_documents_reviewed
   where id = p_policy_id
  returning * into v_policy;
  return to_jsonb(v_policy);
end $$;

revoke all on function
  public.filing_job_claim_next(text, text, text, uuid, integer),
  public.filing_job_finish(uuid, text, text, text, text, jsonb, jsonb, text, text, jsonb),
  public.filing_approve_spec(uuid, uuid, text, jsonb),
  public.filing_approve_policy(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.filing_job_claim_next(text, text, text, uuid, integer),
  public.filing_job_finish(uuid, text, text, text, text, jsonb, jsonb, text, text, jsonb),
  public.filing_approve_spec(uuid, uuid, text, jsonb),
  public.filing_approve_policy(uuid, uuid, text, jsonb)
  to service_role;
