-- Lawsuit AI 0037: one-click filing, tables and row security (CONTRACT).
-- EXPAND ONLY. Do not edit 0036 or earlier. Design: docs/designs/one-click-filing.md.
--
-- Inert until ONE_CLICK_FILING_ENABLED=1. Every integrity-critical write is made
-- by server code with the service role, through the functions of 0039 (member
-- side) and 0040 (staff side); 0038's triggers hold whatever the caller. Members
-- only read their own packets, uploads, signatures, voids and e-sign consents.
--
-- Runs in one transaction: the new claim_status values are added first and
-- nothing in this file uses them.
-- Safe to re-run. Nothing is deleted or rewritten. One existing grant changes
-- (Phase 0): members can no longer insert claim_authorizations rows.
-- Rollback, only while every new table is empty: drop the functions of 0040,
-- 0039 and 0038, then these tables in reverse order; enum values stay.

-- 1. Claim statuses for the agent lanes (meanings in the design doc, section 4).
--    'rejected' is a legacy value of the retired flow, hence 'filing_rejected'.
alter type public.claim_status add value if not exists 'preparing';
alter type public.claim_status add value if not exists 'ready';
alter type public.claim_status add value if not exists 'signed';
alter type public.claim_status add value if not exists 'queued';
alter type public.claim_status add value if not exists 'filing';
alter type public.claim_status add value if not exists 'filed_by_claimmatch';
alter type public.claim_status add value if not exists 'needs_you';
alter type public.claim_status add value if not exists 'filing_rejected';

-- 2. Staff roles. legal_reviewer = the law firm on retainer; filing_agent = desk staff.
create table if not exists public.staff_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('legal_reviewer', 'filing_agent')),
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid,
  revoked_at  timestamptz,
  notes       text check (notes is null or char_length(notes) <= 2000),
  constraint staff_roles_no_self_legal_grant
    check (role <> 'legal_reviewer' or granted_by is distinct from user_id)
);
create unique index if not exists staff_roles_active_idx
  on public.staff_roles (user_id, role) where revoked_at is null;

-- 3. Filing policies: versioned per settlement or per administrator. Staff
--    draft; only a legal_reviewer approves (checked again by the trigger).
create table if not exists public.filing_policies (
  id                          uuid primary key default gen_random_uuid(),
  lawsuit_id                  uuid references public.lawsuits (id) on delete cascade,
  administrator_id            uuid references public.administrators (id) on delete cascade,
  version                     integer not null check (version >= 1),
  status                      text not null default 'draft'
                              check (status in ('draft', 'approved', 'superseded', 'rejected')),
  agent_filing                text not null default 'unknown'
                              check (agent_filing in ('unknown', 'allowed', 'prohibited')),
  channels                    jsonb not null default '[]'::jsonb check (jsonb_typeof(channels) = 'array'),
  agent_certification_allowed boolean not null default false,
  allowed_states              text[],
  health_sensitive            boolean not null default false,
  health_consent_text         text,
  identity_check_required     boolean not null default false,
  sources_reviewed            jsonb not null default '[]'::jsonb
                              check (jsonb_typeof(sources_reviewed) = 'array'),
  notes                       text,
  created_by                  uuid,
  updated_by                  uuid,
  approved_by                 uuid,
  approved_at                 timestamptz,
  approval_notes              text,
  documents_reviewed          jsonb,
  rejected_by                 uuid,
  rejected_at                 timestamptz,
  rejection_notes             text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint filing_policies_one_target check ((lawsuit_id is null) <> (administrator_id is null)),
  constraint filing_policies_approval_recorded check (
    status not in ('approved', 'superseded')
    or (approved_by is not null and approved_at is not null
        and jsonb_typeof(documents_reviewed) = 'array' and jsonb_array_length(documents_reviewed) > 0))
);
create unique index if not exists filing_policies_lawsuit_version_idx
  on public.filing_policies (lawsuit_id, version) where lawsuit_id is not null;
create unique index if not exists filing_policies_admin_version_idx
  on public.filing_policies (administrator_id, version) where administrator_id is not null;
