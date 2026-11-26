/* eslint-disable no-console */
/**
 * Owner-apply drafts for eight Easy submit settlements (counsel 2026-11-26).
 *
 *   npx tsx scripts/one-click-eight-easy-submit.ts
 *     prints SQL to stdout and writes supabase/owner-apply/one-click-eight-easy-submit.sql
 *
 * Do not apply this SQL to production from this script. The owner reviews,
 * applies, then a legal_reviewer approves each spec and policy in
 * /admin/filing. This file never writes to Supabase. Does not include Kroger
 * or Allstate Arizona. Does not auto-approve.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS } from './one-click-claim-profile-settlements';
import {
  FIVE_ONE_CLICK_SETTLEMENTS,
  ownerApplySql,
  sqlString,
  target,
  type OneClickTarget,
} from './one-click-five-settlements';

const BACKUP_TABLE = 'owner_apply_eight_easy_submit_backup_20261126';
const LIVE = new Set(['realpage-rental-software-antitrust-settlement', 'john-deere-repair-services-antitrust-settlement']);

const FROM_FIVE = FIVE_ONE_CLICK_SETTLEMENTS.filter((row) => !LIVE.has(row.slug));

const blueRidge = target({
  slug: 'blue-ridge-rural-water-company-data-breach-class-action-settlement',
  title: 'Blue Ridge Rural Water data breach',
  officialUrl: 'https://blueridgedatasettlement.com/',
  formUrl: 'https://blueridgedatasettlement.com/',
  deadline: '2027-01-14',
  administrator: 'Blue Ridge Rural Water data incident settlement',
  extraUserFields: ['Optional notice or claimant ID if the form shows one'],
  classText:
    'People whose private information was compromised in the July 2024 Blue Ridge Rural Water Company, Inc., data incident, as identified by Blue Ridge’s records. Lawrence v. Blue Ridge Rural Water Company, Inc., Case No. 2025-CP-23-03210. Confirm the class on the official notice.',
  attestation:
    'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
  deskNotes:
    'Official site is blueridgedatasettlement.com. Fill name, address and email from the packet. Stop if a captcha, login, notice-ID wall, or identity check appears. Never collect login secrets. Never submit a test identity. Owner must not approve until a fillable no-notice path exists.',
  questions: [
    {
      key: 'class_member',
      official_label: 'I am a member of the Settlement Class described on the official notice.',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'notice_id',
      official_label: 'Notice ID or claim ID (if listed on your notice)',
      type: 'notice_id',
      required: false,
    },
  ],
});

const vidaYSalud = target({
  slug: 'vida-y-salud-health-systems-data-breach-class-action-settlement',
  title: 'Vida y Salud Health Systems data breach',
  officialUrl: 'https://vsidatasettlement.com/',
  formUrl: 'https://vsidatasettlement.com/',
  deadline: '2027-01-18',
  administrator: 'Vida Y Salud-Health Systems data incident settlement',
  extraUserFields: ['Optional notice or claimant ID if the form shows one'],
  classText:
    'People whose private information was potentially impacted in the October 2025 Vida Y Salud-Health Systems, Inc. data incident, as identified by VSHSI’s records. Murray, et al. v. Vida Y Salud-Health Systems, Inc., Case No. 26-01-15726-ZCV. Confirm the class on the official notice.',
  attestation:
    'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
  deskNotes:
    'Official site is vsidatasettlement.com. Fill name, address and email from the packet. Stop if a captcha, login, notice-ID wall, or identity check appears. Never collect login secrets. Never submit a test identity. Owner must not approve until a fillable no-notice path exists.',
  questions: [
    {
      key: 'class_member',
      official_label: 'I am a member of the Settlement Class described on the official notice.',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'notice_id',
      official_label: 'Notice ID or claim ID (if listed on your notice)',
      type: 'notice_id',
      required: false,
    },
  ],
});

const ecsi = target({
  slug: 'educational-computer-systems-data-breach-class-action-settlement',
  title: 'Educational Computer Systems (ECSI) data breach',
  officialUrl: 'https://www.datasettlementecsi.com/',
  formUrl: 'https://www.datasettlementecsi.com/',
  deadline: '2026-12-21',
  administrator: 'Educational Computer Systems data incident settlement',
  extraUserFields: ['Optional notice or claimant ID if the form shows one'],
  classText:
    'People whose personal identifying information was impacted by a criminal cyberattack on Educational Computer Systems, Inc.’s website between October 29, 2023 and February 12, 2024. Hood, et al. v. Educational Computer Systems, Inc. Confirm the class on the official notice.',
  attestation:
    'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
  deskNotes:
    'Official site is datasettlementecsi.com. Fill name, address and email from the packet. Stop if a captcha, login, notice-ID wall, or identity check appears. Never collect login secrets. Never submit a test identity. Owner must not approve until a fillable no-notice path exists.',
  questions: [
    {
      key: 'class_member',
      official_label: 'I am a member of the Settlement Class described on the official notice.',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'notice_id',
      official_label: 'Notice ID or claim ID (if listed on your notice)',
      type: 'notice_id',
      required: false,
    },
  ],
});

export const EIGHT_EASY_SUBMIT_SETTLEMENTS: OneClickTarget[] = [
  ...CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS,
  ...FROM_FIVE,
  blueRidge,
  vidaYSalud,
  ecsi,
];

export const EIGHT_EASY_SUBMIT_SLUGS = EIGHT_EASY_SUBMIT_SETTLEMENTS.map((row) => row.slug);

function backupAndDeskFileSql(slugs: readonly string[]): string {
  const inList = slugs.map((slug) => sqlString(slug)).join(', ');
  return `-- 1. Backup current claim_action_type for these eight slugs (idempotent).
create table if not exists public.${BACKUP_TABLE} (
  id uuid primary key,
  slug text not null,
  claim_action_type text,
  claim_action jsonb,
  backed_up_at timestamptz not null default now()
);

insert into public.${BACKUP_TABLE} (id, slug, claim_action_type, claim_action)
select l.id, l.slug, l.claim_action_type, l.claim_action
  from public.lawsuits l
 where l.slug in (${inList})
on conflict (id) do nothing;

-- 2. Draft specs + policies (below). Never sets status = approved.

`;
}

function deskFileUpdateSql(slugs: readonly string[]): string {
  const inList = slugs.map((slug) => sqlString(slug)).join(', ');
  return `
-- 3. Mark the eight settlements Easy submit. Does not enable Kroger or Allstate Arizona.
-- Does not change closed, hidden, or unpublished rows.
update public.lawsuits
   set claim_action_type = 'desk_file'
 where slug in (${inList})
   and status = 'open'
   and review_status = 'published';
`;
}

function rollbackSql(slugs: readonly string[]): string {
  const inList = slugs.map((slug) => sqlString(slug)).join(', ');
  return `
-- Rollback (owner only; do not run from CI):
--   update public.lawsuits l
--      set claim_action_type = b.claim_action_type,
--          claim_action = b.claim_action
--     from public.${BACKUP_TABLE} b
--    where l.id = b.id;
--   delete from public.filing_policies p
--    using public.lawsuits l
--    where p.lawsuit_id = l.id
--      and l.slug in (${inList})
--      and p.status = 'draft';
--   delete from public.filing_specs s
--    using public.lawsuits l
--    where s.lawsuit_id = l.id
--      and l.slug in (${inList})
--      and s.status = 'draft';
--   drop table if exists public.${BACKUP_TABLE};
-- Never delete approved spec or policy rows.
`;
}

export function eightEasySubmitOwnerApplySql(
  targets: readonly OneClickTarget[] = EIGHT_EASY_SUBMIT_SETTLEMENTS,
): string {
  const drafts = ownerApplySql(targets, {
    script: 'scripts/one-click-eight-easy-submit.ts',
    label: 'Eight Easy submit',
  });
  const slugs = targets.map((row) => row.slug);
  return `-- Owner-apply only. Do not run from CI or this repo's scripts.
-- Eight Easy submit settlements: draft filing_specs + filing_policies, then
-- claim_action_type = desk_file. After apply, a legal_reviewer MUST approve
-- each spec and policy in /admin/filing (SQL never sets approved; approval
-- requires approved_by UUID + documents_reviewed). Agent filing does not go
-- live until those approvals. Does not include Kroger or Allstate Arizona.
-- Generated by scripts/one-click-eight-easy-submit.ts.
--
-- Apply order:
--   1. This file (backup + drafts + desk_file).
--   2. Unrelated: supabase/migrations/0054_stripe_subscriptions.sql when ready
--      to store Stripe membership rows (separate, also unapplied).
${rollbackSql(slugs)}
${backupAndDeskFileSql(slugs)}${drafts}${deskFileUpdateSql(slugs)}
`;
}

function writeSqlFile(sql: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'supabase', 'owner-apply', 'one-click-eight-easy-submit.sql');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql);
  return out;
}

function main() {
  const sql = eightEasySubmitOwnerApplySql();
  const out = writeSqlFile(sql);
  console.log(sql);
  console.log(`Wrote ${out}`);
  console.log('Do not apply this SQL to production from the agent. Owner applies, then a legal_reviewer approves in admin.');
}

if (process.argv[1]?.endsWith('one-click-eight-easy-submit.ts')) {
  main();
}
