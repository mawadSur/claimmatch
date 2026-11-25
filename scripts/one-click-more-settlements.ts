/* eslint-disable no-console */
/**
 * Owner-apply drafts for additional one-click settlements found after PR #71.
 *
 *   npx tsx scripts/one-click-more-settlements.ts
 *
 * Do not apply this SQL to production from this script. Dry-run first with
 * scripts/one-click-dry-run.ts --slug <slug>. Never submit a test identity.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ownerApplySql,
  target,
  type OneClickTarget,
} from './one-click-five-settlements';

export const MORE_ONE_CLICK_SETTLEMENTS: OneClickTarget[] = [
  target({
    slug: 'kroger-prescription-drug-prices-class-action-settlement',
    title: 'Kroger prescription savings club',
    officialUrl: 'https://www.krogersavingsclubsettlement.com/',
    formUrl: 'https://www.krogersavingsclubsettlement.com/submit-claim',
    deadline: '2026-12-21',
    administrator: 'Angeion Group',
    extraUserFields: [
      'Whether you paid for one or more insured Kroger prescriptions from Dec 9, 2018 through Aug 23, 2026',
      'Claimed amount, if stating a dollar figure; supporting documents only if the total is $8,000 or more',
      'Do not approve this draft while email “Send code” login is the only no-notice path',
    ],
    classText:
      'Individuals in the United States and its territories who, from December 9, 2018 through August 23, 2026, paid in whole or in part for one or more prescription drugs from Kroger using their insurance. Kirkbride et al. v. The Kroger Co. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Angeion submit-claim. 2026-11-25 dry-run: after the No-notice path the form asks for an email and “Send code” (one-time login). Not fillable from profile data. Owner must not approve until a no-login identity form exists. Supporting documents only if the total amount claimed is $8,000 or more. Deadline December 21, 2026. Never submit a test identity.',
    payoutOptions: [
      { value: 'check', official_label: 'Check' },
      { value: 'other', official_label: 'Other payment method listed on the official form' },
    ],
    questions: [
      {
        key: 'class_member',
        official_label:
          'From December 9, 2018 through August 23, 2026, did you pay in whole or in part for one or more prescription drugs from Kroger using insurance?',
        type: 'yes_no',
        required: true,
      },
      {
        key: 'claimed_amount',
        official_label: 'Total amount you paid Kroger for insured prescriptions in the class period, if you are stating an amount',
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
    slug: 'six-flags-fees-california-class-action-settlement',
    title: 'Six Flags Knott’s / Great America fees',
    officialUrl: 'https://www.knottsgreatamericasettlement.com/',
    formUrl: 'https://www.knottsgreatamericasettlement.com/submit-claim',
    deadline: '2026-12-22',
    administrator: 'Angeion Group',
    extraUserFields: [
      'Whether you were a California resident charged processing fees on covered Knott’s or Great America tickets from June 28, 2020 to July 1, 2024',
      'Cash or check instead of the $8 site credit',
      'Do not approve this draft while Notice ID + Confirmation Code login is the only path',
    ],
    classText:
      'California residents charged processing fees for non-season tickets to Knott’s Berry Farm and/or Knott’s Soak City bought on knotts.com, or to California’s Great America bought on cagreatamerica.com, from June 28, 2020 to July 1, 2024. Isayan v. Cedar Fair L.P. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Angeion submit-claim. 2026-11-25 dry-run: Notice ID + Confirmation Code login; no no-notice identity form. Owner must not approve until a no-login path exists. Official site does not ask for receipts. Deadline December 22, 2026. Never collect the confirmation code. Never submit a test identity.',
    payoutOptions: [
      { value: 'electronic', official_label: 'Electronic payment' },
      { value: 'check', official_label: 'Check' },
    ],
    questions: [
      {
        key: 'class_member',
        official_label:
          'Were you a California resident charged a processing fee on a covered Knott’s or Great America ticket purchase from June 28, 2020 to July 1, 2024?',
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
    slug: 'allstate-arizona-depreciation-settlement',
    title: 'Allstate Arizona depreciation',
    officialUrl: 'https://www.hernandezdepreciationsettlement.com/',
    formUrl: 'https://www.hernandezdepreciationsettlement.com/submit-claim',
    deadline: '2027-01-29',
    administrator: 'Angeion Group',
    extraUserFields: [
      'Allstate / Esurance / Encompass / North Light structural-loss claim details for Arizona property',
      'Whether nonmaterial depreciation was withheld from an Xactimate ACV payment',
      'Written proof of legal authority if filing as a representative',
      'Do not approve this draft while Notice ID + Confirmation Code login is the only path',
    ],
    classText:
      'Policyholders under an Allstate, Esurance, Encompass or North Light property policy who made a structural-loss claim for Arizona property from April 25, 2017 through October 1, 2026, where Allstate paid on an Xactimate estimate and withheld nonmaterial depreciation from the actual-cash-value payment. Hernandez v. Allstate Vehicle and Property Insurance Company. Confirm the class on the official notice.',
    attestation:
      'I declare under penalty of perjury that the information on this claim form is true and correct to the best of my knowledge.',
    deskNotes:
      'Angeion submit-claim. 2026-11-25 dry-run: Notice ID + Confirmation Code login; no no-notice identity form. Catalog also marks proof as required for representatives. Owner must not approve until a no-login, no-proof identity form exists. Deadline midnight Mountain Standard Time January 29, 2027. Never collect the confirmation code. Never submit a test identity.',
    questions: [
      {
        key: 'class_member',
        official_label:
          'Did you have an Allstate, Esurance, Encompass or North Light structural-loss claim on Arizona property from April 25, 2017 through October 1, 2026 where nonmaterial depreciation was withheld from an Xactimate ACV payment?',
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
];

function writeSqlFile(sql: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'supabase', 'owner-apply', 'one-click-more-settlements.sql');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql);
  return out;
}

function main() {
  const sql = ownerApplySql(MORE_ONE_CLICK_SETTLEMENTS, {
    script: 'scripts/one-click-more-settlements.ts',
    label: 'Additional one-click',
  });
  const out = writeSqlFile(sql);
  console.log(sql);
  console.log(`Wrote ${out}`);
  console.log('Do not apply this SQL to production from the agent. Owner applies, then approves in admin.');
}

if (process.argv[1]?.endsWith('one-click-more-settlements.ts')) {
  main();
}