-- At most one draft and one approved version per target.
create unique index if not exists filing_policies_lawsuit_live_idx
  on public.filing_policies (lawsuit_id, status) where lawsuit_id is not null and status in ('draft', 'approved');
create unique index if not exists filing_policies_admin_live_idx
  on public.filing_policies (administrator_id, status) where administrator_id is not null and status in ('draft', 'approved');

-- 4. Kill switch and objection, per settlement or administrator: take effect
--    at once (no approval). Turning either off needs a legal_reviewer.
create table if not exists public.filing_controls (
  id                     uuid primary key default gen_random_uuid(),
  lawsuit_id             uuid unique references public.lawsuits (id) on delete cascade,
  administrator_id       uuid unique references public.administrators (id) on delete cascade,
  kill_switch            boolean not null default false,
  kill_switch_reason     text,
  kill_switch_changed_by uuid,
  kill_switch_changed_at timestamptz,
  objection_received_at  timestamptz,
  objection_notes        text,
  objection_changed_by   uuid,
  objection_changed_at   timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint filing_controls_one_target check ((lawsuit_id is null) <> (administrator_id is null)),
  constraint filing_controls_kill_reason
    check (not kill_switch or nullif(btrim(kill_switch_reason), '') is not null)
);

-- 5. Filing specs: the official form, versioned per settlement (content shape:
--    FilingSpecContentSchema in src/lib/filing/v2/contract-spec.ts).
create table if not exists public.filing_specs (
  id                 uuid primary key default gen_random_uuid(),
  lawsuit_id         uuid not null references public.lawsuits (id) on delete cascade,
  version            integer not null check (version >= 1),
  status             text not null default 'draft'
                     check (status in ('draft', 'approved', 'superseded', 'retired')),
  content            jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_by         uuid,
  updated_by         uuid,
  approved_by        uuid,
  approved_at        timestamptz,
  approval_notes     text,
  documents_reviewed jsonb,
  retired_by         uuid,
  retired_at         timestamptz,
  retire_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint filing_specs_version_unique unique (lawsuit_id, version),
  constraint filing_specs_approval_recorded check (
    status = 'draft'
    or (approved_by is not null and approved_at is not null
        and jsonb_typeof(documents_reviewed) = 'array' and jsonb_array_length(documents_reviewed) > 0)),
  constraint filing_specs_retire_recorded
    check (status <> 'retired' or (retired_at is not null and nullif(btrim(retire_reason), '') is not null))
);
create unique index if not exists filing_specs_live_idx
  on public.filing_specs (lawsuit_id, status) where status in ('draft', 'approved');

-- 6. Claim packets: one per claim. Members never write it directly; while it is
--    'signed' or 'closed' its content cannot change (trigger below).
create table if not exists public.claim_packets (
  id                            uuid primary key default gen_random_uuid(),
  claim_id                      uuid not null unique references public.claims (id) on delete cascade,
  user_id                       uuid not null references auth.users (id) on delete cascade,
  lawsuit_id                    uuid not null references public.lawsuits (id) on delete cascade,
  spec_id                       uuid references public.filing_specs (id),
  spec_version                  integer,
  status                        text not null default 'open' check (status in ('open', 'signed', 'closed')),
  revision                      integer not null default 1 check (revision >= 1),
  answers                       jsonb not null default '{}'::jsonb
                                check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536),
  member_snapshot               jsonb not null default '{}'::jsonb
                                check (jsonb_typeof(member_snapshot) = 'object' and octet_length(member_snapshot::text) <= 8192),
  benefit_tier                  text,
  payout_method                 text,
  class_definition_confirmed_at timestamptz,
  health_consent_at             timestamptz,
  health_consent_text_sha256    text check (health_consent_text_sha256 ~ '^[0-9a-f]{64}$'),
  packet_hash                   text check (packet_hash ~ '^[0-9a-f]{64}$'),
  jev_outcome                   text check (jev_outcome in ('pass', 'warn', 'block')),
  jev_result                    jsonb,
  jev_checked_at                timestamptz,
  signature_id                  uuid,
  signed_at                     timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint claim_packets_spec_pair check ((spec_id is null) = (spec_version is null)),
  constraint claim_packets_signed_has_signature
    check (status <> 'signed' or (signature_id is not null and signed_at is not null)),
  constraint claim_packets_open_has_no_signature
    check (status <> 'open' or (signature_id is null and signed_at is null))
);
create index if not exists claim_packets_user_idx on public.claim_packets (user_id);

