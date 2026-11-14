-- Lawsuit AI 0038: one-click filing, integrity triggers (CONTRACT).
-- EXPAND ONLY. Do not edit 0037 or earlier. Design: docs/designs/one-click-filing.md.
--
-- These triggers hold whatever the caller does (route code, a console, SQL):
--   * claims move between one-click statuses only along the allowed edges;
--   * signed or closed packets keep their content; a signature, its void, a
--     Jev run and an audit row are never rewritten;
--   * only an active legal_reviewer approves or supersedes a policy, approves
--     or retires a spec, turns a kill switch off, clears an objection or adds
--     a legal_reviewer; a new policy or spec version is always a draft;
--   * child rows take their owner from their parent, so a job always matches
--     the signature it carries out.
-- Errors use SQLSTATE CMnnn (list in docs/designs/one-click-filing.md, section 6).
-- Safe to re-run. Nothing is deleted or rewritten.

create or replace function public.filing_has_role(p_user_id uuid, p_role text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.staff_roles r
                  where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null)
$$;

-- 1. The claim state machine for the agent lanes. Mirrors CLAIM_TRANSITIONS
--    in src/lib/filing/v2/contract.ts; change both together.
create or replace function public.filing_claim_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_from, '') || '>' || coalesce(p_to, '') = any (array[
    '>preparing',
    'self_file>preparing', 'self_file>ready',
    'preparing>ready', 'preparing>self_file', 'preparing>withdrawn',
    'ready>preparing', 'ready>signed', 'ready>self_file', 'ready>withdrawn',
    'signed>queued', 'signed>preparing', 'signed>ready', 'signed>needs_you',
    'signed>self_file', 'signed>withdrawn',
    'queued>filing', 'queued>preparing', 'queued>ready', 'queued>needs_you',
    'queued>self_file', 'queued>withdrawn',
    'filing>queued', 'filing>filed_by_claimmatch', 'filing>submitted', 'filing>filing_rejected',
    'filing>needs_you', 'filing>self_file',
    'filed_by_claimmatch>submitted', 'filed_by_claimmatch>filing_rejected',
    'needs_you>preparing', 'needs_you>ready', 'needs_you>self_file', 'needs_you>withdrawn',
    'filing_rejected>self_file', 'filing_rejected>withdrawn'
  ])
$$;

create or replace function public.claims_filing_status_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  agent_lane constant text[] := array['preparing', 'ready', 'signed', 'queued', 'filing',
                                      'filed_by_claimmatch', 'needs_you', 'filing_rejected'];
  v_from text := case when tg_op = 'INSERT' then null else old.status::text end;
  v_to   text := new.status::text;
begin
  if v_from is not distinct from v_to then
    return new;
  end if;
  if (v_from = any (agent_lane) or v_to = any (agent_lane))
     and not public.filing_claim_transition_allowed(v_from, v_to) then
    raise exception 'claim status % -> % is not allowed', coalesce(v_from, '(new)'), v_to
      using errcode = 'CM001';
  end if;
  -- A closed packet (filed, rejected or withdrawn) never returns to the agent lane.
  if v_to in ('preparing', 'ready') and tg_op = 'UPDATE' and exists (
       select 1 from public.claim_packets p where p.claim_id = new.id and p.status = 'closed') then
    raise exception 'this claim''s packet is closed: it cannot go back to %', v_to using errcode = 'CM001';
  end if;
  return new;
end $$;

drop trigger if exists claims_filing_status_guard on public.claims;
create trigger claims_filing_status_guard before insert or update of status on public.claims
  for each row execute function public.claims_filing_status_guard();

-- 2. Append-only records.
create or replace function public.filing_immutable_row()
returns trigger language plpgsql as $$
begin
  raise exception '% rows are append-only', tg_table_name using errcode = 'CM014';
end $$;

drop trigger if exists claim_signatures_immutable on public.claim_signatures;
create trigger claim_signatures_immutable before update on public.claim_signatures
  for each row execute function public.filing_immutable_row();
