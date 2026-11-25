/* eslint-disable no-console */
/**
 * Owner-apply drafts for Rolling Stone lifetime subscription (moss-krivin)
 * and Hyundai/Kia anti-theft (VIN + theft docs). Policy disabled by default
 * (draft). A legal_reviewer must approve. Dry-run must stop before Submit.
 *
 *   npx tsx scripts/one-click-claim-profile-settlements.ts
 *
 * Do not apply this SQL to production from this script.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FilingPolicyContentSchema } from '../src/lib/filing/v2/contract-spec';
import { ownerApplySql, target, type OneClickTarget } from './one-click-five-settlements';

function withDocuments(row: OneClickTarget, instructions: string): OneClickTarget {
  const channels = row.policy.channels.map((ch) =>
    ch.type === 'filing_desk' ? { ...ch, accepts_documents: true, instructions } : ch,
  );
  return {
    ...row,
    policy: FilingPolicyContentSchema.parse({ ...row.policy, channels }),
  };
}

const rollingStone = target({
  slug: 'moss-krivin-v-penske-media-corporation',
  title: 'Rolling Stone lifetime subscription',
  officialUrl: 'https://subscribe.rollingstone.com/krivin-rs',
  formUrl: 'https://subscribe.rollingstone.com/krivin-rs',
  administrator: 'Penske Media / Rolling Stone',
  extraUserFields: [
    'Email used on the Rolling Stone lifetime subscription',
    'Whether you bought a lifetime Rolling Stone print subscription',
  ],
  classText:
    'People who bought a Rolling Stone lifetime print subscription from Penske Media Corporation. Moss Krivin v. Penske Media Corporation. Confirm the class on the official notice at subscribe.rollingstone.com/krivin-rs.',
  attestation:
    'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
  deskNotes:
    'Official path is subscribe.rollingstone.com/krivin-rs. Fill name, address, email and the subscription email from the packet. Stop if a login, captcha or payment-account field appears. Never collect PayPal/Venmo account details. Never submit a test identity. Policy stays draft until a legal_reviewer approves after the dry-run.',
  payoutOptions: [
    { value: 'check', official_label: 'Check' },
    { value: 'other', official_label: 'Other payment method listed on the official form' },
  ],
  questions: [
    {
      key: 'class_member',
      official_label: 'I bought a Rolling Stone lifetime print subscription as described on the official notice.',
      type: 'yes_no',
      required: true,
    },
    {
      key: 'subscription_email',
      official_label: 'Email address on the Rolling Stone subscription, if different from the email on this form',
      type: 'email',
      required: false,
    },
    {
      key: 'notice_id',
      official_label: 'Notice ID (if listed on your notice)',
      type: 'notice_id',
      required: false,
    },
  ],
});

const hyundai = withDocuments(
  target({
    slug: 'hyundai-kia-vehicle-theft',
    title: 'Hyundai and Kia anti-theft / immobilizer',
    officialUrl: 'https://www.hkmultistateimmobilizersettlement.com/',
    formUrl: 'https://www.hkmultistateimmobilizersettlement.com/submit-claim',
    deadline: '2027-03-31',
    administrator: 'Hyundai/Kia Multistate Immobilizer Settlement',
    extraUserFields: [
      'Vehicle VIN',
      'Proof of a qualifying theft or theft attempt and of the software upgrade or scheduled appointment',
    ],
    classText:
      'People who own or lease an eligible Hyundai or Kia that was not factory-equipped with an immobilizer. Cash claims also need a qualifying theft or theft attempt on or after April 29, 2025 while the software upgrade was installed or scheduled, and before the zinc sleeve or March 31, 2027. Confirm the class and model-year list on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Official submit-claim at hkmultistateimmobilizersettlement.com. VIN path plus theft-document upload when a no-notice identity form exists. Fill VIN and contact from the packet. Upload only files the member attached. Stop if a captcha, login, or identity check appears. Never submit a test identity. 2026-11-25 dry-run: submit-claim showed a notice login; not fillable from profile. Do not approve until a no-notice VIN path exists.',
    payoutOptions: [
      { value: 'check', official_label: 'Check' },
      { value: 'other', official_label: 'Other payment method listed on the official form' },
    ],
    questions: [
      {
        key: 'class_member',
        official_label:
          'I own or lease an eligible Hyundai or Kia that was not factory-equipped with an immobilizer, as described on the official notice.',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'vin',
        official_label: 'Vehicle identification number (VIN)',
        type: 'vin',
        required: true,
      },
      {
        key: 'notice_id',
        official_label: 'Notice ID (if listed on your notice)',
        type: 'notice_id',
        required: false,
      },
    ],
    benefitTiers: [
      {
        key: 'theft_cash',
        official_label: 'Cash for a qualifying theft or theft attempt',
        description:
          'Records that show the software upgrade was installed or an appointment was scheduled, plus the qualifying theft or theft attempt. Check the official notice for what counts.',
        proof: [
          {
            kind: 'theft_docs',
            official_label: 'Records of the qualifying theft or theft attempt and of the software upgrade or scheduled appointment',
            required: true,
            min_files: 1,
            max_files: 8,
          },
        ],
      },
    ],
  }),
  'Fill the official form at https://www.hkmultistateimmobilizersettlement.com/submit-claim from the packet. Use the VIN path. Upload only the member’s theft documents. Never submit a test identity. Stop if a captcha, login, or identity check appears.',
);

export const CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS: OneClickTarget[] = [rollingStone, hyundai];

function main() {
  const sql = ownerApplySql(CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS, {
    script: 'scripts/one-click-claim-profile-settlements.ts',
    label: 'Rolling Stone + Hyundai/Kia anti-theft',
  });
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'supabase', 'owner-apply', 'one-click-claim-profile-settlements.sql');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql);
  console.log(sql);
  console.log(`Wrote ${out}`);
  console.log('Do not apply this SQL to production from the agent. Owner applies, then a legal_reviewer approves in admin.');
}

if (process.argv[1]?.endsWith('one-click-claim-profile-settlements.ts')) {
  main();
}