-- 7. Uploaded proof (member) and filing evidence (staff screenshots). Files
--    live in the private claim-documents bucket under {user_id}/{claim_id}/.
create table if not exists public.claim_documents (
  id                uuid primary key default gen_random_uuid(),
  claim_id          uuid not null references public.claims (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  packet_id         uuid references public.claim_packets (id) on delete cascade,
  job_id            uuid,
  source            text not null default 'member' check (source in ('member', 'staff_evidence')),
  kind              text not null check (kind ~ '^[a-z][a-z0-9_]{0,63}$'),
  storage_path      text not null unique,
  mime              text not null check (mime in ('image/jpeg', 'image/png', 'image/heic', 'image/heif',
                                                  'image/webp', 'application/pdf')),
  size_bytes        bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256            text check (sha256 ~ '^[0-9a-f]{64}$'),
  status            text not null default 'pending_upload'
                    check (status in ('pending_upload', 'stored', 'rejected', 'deleted')),
  health_flag       boolean not null default false,
  uploaded_by       uuid,
  upload_expires_at timestamptz,
  stored_at         timestamptz,
  deleted_at        timestamptz,
  delete_reason     text check (delete_reason in ('member_removed', 'upload_expired', 'rejected', 'retention')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint claim_documents_path_prefix
    check (starts_with(storage_path, user_id::text || '/' || claim_id::text || '/')),
  constraint claim_documents_stored_has_hash check (status <> 'stored' or (sha256 is not null and stored_at is not null)),
  constraint claim_documents_deleted_pair check ((status = 'deleted') = (deleted_at is not null)),
  constraint claim_documents_member_has_packet check (source <> 'member' or packet_id is not null),
  constraint claim_documents_evidence_has_job check (source <> 'staff_evidence' or job_id is not null)
);
create index if not exists claim_documents_claim_idx on public.claim_documents (claim_id);

-- 8. E-SIGN consent (15 U.S.C. 7001(c)), once per user and text version.
--    Only withdrawn_at may change, once.
create table if not exists public.esign_consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  text_version     text not null check (char_length(text_version) between 1 and 64),
  full_text        text not null check (char_length(full_text) between 1 and 20000),
  text_sha256      text not null,
  context_claim_id uuid,
  ip               inet,
  user_agent       text check (char_length(user_agent) <= 512),
  consented_at     timestamptz not null default now(),
  withdrawn_at     timestamptz,
  constraint esign_consents_text_hash check (text_sha256 = encode(sha256(convert_to(full_text, 'UTF8')), 'hex')),
  constraint esign_consents_withdrawn_after check (withdrawn_at is null or withdrawn_at >= consented_at)
);
create unique index if not exists esign_consents_active_idx
  on public.esign_consents (user_id, text_version) where withdrawn_at is null;

-- 9. Signatures: one row per signing, a legal record. Nobody updates a row,
--    the service role included; only account deletion removes rows (the
--    law firm decides whether that stays so: go-live checklist).
create table if not exists public.claim_signatures (
  id                         uuid primary key default gen_random_uuid(),
  claim_id                   uuid not null references public.claims (id) on delete cascade,
  user_id                    uuid not null references auth.users (id) on delete cascade,
  lawsuit_id                 uuid not null references public.lawsuits (id) on delete cascade,
  packet_id                  uuid not null references public.claim_packets (id) on delete cascade,
  spec_id                    uuid not null references public.filing_specs (id),
  spec_version               integer not null,
  packet_hash                text not null check (packet_hash ~ '^[0-9a-f]{64}$'),
  packet_canonical           text not null,
  statement_text             text not null check (char_length(statement_text) between 1 and 20000),
  statement_sha256           text not null,
  authorization_text_version text not null,
  authorization_text         text not null,
  typed_name                 text not null check (char_length(btrim(typed_name)) between 2 and 200),
  lane                       text not null check (lane in ('filing_desk', 'administrator_email',
                                                           'administrator_bulk', 'administrator_api')),
  esign_consent_id           uuid not null references public.esign_consents (id),
  auth_method                text not null,
  auth_time                  timestamptz not null,
  session_id                 text,
  ip                         inet,
  user_agent                 text check (char_length(user_agent) <= 512),
  idempotency_key            text not null check (char_length(idempotency_key) between 8 and 128),
  jev_run_id                 uuid,
  signed_at                  timestamptz not null default now(),
  constraint claim_signatures_hash_matches
    check (packet_hash = encode(sha256(convert_to(packet_canonical, 'UTF8')), 'hex')),
  constraint claim_signatures_statement_hash
    check (statement_sha256 = encode(sha256(convert_to(statement_text, 'UTF8')), 'hex')),
  constraint claim_signatures_auth_first check (auth_time <= signed_at),
  constraint claim_signatures_idempotency unique (user_id, idempotency_key)
);
create index if not exists claim_signatures_claim_idx on public.claim_signatures (claim_id, signed_at);

-- A void ends what a signature authorizes (edit, withdrawal, hand-off). Append-only.
create table if not exists public.claim_signature_voids (
  id           uuid primary key default gen_random_uuid(),
  signature_id uuid not null unique references public.claim_signatures (id) on delete cascade,
  claim_id     uuid not null references public.claims (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  reason       text not null check (reason ~ '^[a-z][a-z0-9_]{0,63}$'),
  actor        text not null check (actor in ('user', 'system', 'staff')),
  detail       jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at   timestamptz not null default now()
);

-- 10. Every Jev run, stored ("we will log the data"). Server-only, append-only.
create table if not exists public.jev_runs (
  id             uuid primary key default gen_random_uuid(),
  claim_id       uuid not null references public.claims (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  packet_id      uuid not null references public.claim_packets (id) on delete cascade,
  mode           text not null check (mode in ('partial', 'pre_sign', 'pre_send')),
  triggered_by   text not null check (triggered_by in ('member_save', 'member_sign', 'worker', 'staff')),
  outcome        text not null check (outcome in ('pass', 'warn', 'block')),
  issues         jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  packet_hash    text check (packet_hash ~ '^[0-9a-f]{64}$'),
  spec_id        uuid,
  spec_version   integer,
  lane           text,
  rule_set_hash  text not null,
  engine_version text not null,
  created_at     timestamptz not null default now()
);
create index if not exists jev_runs_packet_idx on public.jev_runs (packet_id, created_at);

-- 11. Bulk exports (administrator_bulk): the CSV itself is never stored.
create table if not exists public.filing_export_batches (
  id                  uuid primary key default gen_random_uuid(),
  lawsuit_id          uuid not null references public.lawsuits (id) on delete cascade,
  policy_id           uuid references public.filing_policies (id),
  row_count           integer not null check (row_count between 1 and 5000),
  columns             jsonb not null check (jsonb_typeof(columns) = 'array'),
  file_sha256         text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  uploaded_by         uuid,
  uploaded_at         timestamptz,
  results_recorded_at timestamptz,
  notes               text
);

-- 12. Filing jobs for the agent lanes. Replaces 0015's filing_jobs, which
--     stays frozen for the legacy flag. One open job per claim; at most one
--     filed job per claim; one job per signature.
create table if not exists public.claim_filing_jobs (
  id                     uuid primary key default gen_random_uuid(),
  claim_id               uuid not null references public.claims (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  lawsuit_id             uuid not null references public.lawsuits (id) on delete cascade,
  packet_id              uuid not null references public.claim_packets (id) on delete cascade,
  signature_id           uuid not null unique references public.claim_signatures (id) on delete cascade,
  packet_hash            text not null check (packet_hash ~ '^[0-9a-f]{64}$'),
  policy_id              uuid references public.filing_policies (id),
  spec_id                uuid not null references public.filing_specs (id),
  channel                text not null check (channel in ('filing_desk', 'administrator_email',
                                                          'administrator_bulk', 'administrator_api')),
  status                 text not null default 'queued'
                         check (status in ('queued', 'in_progress', 'exported', 'needs_attention',
                                           'filed', 'rejected', 'cancelled')),
  idempotency_key        text not null unique,
  attempt                integer not null default 0 check (attempt >= 0),
  run_after              timestamptz not null default now(),
  due_by                 timestamptz,
  locked_at              timestamptz,
  lock_owner             text,
  lock_expires_at        timestamptz,
  export_batch_id        uuid references public.filing_export_batches (id),
  confirmation_number    text check (char_length(btrim(confirmation_number)) between 1 and 100),
  result                 jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  evidence               jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  needs_attention_reason text,
  closed_reason          text,
  filed_at               timestamptz,
  closed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint claim_filing_jobs_lock_pair
    check ((status = 'in_progress') = (lock_owner is not null and locked_at is not null)),
  constraint claim_filing_jobs_filed_at check (status <> 'filed' or filed_at is not null),
  constraint claim_filing_jobs_closed_at
    check ((status in ('filed', 'rejected', 'cancelled')) = (closed_at is not null))
);
create unique index if not exists claim_filing_jobs_one_open_idx on public.claim_filing_jobs (claim_id)
  where status in ('queued', 'in_progress', 'exported', 'needs_attention');
create unique index if not exists claim_filing_jobs_one_filed_idx on public.claim_filing_jobs (claim_id)
  where status = 'filed';
create index if not exists claim_filing_jobs_queue_idx on public.claim_filing_jobs (channel, status, run_after);

-- 13. Staff access to members' personal data, and every staff decision.
--     No foreign keys (account deletion must not rewrite it); append-only for
--     every role, the service role included.
create table if not exists public.filing_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid not null,
  actor_roles     text[] not null default '{}',
  action          text not null check (action ~ '^[a-z][a-z0-9_]{1,63}$'),
  subject_user_id uuid,
  claim_id        uuid,
  job_id          uuid,
  lawsuit_id      uuid,
  target_table    text,
  target_id       uuid,
  detail          jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  ip              inet,
  user_agent      text check (char_length(user_agent) <= 512),
  created_at      timestamptz not null default now()
);
create index if not exists filing_audit_log_claim_idx on public.filing_audit_log (claim_id, created_at);
create index if not exists filing_audit_log_actor_idx on public.filing_audit_log (actor_id, created_at);

comment on table public.staff_roles is 'Staff roles for one-click filing: legal_reviewer (the law firm) and filing_agent (desk). Server-only.';
comment on table public.filing_policies is 'Versioned filing policy per settlement or administrator. Only a legal_reviewer approves. Server-only.';
comment on table public.filing_controls is 'Kill switch and objection per settlement or administrator; effective at once. Server-only.';
comment on table public.filing_specs is 'Versioned official-form spec per settlement (questions, proof, verbatim statement and class definition, Jev rules).';
comment on table public.claim_packets is 'One claim packet per claim. Written by the server only; frozen while signed or closed.';
comment on table public.claim_documents is 'Member proof uploads and staff filing evidence in the private claim-documents bucket.';
comment on table public.esign_consents is 'E-SIGN consent records. Only withdrawn_at may change.';
comment on table public.claim_signatures is 'Typed-name e-signatures bound to the SHA-256 of the canonical packet. Never updated.';
comment on table public.claim_signature_voids is 'Ends what a signature authorizes. Append-only.';
comment on table public.jev_runs is 'Every Jev verification run. Server-only, append-only.';
comment on table public.filing_export_batches is 'administrator_bulk CSV exports (hash and row count only; the file is not stored).';
comment on table public.claim_filing_jobs is 'Agent-lane filing jobs (replaces 0015 filing_jobs for one-click). Server-only.';
comment on table public.filing_audit_log is 'Staff access to personal data and staff decisions. Append-only for every role.';

-- 14. Row security. Every new table has RLS on. API roles get nothing except
--     reading their own rows of the five member-readable tables.
alter table public.staff_roles enable row level security;
alter table public.filing_policies enable row level security;
alter table public.filing_controls enable row level security;
alter table public.filing_specs enable row level security;
alter table public.claim_packets enable row level security;
alter table public.claim_documents enable row level security;
alter table public.esign_consents enable row level security;
alter table public.claim_signatures enable row level security;
alter table public.claim_signature_voids enable row level security;
alter table public.jev_runs enable row level security;
alter table public.filing_export_batches enable row level security;
alter table public.claim_filing_jobs enable row level security;
alter table public.filing_audit_log enable row level security;

revoke all on table public.staff_roles, public.filing_policies, public.filing_controls,
  public.filing_specs, public.claim_packets, public.claim_documents, public.esign_consents,
  public.claim_signatures, public.claim_signature_voids, public.jev_runs,
  public.filing_export_batches, public.claim_filing_jobs, public.filing_audit_log
  from public, anon, authenticated;

grant select on table public.claim_packets, public.claim_documents, public.esign_consents,
  public.claim_signatures, public.claim_signature_voids to authenticated;

drop policy if exists "own claim_packets read" on public.claim_packets;
create policy "own claim_packets read" on public.claim_packets
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own claim_documents read" on public.claim_documents;
create policy "own claim_documents read" on public.claim_documents -- staff evidence rows stay server-side
  for select to authenticated using (auth.uid() = user_id and source = 'member');
drop policy if exists "own esign_consents read" on public.esign_consents;
create policy "own esign_consents read" on public.esign_consents
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own claim_signatures read" on public.claim_signatures;
create policy "own claim_signatures read" on public.claim_signatures
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own claim_signature_voids read" on public.claim_signature_voids;
create policy "own claim_signature_voids read" on public.claim_signature_voids
  for select to authenticated using (auth.uid() = user_id);

-- The service role writes everything, but never rewrites a legal record, and
-- never deletes a policy or control row (deleting one would lift a prohibition
-- or a kill switch without a legal_reviewer; cascades from lawsuits still work).
revoke update, truncate on table public.claim_signatures, public.claim_signature_voids,
  public.jev_runs from service_role;
revoke update, delete, truncate on table public.filing_audit_log from service_role;
revoke delete, truncate on table public.filing_policies, public.filing_controls from service_role;
grant select, insert, delete on table public.claim_signatures, public.claim_signature_voids,
  public.jev_runs to service_role;
grant select, insert on table public.filing_audit_log to service_role;
grant select, insert, update on table public.filing_policies, public.filing_controls to service_role;
grant select, insert, update, delete on table public.staff_roles, public.filing_specs, public.claim_packets,
  public.claim_documents, public.esign_consents, public.filing_export_batches, public.claim_filing_jobs to service_role;

-- 15. Private storage bucket for proof and evidence files: claim-documents,
--     paths {user_id}/{claim_id}/... Members may read their own uploads
--     ({user_id}/{claim_id}/<file>, never .../evidence/); no API role may write:
--     uploads use signed upload URLs (upsert off) the server creates for a path
--     it chose, and the server records size, type and SHA-256.
--     Plain PostgreSQL (CI) has no storage schema, so this part is skipped there.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
     or to_regprocedure('storage.foldername(text)') is null then
    raise notice '0037: no Supabase storage schema here; skipping the claim-documents bucket';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('claim-documents', 'claim-documents', false)
  on conflict (id) do update set public = false;
  if exists (select 1 from information_schema.columns where table_schema = 'storage'
              and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 10485760 where id = 'claim-documents'$q$;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage'
              and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/heif',
                                     'image/webp', 'application/pdf']
      where id = 'claim-documents'$q$;
  end if;
  execute $q$drop policy if exists "claim documents: members read own" on storage.objects$q$;
  execute $q$create policy "claim documents: members read own" on storage.objects
    for select to authenticated
    using (bucket_id = 'claim-documents' and array_length(storage.foldername(name), 1) = 2
           and (storage.foldername(name))[1] = (select auth.uid())::text
           and exists (select 1 from public.claims c
                        where c.id::text = (storage.foldername(name))[2]
                          and c.user_id = (select auth.uid())))$q$;
end $$;

-- 16. Phase 0: signed-in users could insert claim_authorizations rows with any
--     text, time or IP (0015), and the export trusted every row. Only the
--     server writes them from now on (the legacy route already uses the service role).
drop policy if exists "own claim_authorizations insert" on public.claim_authorizations;
revoke insert on table public.claim_authorizations from authenticated;