drop trigger if exists claim_signature_voids_immutable on public.claim_signature_voids;
create trigger claim_signature_voids_immutable before update on public.claim_signature_voids
  for each row execute function public.filing_immutable_row();
drop trigger if exists jev_runs_immutable on public.jev_runs;
create trigger jev_runs_immutable before update on public.jev_runs
  for each row execute function public.filing_immutable_row();
drop trigger if exists filing_audit_log_immutable on public.filing_audit_log;
create trigger filing_audit_log_immutable before update or delete on public.filing_audit_log
  for each row execute function public.filing_immutable_row();

-- 3. Owners and consistency on insert: a child takes its owner from its parent.
create or replace function public.filing_child_before_insert()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  s public.claim_signatures%rowtype;
begin
  case tg_table_name
  when 'claim_packets' then
    select c.user_id, c.lawsuit_id into new.user_id, new.lawsuit_id from public.claims c where c.id = new.claim_id;
    if new.status <> 'open' then
      raise exception 'a packet starts open' using errcode = 'CM002';
    end if;
  when 'claim_documents' then
    select c.user_id into new.user_id from public.claims c where c.id = new.claim_id;
    if new.packet_id is not null and not exists (
         select 1 from public.claim_packets p
          where p.id = new.packet_id and p.claim_id = new.claim_id
            and (new.source <> 'member' or p.status = 'open')) then
      raise exception 'documents attach only to this claim''s open packet' using errcode = 'CM002';
    end if;
    if new.status not in ('pending_upload', 'stored') then
      raise exception 'a document starts pending_upload or stored' using errcode = 'CM002';
    end if;
    if new.job_id is not null and not exists (
         select 1 from public.claim_filing_jobs j where j.id = new.job_id and j.claim_id = new.claim_id) then
      raise exception 'evidence attaches only to a job of this claim' using errcode = 'CM002';
    end if;
  when 'claim_signatures' then
    select c.user_id, c.lawsuit_id into new.user_id, new.lawsuit_id from public.claims c where c.id = new.claim_id;
    if not exists (select 1 from public.claim_packets p where p.id = new.packet_id and p.claim_id = new.claim_id) then
      raise exception 'the signed packet belongs to another claim' using errcode = 'CM003';
    end if;
    if not exists (select 1 from public.esign_consents e where e.id = new.esign_consent_id
                    and e.user_id = new.user_id and e.withdrawn_at is null) then
      raise exception 'no active e-sign consent for this signer' using errcode = 'CM011';
    end if;
    new.signed_at := now();
  when 'claim_signature_voids' then
    select s2.claim_id, s2.user_id into new.claim_id, new.user_id
      from public.claim_signatures s2 where s2.id = new.signature_id;
    new.created_at := now();
  when 'jev_runs' then
    select p.claim_id, p.user_id into new.claim_id, new.user_id from public.claim_packets p where p.id = new.packet_id;
    new.created_at := now();
  when 'claim_filing_jobs' then
    select * into s from public.claim_signatures where id = new.signature_id;
    if not found or exists (select 1 from public.claim_signature_voids v where v.signature_id = s.id) then
      raise exception 'a job needs a live signature' using errcode = 'CM004';
    end if;
    if new.channel <> s.lane then
      raise exception 'the channel % is not the lane % the member signed for', new.channel, s.lane
        using errcode = 'CM012';
    end if;
    if new.status <> 'queued' then
      raise exception 'a job starts queued' using errcode = 'CM013';
    end if;
    new.claim_id := s.claim_id;
    new.user_id := s.user_id;
    new.lawsuit_id := s.lawsuit_id;
    new.packet_id := s.packet_id;
    new.packet_hash := s.packet_hash;
    new.spec_id := s.spec_id;
  when 'esign_consents' then
    new.consented_at := now();
    new.withdrawn_at := null;
  when 'filing_audit_log' then
    new.created_at := now();
  end case;
  return new;
end $$;

drop trigger if exists claim_packets_before_insert on public.claim_packets;
create trigger claim_packets_before_insert before insert on public.claim_packets
  for each row execute function public.filing_child_before_insert();
