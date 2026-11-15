-- Lawsuit AI 0045: one-click filing, go-live gate (GitHub issue #52).
-- EXPAND ONLY. Do not edit 0044 or earlier. Design: docs/designs/one-click-filing.md,
-- sections 12 and 13; the firm's sign-off map: docs/legal/signoff-checklist.md.
--
--   1. The desk's challenge rule per settlement (founder decision on #52):
--      filing_controls.desk_challenge_mode. 'stop' (the default, today's
--      behavior) keeps filing_desk off for a form known to show any check and
--      makes any check met while filing a hard stop. 'staff_completes_captcha'
--      lets a desk agent, a person in their own normal browser, complete a
--      CAPTCHA the official site shows them; codes, identity checks and
--      account logins stay a hard stop. Only an active legal_reviewer moves a
--      settlement away from 'stop'; anyone in the console may put it back.
--      Settlement rows only (an administrator row always stays 'stop').
--   2. Legal records kept after account deletion (checklist item 8):
--      filing_legal_record_archive. Empty unless the law firm picks a mode
--      other than 'delete' (LEGAL_RECORDS_ON_ACCOUNT_DELETION, default
--      'delete' = today). No foreign keys, so deleting the account never
--      rewrites it; rows are never updated; the retention sweep deletes a row
--      once retain_until has passed.
-- Safe to re-run. Nothing existing is deleted or rewritten.

-- 1. The desk's challenge rule -------------------------------------------------
alter table public.filing_controls
  add column if not exists desk_challenge_mode       text not null default 'stop',
  add column if not exists desk_challenge_changed_by uuid,
  add column if not exists desk_challenge_changed_at timestamptz,
  add column if not exists desk_challenge_notes      text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'filing_controls_desk_challenge_mode') then
    alter table public.filing_controls add constraint filing_controls_desk_challenge_mode
      check (desk_challenge_mode in ('stop', 'staff_completes_captcha'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'filing_controls_desk_challenge_settlement') then
    alter table public.filing_controls add constraint filing_controls_desk_challenge_settlement
      check (desk_challenge_mode = 'stop' or lawsuit_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'filing_controls_desk_challenge_notes') then
    alter table public.filing_controls add constraint filing_controls_desk_challenge_notes
      check (desk_challenge_mode = 'stop' or nullif(btrim(desk_challenge_notes), '') is not null);
  end if;
end $$;

create or replace function public.filing_controls_challenge_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.desk_challenge_mode <> 'stop'
     and (tg_op = 'INSERT' or old.desk_challenge_mode is distinct from new.desk_challenge_mode)
     and not public.filing_has_role(new.desk_challenge_changed_by, 'legal_reviewer') then
    raise exception 'only a legal_reviewer can change the desk challenge rule' using errcode = 'CM006';
  end if;
  return new;
end $$;

drop trigger if exists filing_controls_challenge_guard on public.filing_controls;
create trigger filing_controls_challenge_guard before insert or update on public.filing_controls
  for each row execute function public.filing_controls_challenge_guard();

comment on column public.filing_controls.desk_challenge_mode is
  'stop (default): any challenge is a hard stop for the desk. staff_completes_captcha: a desk agent may complete a CAPTCHA in their own browser; codes and identity checks still stop. legal_reviewer only.';

-- 2. Legal records kept after account deletion --------------------------------
create table if not exists public.filing_legal_record_archive (
  id              uuid primary key default gen_random_uuid(),
  -- One random id per deleted account: links that account's archived records
  -- to each other, never to a person (the account id is not stored here).
  deletion_ref    uuid not null,
  mode            text not null check (mode in ('anonymize_and_retain', 'retain')),
  record_kind     text not null
                  check (record_kind in ('claim_signature', 'claim_signature_void', 'esign_consent',
                                         'claim_filing_job', 'filing_evidence')),
  source_id       uuid not null,
  lawsuit_id      uuid,
  record          jsonb not null check (jsonb_typeof(record) = 'object'),
  record_sha256   text not null check (record_sha256 ~ '^[0-9a-f]{64}$'),
  -- 'retain' mode only: the staff evidence file kept in claim-documents.
  storage_path    text,
  archived_at     timestamptz not null default now(),
  retain_until    timestamptz not null,
  constraint filing_legal_record_archive_path check (storage_path is null or mode = 'retain'),
  constraint filing_legal_record_archive_until check (retain_until > archived_at)
);
create unique index if not exists filing_legal_record_archive_source_idx
  on public.filing_legal_record_archive (record_kind, source_id);
create index if not exists filing_legal_record_archive_due_idx
  on public.filing_legal_record_archive (retain_until);

drop trigger if exists filing_legal_record_archive_immutable on public.filing_legal_record_archive;
create trigger filing_legal_record_archive_immutable before update on public.filing_legal_record_archive
  for each row execute function public.filing_immutable_row();

comment on table public.filing_legal_record_archive is
  'One-click legal records kept after account deletion when the law firm chose to keep them. Server-only; rows are never updated and are deleted after retain_until.';

alter table public.filing_legal_record_archive enable row level security;
revoke all on table public.filing_legal_record_archive from public, anon, authenticated, service_role;
grant select, insert, delete on table public.filing_legal_record_archive to service_role;

revoke all on function public.filing_controls_challenge_guard() from public, anon, authenticated;
