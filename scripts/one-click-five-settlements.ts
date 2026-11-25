/* eslint-disable no-console */
/**
 * Owner-apply drafts for five real one-click settlements.
 *
 *   npx tsx scripts/one-click-five-settlements.ts
 *     prints SQL to stdout (also writes supabase/owner-apply/one-click-five-settlements.sql)
 *
 * Do not apply this SQL to production from this script. The owner reviews the
 * field mapping, applies the SQL, then approves each spec and policy in
 * /admin/filing as a legal_reviewer. This file never writes to Supabase.
 *
 * Channel is filing_desk (human fills the official form from the packet).
 * Agent filing stays off until those drafts are approved.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { FilingPolicyContentSchema, FilingSpecContentSchema } from '../src/lib/filing/v2/contract-spec';

type SpecInput = z.input<typeof FilingSpecContentSchema>;

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

const REVIEWED_ON = '2026-11-25';

const MEMBER_CONTACT = [
  { field: 'legal_name' as const, official_label: 'Full name', required: true },
  { field: 'first_name' as const, official_label: 'First name', required: true },
  { field: 'last_name' as const, official_label: 'Last name', required: true },
  { field: 'email' as const, official_label: 'Email address', required: true },
  { field: 'phone' as const, official_label: 'Phone number', required: false },
  { field: 'address.line1' as const, official_label: 'Street address', required: true },
  { field: 'address.line2' as const, official_label: 'Address line 2', required: false },
  { field: 'address.city' as const, official_label: 'City', required: true },
  { field: 'address.state' as const, official_label: 'State', required: true },
  { field: 'address.zip' as const, official_label: 'ZIP code', required: true },
];

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface OneClickTarget {
  slug: string;
  title: string;
  officialUrl: string;
  formUrl: string;
  deadline: string;
  timeZone: string;
  administrator: string;
  extraUserFields: string[];
  spec: ReturnType<typeof FilingSpecContentSchema.parse>;
  policy: ReturnType<typeof FilingPolicyContentSchema.parse>;
}

export function target(input: {
  slug: string;
  title: string;
  officialUrl: string;
  formUrl: string;
  deadline?: string;
  timeZone?: string;
  administrator: string;
  extraUserFields: string[];
  classText: string;
  attestation: string;
  deskNotes: string;
  questions?: SpecInput['questions'];
  benefitTiers?: SpecInput['benefit_tiers'];
  payoutOptions?: SpecInput['payout_options'];
}): OneClickTarget {
  const spec = FilingSpecContentSchema.parse({
    official_form: { url: input.formUrl, title: `${input.title} claim form` },
    class_definition: { text: input.classText, source_url: input.officialUrl },
    attestation: { text: input.attestation, source_url: input.officialUrl },
    deadline: input.deadline
      ? { date: input.deadline, time_zone: input.timeZone ?? 'America/New_York', type: 'submit_online_by' }
      : null,
    member_fields: MEMBER_CONTACT,
    questions: input.questions ?? [
      {
        key: 'class_member',
        official_label: 'I am a member of the Settlement Class described on the official notice.',
        type: 'yes_no',
        required: true,
      },
    ],
    benefit_tiers: input.benefitTiers ?? [],
    payout_options: input.payoutOptions ?? [],
    form_field_order: [
      'member.first_name',
      'member.last_name',
      'member.legal_name',
      'member.email',
      'member.phone',
      'member.address.line1',
      'member.address.line2',
      'member.address.city',
      'member.address.state',
      'member.address.zip',
      'answers.class_member',
      ...(input.questions ?? []).filter((q) => q.key !== 'class_member').map((q) => `answers.${q.key}`),
      ...(input.benefitTiers?.length ? ['benefit_tier'] : []),
      ...(input.benefitTiers ?? []).flatMap((tier) => (tier.proof ?? []).map((p) => `documents.${p.kind}`)),
      ...(input.payoutOptions?.length ? ['payout_method'] : []),
    ],
    desk_notes: input.deskNotes,
  });
  const policy = FilingPolicyContentSchema.parse({
    agent_filing: 'allowed',
    channels: [
      {
        type: 'filing_desk',
        enabled: true,
        daily_capacity: 10,
        sla_business_days: 2,
        min_days_before_deadline: 5,
        accepts_documents: false,
        instructions: `Fill the official form at ${input.formUrl} from the packet. Never submit a test identity. Stop if a captcha, login, or proof upload appears.`,
      },
    ],
    allowed_states: [...STATES],
    sources_reviewed: [
      {
        kind: 'claim_form',
        title: `${input.title} official claims site`,
        url: input.officialUrl,
        reviewed_on: REVIEWED_ON,
      },
    ],
    notes: `Draft one-click policy for ${input.slug}. Owner must approve in admin after applying SQL. Administrator: ${input.administrator}.`,
  });
  return {
    slug: input.slug,
    title: input.title,
    officialUrl: input.officialUrl,
    formUrl: input.formUrl,
    deadline: input.deadline ?? '',
    timeZone: input.timeZone ?? 'America/New_York',
    administrator: input.administrator,
    extraUserFields: input.extraUserFields,
    spec,
    policy,
  };
}

export const FIVE_ONE_CLICK_SETTLEMENTS: OneClickTarget[] = [
  target({
    slug: 'realpage-rental-software-antitrust-settlement',
    title: 'RealPage rental software antitrust',
    officialUrl: 'https://www.realpagerentalsettlement.com/',
    formUrl: 'https://www.realpagerentalsettlement.com/submit-claim',
    deadline: '2027-01-29',
    administrator: 'Angeion Group',
    extraUserFields: [
      'Whether you rented a multifamily apartment in the U.S. from Oct 18, 2018 through Nov 21, 2025',
      'Whether rent was paid directly for a property on the official Property List',
      'Optional notice ID if you have one; take the No-notice path if you do not',
    ],
    classText:
      'People and entities in the United States and its territories who paid rent on at least one multifamily residential lease directly to an owner, manager or owner-operator on a property that had a license for RealPage LRO, YieldStar and/or AIRM at any time from October 18, 2018 through November 21, 2025. In re RealPage, Inc., Rental Software Antitrust Litigation (No. II). Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Angeion submit-claim. Click No on “Do you have a Notice ID?” then Continue. Fill name, address, email, phone and signature from the packet. Official site says include supporting documents only if they apply; the no-notice identity form does not require a receipt. Member picks a payout method name on the official form; never collect PayPal, Venmo or Zelle account details. Deadline 11:59 p.m. EST January 29, 2027. Never submit a test identity.',
    payoutOptions: [
      { value: 'virtual_mastercard', official_label: 'Virtual Mastercard' },
      { value: 'paypal', official_label: 'PayPal' },
      { value: 'venmo', official_label: 'Venmo' },
      { value: 'prepaid_mastercard', official_label: 'Prepaid Mastercard' },
      { value: 'zelle', official_label: 'Zelle' },
      { value: 'check', official_label: 'Check' },
    ],
    questions: [
      {
        key: 'class_member',
        official_label:
          'From October 18, 2018, through November 21, 2025, did you make rent payments directly for a property identified on the Property List?',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'rented_multifamily',
        official_label:
          'Did you rent a multifamily residential apartment in the U.S. or its territories between October 18, 2018 and November 21, 2025?',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'notice_id',
        official_label: 'Notice ID (if listed on your notice)',
        type: 'notice_id',
        required: false,
      },
    ],
  }),
  target({
    slug: 'john-deere-repair-services-antitrust-settlement',
    title: 'John Deere repair services antitrust',
    officialUrl: 'https://www.deererepairsettlement.com/',
    formUrl: 'https://www.deererepairsettlement.com/submit-claim',
    deadline: '2026-12-31',
    administrator: 'Angeion Group',
    extraUserFields: [
      'Equipment identification number from the machine',
      'Type of equipment and approximate ownership and repair dates',
      'Optional notice ID; take the No-notice path if you do not have one',
    ],
    classText:
      'People and entities who bought repair services for Deere large agricultural equipment from John Deere or its authorized dealers in the United States between January 10, 2018 and May 18, 2026. In re Deere & Company Repair Services Antitrust Litigation. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Angeion submit-claim. Click No then Continue to skip Notice ID login. Fill full name, email, phone and address from the packet. Equipment identification, type and repair dates come from extra answers, not the profile. An optional supporting-documents file input exists; skip it unless the member attached files. Member picks ACH or another payout method name on the official form; never collect account numbers. Deadline December 31, 2026. Never submit a test identity.',
    payoutOptions: [
      { value: 'ach', official_label: 'ACH direct deposit' },
      { value: 'other', official_label: 'Other payment method listed on the official form' },
    ],
    questions: [
      {
        key: 'class_member',
        official_label: 'I am a member of the Settlement Class described on the official notice.',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'equipment_id',
        official_label: 'Equipment identification number from the machine',
        type: 'text',
        required: true,
      },
      {
        key: 'equipment_type',
        official_label: 'Type of equipment (product line, family, decal model)',
        type: 'text',
        required: false,
      },
      {
        key: 'notice_id',
        official_label: 'Notice ID (if listed on your notice)',
        type: 'notice_id',
        required: false,
      },
    ],
  }),
  target({
    slug: 'tenet-healthcare-pixel-tracking-settlement',
    title: 'Tenet Healthcare pixel tracking',
    officialUrl: 'https://www.tenetpixelsettlement.com/',
    formUrl: 'https://www.tenetpixelsettlement.com/file-a-claim',
    deadline: '2027-03-15',
    administrator: 'Simpluris',
    extraUserFields: [
      'Whether to claim $16 cash, privacy monitoring, or both',
      'Notice LoginID if Simpluris still requires Claim Form Login — do not approve this draft while a PIN login is the only path',
    ],
    classText:
      'Identifiable people who, from January 1, 2017 through September 18, 2023, used a website or patient portal owned or operated by Tenet Healthcare or an affiliated covered entity to create a patient-portal account, submit a webform, or check in to an urgent care or emergency room. Jane Doe v. AMISUB (SFH), Inc. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Official FAQ says no proof is needed for the $16 cash payment. 2026-11-25 dry-run: Simpluris Claim Form Login (LoginID + secret). Owner must not approve until a no-notice identity form exists. Never collect the login secret. Never submit a test identity.',
    benefitTiers: [
      {
        key: 'cash_16',
        official_label: '$16.00 cash payment',
        description: 'One-time $16.00 cash. Official FAQ says no proof or explanation is needed.',
      },
      {
        key: 'privacy_monitoring',
        official_label: 'Two years of CyEx Privacy Shield Pro',
        description: 'Privacy monitoring. Enrollment codes were also sent by postcard.',
      },
    ],
  }),
  target({
    slug: 'seatgeek-ticket-fees-nevada-class-action-settlement',
    title: 'SeatGeek ticket fees (Nevada)',
    officialUrl: 'https://www.seatgeekticketfeessettlement.com/',
    formUrl: 'https://www.seatgeekticketfeessettlement.com/file-a-claim',
    deadline: '2027-01-05',
    administrator: 'Simpluris',
    extraUserFields: [
      'Optional notice or claimant ID if the form shows one',
      'Do not approve this draft while Simpluris Claim Form Login is the only path',
    ],
    classText:
      'People who bought electronic tickets to events in Nevada on seatgeek.com or the SeatGeek mobile app from November 7, 2020 through May 12, 2025 and were charged fees. Carbonell v. SeatGeek, Inc. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Official site does not ask for receipts. 2026-11-25 dry-run: Simpluris Claim Form Login. Owner must not approve until a no-notice identity form exists. Never collect the login secret. Online deadline 11:59 p.m. EST January 5, 2027.',
    questions: [
      {
        key: 'class_member',
        official_label: 'I am a member of the Settlement Class described on the official notice.',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'notice_id',
        official_label: 'Claimant ID / Notice ID (if listed on your notice)',
        type: 'notice_id',
        required: false,
      },
    ],
  }),
  target({
    slug: 'dental-intelligence-5-75m-privacy-class-action-settlement',
    title: 'Dental Intelligence LocalMed Portal',
    officialUrl: 'https://www.disettlement.com/',
    formUrl: 'https://www.disettlement.com/file-a-claim',
    deadline: '2027-01-25',
    administrator: 'Simpluris',
    extraUserFields: [
      'Optional notice or claimant ID if the form shows one',
      'Do not approve this draft while Simpluris Claim Form Login is the only path',
    ],
    classText:
      'Natural persons in the United States who used the LocalMed Portal to schedule, modify, or re-schedule an appointment between March 2022 and June 2025 and who shared information that was allegedly disclosed or transmitted to a third party. Grivetti et al. v. Dental Intelligence, Inc. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Official homepage does not state a fixed per-person amount. 2026-11-25 dry-run: Simpluris Claim Form Login. Owner must not approve until a no-notice identity form exists. Never collect the login secret. Claims due January 25, 2027.',
    questions: [
      {
        key: 'class_member',
        official_label: 'I am a member of the Settlement Class described on the official notice.',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'notice_id',
        official_label: 'Claimant ID / Notice ID (if listed on your notice)',
        type: 'notice_id',
        required: false,
      },
    ],
  }),
];

export function ownerApplySql(
  targets: readonly OneClickTarget[] = FIVE_ONE_CLICK_SETTLEMENTS,
  meta: { script: string; label: string } = {
    script: 'scripts/one-click-five-settlements.ts',
    label: 'Five real one-click',
  },
): string {
  const blocks = targets.map((row) => {
    const specJson = sqlString(JSON.stringify(row.spec));
    const channelsJson = sqlString(JSON.stringify(row.policy.channels));
    const statesJson = sqlString(JSON.stringify(row.policy.allowed_states));
    const sourcesJson = sqlString(JSON.stringify(row.policy.sources_reviewed));
    return `-- ${row.slug}
do $$
declare
  v_lawsuit uuid;
  v_spec_version integer;
  v_policy_version integer;
begin
  select id into v_lawsuit from public.lawsuits where slug = ${sqlString(row.slug)};
  if v_lawsuit is null then
    raise notice 'skip ${row.slug}: no lawsuits row';
    return;
  end if;
  if exists (
    select 1 from public.filing_specs
    where lawsuit_id = v_lawsuit and status in ('draft', 'approved')
  ) then
    raise notice 'skip spec ${row.slug}: a live spec already exists';
  else
    select coalesce(max(version), 0) + 1 into v_spec_version
      from public.filing_specs where lawsuit_id = v_lawsuit;
    insert into public.filing_specs (lawsuit_id, version, content)
      values (v_lawsuit, v_spec_version, ${specJson}::jsonb);
    raise notice 'inserted spec draft ${row.slug} v%', v_spec_version;
  end if;
  if exists (
    select 1 from public.filing_policies
    where lawsuit_id = v_lawsuit and status in ('draft', 'approved')
  ) then
    raise notice 'skip policy ${row.slug}: a live policy already exists';
  else
    select coalesce(max(version), 0) + 1 into v_policy_version
      from public.filing_policies where lawsuit_id = v_lawsuit;
    insert into public.filing_policies (
      lawsuit_id, version, agent_filing, channels, allowed_states, sources_reviewed, notes
    ) values (
      v_lawsuit,
      v_policy_version,
      'allowed',
      ${channelsJson}::jsonb,
      ${statesJson}::jsonb,
      ${sourcesJson}::jsonb,
      ${sqlString(row.policy.notes ?? '')}
    );
    raise notice 'inserted policy draft ${row.slug} v%', v_policy_version;
  end if;
end $$;
`;
  });
  return `-- Owner-apply only. Do not run from CI or this repo's scripts.
-- ${meta.label} filing_specs + filing_policies as DRAFTS.
-- After apply: a legal_reviewer must approve each spec and policy in
-- /admin/filing. Agent filing does not go live until those approvals.
-- ONE_CLICK_FILING_ENABLED must already be on for the public badge to show.
-- Generated by ${meta.script} on ${REVIEWED_ON}.

${blocks.join('\n')}
`;
}

function writeSqlFile(sql: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'supabase', 'owner-apply', 'one-click-five-settlements.sql');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql);
  return out;
}

function main() {
  const sql = ownerApplySql();
  const out = writeSqlFile(sql);
  console.log(sql);
  console.log(`Wrote ${out}`);
  console.log('Do not apply this SQL to production from the agent. Owner applies, then approves in admin.');
}

if (process.argv[1]?.endsWith('one-click-five-settlements.ts')) {
  main();
}