drop trigger if exists claim_documents_before_insert on public.claim_documents;
create trigger claim_documents_before_insert before insert on public.claim_documents
  for each row execute function public.filing_child_before_insert();
drop trigger if exists claim_signatures_before_insert on public.claim_signatures;
create trigger claim_signatures_before_insert before insert on public.claim_signatures
  for each row execute function public.filing_child_before_insert();
drop trigger if exists claim_signature_voids_before_insert on public.claim_signature_voids;
create trigger claim_signature_voids_before_insert before insert on public.claim_signature_voids
  for each row execute function public.filing_child_before_insert();
drop trigger if exists jev_runs_before_insert on public.jev_runs;
create trigger jev_runs_before_insert before insert on public.jev_runs
  for each row execute function public.filing_child_before_insert();
drop trigger if exists claim_filing_jobs_before_insert on public.claim_filing_jobs;
create trigger claim_filing_jobs_before_insert before insert on public.claim_filing_jobs
  for each row execute function public.filing_child_before_insert();
drop trigger if exists esign_consents_before_insert on public.esign_consents;
create trigger esign_consents_before_insert before insert on public.esign_consents
  for each row execute function public.filing_child_before_insert();
drop trigger if exists filing_audit_log_before_insert on public.filing_audit_log;
create trigger filing_audit_log_before_insert before insert on public.filing_audit_log
  for each row execute function public.filing_child_before_insert();

-- 4. Packets: frozen while signed or closed. Reopening needs a voided signature.
create or replace function public.claim_packets_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  old_content jsonb := jsonb_build_array(old.spec_id, old.spec_version, old.answers, old.member_snapshot,
    old.benefit_tier, old.payout_method, old.class_definition_confirmed_at, old.health_consent_at,
    old.health_consent_text_sha256, old.packet_hash);
  new_content jsonb := jsonb_build_array(new.spec_id, new.spec_version, new.answers, new.member_snapshot,
    new.benefit_tier, new.payout_method, new.class_definition_confirmed_at, new.health_consent_at,
    new.health_consent_text_sha256, new.packet_hash);
begin
  if (new.claim_id, new.user_id, new.lawsuit_id, new.created_at)
     is distinct from (old.claim_id, old.user_id, old.lawsuit_id, old.created_at) then
    raise exception 'a packet keeps its claim and owner' using errcode = 'CM002';
  end if;
  if old.status = 'open' then
    if new.status = 'signed' and not exists (
         select 1 from public.claim_signatures s
          where s.id = new.signature_id and s.packet_id = new.id and s.packet_hash = new.packet_hash
            and not exists (select 1 from public.claim_signature_voids v where v.signature_id = s.id)) then
      raise exception 'a packet is signed only by a live signature of its current hash' using errcode = 'CM004';
    end if;
    return new;
  end if;
  if new_content is distinct from old_content then
    raise exception 'packet % is % and its content cannot change', old.id, old.status using errcode = 'CM002';
  end if;
  if old.status = 'signed' and new.status = 'signed'
     and (new.signature_id, new.signed_at) is not distinct from (old.signature_id, old.signed_at) then
    return new;
  end if;
  if old.status = 'signed' and new.status = 'open' then
    if not exists (select 1 from public.claim_signature_voids v where v.signature_id = old.signature_id) then
      raise exception 'void the signature before reopening the packet' using errcode = 'CM004';
    end if;
    return new;
  end if;
  if new.status = 'closed' and (old.status = 'signed' or new.signature_id is not distinct from old.signature_id) then
    return new;
  end if;
  raise exception 'packet % cannot go from % to %', old.id, old.status, new.status using errcode = 'CM002';
end $$;

drop trigger if exists claim_packets_guard on public.claim_packets;
create trigger claim_packets_guard before update on public.claim_packets
  for each row execute function public.claim_packets_guard();

-- 5. Documents: identity fixed; hash set once; no removal from a signed packet.
create or replace function public.claim_documents_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.claim_id, new.user_id, new.packet_id, new.job_id, new.source, new.kind, new.storage_path,
      new.mime, new.health_flag, new.uploaded_by, new.created_at)
     is distinct from (old.claim_id, old.user_id, old.packet_id, old.job_id, old.source, old.kind,
      old.storage_path, old.mime, old.health_flag, old.uploaded_by, old.created_at) then
    raise exception 'a document keeps its owner, place and type' using errcode = 'CM002';
  end if;
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
    raise exception 'a document hash is set once' using errcode = 'CM002';
  end if;
  if old.status <> 'pending_upload' and new.size_bytes <> old.size_bytes then
    raise exception 'a stored document keeps its size' using errcode = 'CM002';
  end if;
  if new.status <> old.status and not (
       (old.status = 'pending_upload' and new.status in ('stored', 'rejected', 'deleted'))
       or (old.status in ('stored', 'rejected') and new.status = 'deleted')) then
    raise exception 'document status % -> % is not allowed', old.status, new.status using errcode = 'CM002';
  end if;
  if old.source = 'member' and new.status <> old.status then
    -- A stored document of a signed packet is part of what was signed.
    if old.status = 'stored' and exists (
         select 1 from public.claim_packets p where p.id = old.packet_id and p.status = 'signed') then
      raise exception 'the packet is signed: its documents cannot change' using errcode = 'CM002';
    end if;
    -- Uploads complete only into an open packet.
    if new.status = 'stored' and not exists (
         select 1 from public.claim_packets p where p.id = old.packet_id and p.status = 'open') then
      raise exception 'uploads complete only while the packet is open' using errcode = 'CM002';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists claim_documents_guard on public.claim_documents;
create trigger claim_documents_guard before update on public.claim_documents
  for each row execute function public.claim_documents_guard();

-- 6. Jobs: carry out one signature; status moves only forward along the edges
--    below; a closed job changes no more, except a filed job's late number.
create or replace function public.claim_filing_jobs_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.claim_id, new.user_id, new.lawsuit_id, new.packet_id, new.signature_id, new.packet_hash,
      new.policy_id, new.spec_id, new.channel, new.idempotency_key, new.created_at)
     is distinct from (old.claim_id, old.user_id, old.lawsuit_id, old.packet_id, old.signature_id,
      old.packet_hash, old.policy_id, old.spec_id, old.channel, old.idempotency_key, old.created_at) then
    raise exception 'a filing job keeps its claim, signature and channel' using errcode = 'CM013';
  end if;
  if old.status in ('rejected', 'cancelled') then
    raise exception 'filing job % is % and cannot change', old.id, old.status using errcode = 'CM013';
  end if;
  if old.status = 'filed' and (new.status <> 'filed'
       or (old.confirmation_number is not null and new.confirmation_number is distinct from old.confirmation_number)
       or new.filed_at is distinct from old.filed_at) then
    raise exception 'a filed job only gains a confirmation number or evidence' using errcode = 'CM013';
  end if;
  if new.status <> old.status and not (
       (old.status = 'queued' and new.status in ('in_progress', 'needs_attention', 'cancelled'))
       or (old.status = 'in_progress' and new.status in ('queued', 'exported', 'needs_attention',
                                                          'filed', 'rejected', 'cancelled'))
       or (old.status = 'exported' and new.status in ('needs_attention', 'filed', 'rejected'))
       or (old.status = 'needs_attention' and new.status in ('queued', 'filed', 'rejected', 'cancelled'))) then
    raise exception 'filing job status % -> % is not allowed', old.status, new.status using errcode = 'CM013';
  end if;
  return new;
end $$;

drop trigger if exists claim_filing_jobs_guard on public.claim_filing_jobs;
create trigger claim_filing_jobs_guard before update on public.claim_filing_jobs
  for each row execute function public.claim_filing_jobs_guard();

-- 7. E-sign consent: only a single withdrawal.
create or replace function public.esign_consents_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.withdrawn_at is not null or new.withdrawn_at is null
     or (to_jsonb(new) - 'withdrawn_at') is distinct from (to_jsonb(old) - 'withdrawn_at') then
    raise exception 'an e-sign consent can only be withdrawn, once' using errcode = 'CM014';
  end if;
  return new;
end $$;

drop trigger if exists esign_consents_guard on public.esign_consents;
create trigger esign_consents_guard before update on public.esign_consents
  for each row execute function public.esign_consents_guard();

-- 8. Policies and specs: drafts change freely; only a legal_reviewer decides;
--    a decided version is frozen (approved -> superseded, or a spec retired).
create or replace function public.filing_policies_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.lawsuit_id, new.administrator_id, new.version, new.created_at)
     is distinct from (old.lawsuit_id, old.administrator_id, old.version, old.created_at) then
    raise exception 'a policy version keeps its target and number' using errcode = 'CM007';
  end if;
  if old.status = 'draft' then
    if new.status = 'approved' and not public.filing_has_role(new.approved_by, 'legal_reviewer') then
      raise exception 'only a legal_reviewer can approve a filing policy' using errcode = 'CM006';
    end if;
    if new.status = 'rejected' and not public.filing_has_role(new.rejected_by, 'legal_reviewer') then
      raise exception 'only a legal_reviewer can reject a filing policy' using errcode = 'CM006';
    end if;
    if new.status not in ('draft', 'approved', 'rejected') then
      raise exception 'a draft policy can only be edited, approved or rejected' using errcode = 'CM007';
    end if;
    return new;
  end if;
  -- Superseding can lift an administrator-level restriction, so it is a
  -- legal_reviewer's act too (filing_approve_policy records the reviewer in updated_by).
  if old.status = 'approved' and new.status = 'superseded'
     and (to_jsonb(new) - array['status', 'updated_at', 'updated_by'])
         = (to_jsonb(old) - array['status', 'updated_at', 'updated_by']) then
    if not public.filing_has_role(new.updated_by, 'legal_reviewer') then
      raise exception 'only a legal_reviewer can supersede a filing policy' using errcode = 'CM006';
    end if;
    return new;
  end if;
  raise exception 'filing policy % is % and cannot change', old.id, old.status using errcode = 'CM007';
end $$;

drop trigger if exists filing_policies_guard on public.filing_policies;
create trigger filing_policies_guard before update on public.filing_policies
  for each row execute function public.filing_policies_guard();

create or replace function public.filing_specs_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  frozen constant text[] := array['status', 'updated_at', 'retired_by', 'retired_at', 'retire_reason'];
begin
  if (new.lawsuit_id, new.version, new.created_at) is distinct from (old.lawsuit_id, old.version, old.created_at) then
    raise exception 'a spec version keeps its settlement and number' using errcode = 'CM007';
  end if;
  if old.status = 'draft' then
    if new.status = 'approved' and not public.filing_has_role(new.approved_by, 'legal_reviewer') then
      raise exception 'only a legal_reviewer can approve a filing spec' using errcode = 'CM006';
    end if;
    if new.status not in ('draft', 'approved') then
      raise exception 'a draft spec can only be edited or approved' using errcode = 'CM007';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - frozen) = (to_jsonb(old) - frozen)
     and ((old.status = 'approved' and new.status in ('superseded', 'retired'))
          or (old.status = 'superseded' and new.status = 'retired')) then
    if new.status = 'retired' and not public.filing_has_role(new.retired_by, 'legal_reviewer') then
      raise exception 'only a legal_reviewer can retire a filing spec' using errcode = 'CM006';
    end if;
    return new;
  end if;
  raise exception 'filing spec % is % and cannot change', old.id, old.status using errcode = 'CM007';
end $$;

drop trigger if exists filing_specs_guard on public.filing_specs;
create trigger filing_specs_guard before update on public.filing_specs
  for each row execute function public.filing_specs_guard();

-- Kill switch and objection take effect at once; turning either off needs a legal_reviewer.
create or replace function public.filing_controls_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.lawsuit_id, new.administrator_id) is distinct from (old.lawsuit_id, old.administrator_id) then
    raise exception 'a control row keeps its target' using errcode = 'CM007';
  end if;
  if old.kill_switch and not new.kill_switch
     and not public.filing_has_role(new.kill_switch_changed_by, 'legal_reviewer') then
    raise exception 'only a legal_reviewer can turn a kill switch off' using errcode = 'CM006';
  end if;
  if old.objection_received_at is not null and new.objection_received_at is null
     and not public.filing_has_role(new.objection_changed_by, 'legal_reviewer') then
    raise exception 'only a legal_reviewer can clear an objection' using errcode = 'CM006';
  end if;
  return new;
end $$;

drop trigger if exists filing_controls_guard on public.filing_controls;
create trigger filing_controls_guard before update on public.filing_controls
  for each row execute function public.filing_controls_guard();

-- A policy or spec version is born a draft: an insert can never carry an approval.
create or replace function public.filing_config_before_insert()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status <> 'draft' or exists (
       select 1 from jsonb_each(to_jsonb(new)) f
        where f.key in ('approved_by', 'approved_at', 'approval_notes', 'documents_reviewed', 'rejected_by',
                        'rejected_at', 'rejection_notes', 'retired_by', 'retired_at', 'retire_reason')
          and f.value <> 'null'::jsonb) then
    raise exception 'a new % version starts as a plain draft', tg_table_name using errcode = 'CM007';
  end if;
  return new;
end $$;

drop trigger if exists filing_policies_before_insert on public.filing_policies;
create trigger filing_policies_before_insert before insert on public.filing_policies
  for each row execute function public.filing_config_before_insert();
drop trigger if exists filing_specs_before_insert on public.filing_specs;
create trigger filing_specs_before_insert before insert on public.filing_specs
  for each row execute function public.filing_config_before_insert();

-- Staff roles: only an active legal_reviewer adds a legal_reviewer (granted_by
-- is null only for the founder's one bootstrap SQL insert); a role row never
-- changes its user or role, and is revoked at most once.
create or replace function public.staff_roles_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'legal_reviewer' and new.granted_by is not null
       and not public.filing_has_role(new.granted_by, 'legal_reviewer') then
      raise exception 'only a legal_reviewer can add a legal_reviewer' using errcode = 'CM006';
    end if;
    new.granted_at := now();
    new.revoked_at := null;
    new.revoked_by := null;
    return new;
  end if;
  if old.revoked_at is not null
     or (to_jsonb(new) - array['revoked_at', 'revoked_by', 'notes'])
        is distinct from (to_jsonb(old) - array['revoked_at', 'revoked_by', 'notes']) then
    raise exception 'a staff role can only be revoked, once' using errcode = 'CM014';
  end if;
  return new;
end $$;

drop trigger if exists staff_roles_guard on public.staff_roles;
create trigger staff_roles_guard before insert or update on public.staff_roles
  for each row execute function public.staff_roles_guard();

-- 9. updated_at (0001's touch_updated_at): triggers <table>_touch.
do $$
declare
  t text;
begin
  foreach t in array array['filing_policies', 'filing_controls', 'filing_specs', 'claim_packets',
                           'claim_documents', 'claim_filing_jobs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- 10. None of these is callable through the API; the server may use the two helpers.
revoke all on function public.filing_has_role(uuid, text) from public, anon, authenticated;
revoke all on function public.filing_claim_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function public.claims_filing_status_guard() from public, anon, authenticated;
revoke all on function public.filing_immutable_row() from public, anon, authenticated;
revoke all on function public.filing_child_before_insert() from public, anon, authenticated;
revoke all on function public.claim_packets_guard() from public, anon, authenticated;
revoke all on function public.claim_documents_guard() from public, anon, authenticated;
revoke all on function public.claim_filing_jobs_guard() from public, anon, authenticated;
revoke all on function public.esign_consents_guard() from public, anon, authenticated;
revoke all on function public.filing_policies_guard() from public, anon, authenticated;
revoke all on function public.filing_specs_guard() from public, anon, authenticated;
revoke all on function public.filing_controls_guard() from public, anon, authenticated;
revoke all on function public.filing_config_before_insert() from public, anon, authenticated;
revoke all on function public.staff_roles_guard() from public, anon, authenticated;
grant execute on function public.filing_has_role(uuid, text) to service_role;
grant execute on function public.filing_claim_transition_allowed(text, text) to service_role;
