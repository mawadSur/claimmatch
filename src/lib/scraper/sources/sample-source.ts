import type { ScrapedLawsuit } from '@/lib/types';
import type { SourceAdapter } from './index';

/**
 * A worked example adapter. It returns a small, realistic set of settlements
 * WITHOUT any network access, so `runAllSources()` and the seed script are fully
 * deterministic in every environment. Real adapters replace `fetch()` with an
 * HTTP request + parser (see `./generic-html` and the doc comment in `./index`).
 *
 * These records are intentionally distinct from `@/lib/sample-data` so seeding
 * both produces a fuller catalog. They reference the eligibility attribute keys
 * defined in `@/lib/eligibility` (took_medication, employed_hourly,
 * bought_consumer_goods, used_streaming, uses_social_media, …).
 */

/** ISO date (YYYY-MM-DD) `days` from today. */
function daysOut(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const RECORDS: ScrapedLawsuit[] = [
  {
    external_id: 'sample-aggregator:heartburn-rx-recall-2025',
    title: 'Heartburn Medication Impurity Settlement',
    summary:
      'A widely prescribed heartburn drug was recalled after tests found a probable-carcinogen impurity. People who bought or were prescribed it may claim a refund or a documented-injury payment.',
    description:
      'The manufacturer settled claims that certain lots of its heartburn medication contained NDMA above accepted limits. Class members can claim a flat refund for purchases without proof, or a larger payment for documented medical costs. Prescription or pharmacy records strengthen a claim.',
    category: 'Health & Pharma',
    typical_payout: '$25–$500',
    proof_required: true,
    deadline: daysOut(90),
    eligibility: { requires: ['took_medication'], notes: 'Purchased or prescribed during the class period.' },
    eligibility_text: 'Anyone who purchased or was prescribed the recalled heartburn medication.',
    source_url: 'https://sample-aggregator.example/settlements/heartburn-rx-recall',
    claim_url: 'https://sample-aggregator.example/settlements/heartburn-rx-recall/file',
  },
  {
    external_id: 'sample-aggregator:hourly-overtime-ca-2025',
    title: 'Unpaid Overtime & Missed Break Wage Settlement',
    summary:
      'Hourly employees who worked through breaks or off the clock may be owed back wages and penalties. Most claimants need no paperwork — payments come from payroll records.',
    description:
      'The employer settled a class action alleging it failed to pay overtime and provide compliant meal and rest breaks. Current and former non-exempt workers during the class period share a fund allocated by weeks worked.',
    category: 'Employment',
    typical_payout: '$100–$2,000',
    proof_required: false,
    deadline: daysOut(60),
    eligibility: { requires: ['employed_hourly'], states: ['CA'] },
    eligibility_text: 'California hourly (non-exempt) employees who worked during the class period.',
    source_url: 'https://sample-aggregator.example/settlements/hourly-overtime-ca',
    claim_url: 'https://sample-aggregator.example/settlements/hourly-overtime-ca/file',
  },
  {
    external_id: 'sample-aggregator:olive-oil-mislabel-2025',
    title: '"Extra Virgin" Olive Oil Mislabeling Settlement',
    summary:
      'A grocery-brand olive oil was labeled "extra virgin" despite failing quality tests. Buyers can claim a per-bottle refund up to a household cap — no receipt needed for small claims.',
    description:
      'The company settled false-advertising claims that its olive oil did not meet extra-virgin standards. Consumers may claim a fixed amount per bottle up to a household maximum without proof of purchase, or a higher amount with receipts.',
    category: 'Food & Beverage',
    typical_payout: '$10–$40',
    proof_required: false,
    deadline: daysOut(75),
    eligibility: {
      requires: ['bought_consumer_goods'],
      dateRange: { from: '2019-01-01', to: '2024-12-31' },
    },
    eligibility_text: 'Anyone who bought the labeled olive oil during the class period.',
    source_url: 'https://sample-aggregator.example/settlements/olive-oil-mislabel',
    claim_url: 'https://sample-aggregator.example/settlements/olive-oil-mislabel/file',
  },
  {
    external_id: 'sample-aggregator:telecom-admin-fee-2025',
    title: 'Wireless "Administrative Fee" Settlement',
    summary:
      'A wireless carrier tacked on an undisclosed monthly "administrative fee." Current and former subscribers can claim a cash refund of the fees they paid.',
    description:
      'The carrier settled claims that its monthly administrative fee was not adequately disclosed at sign-up. Subscribers during the class period receive a cash payment based on how long they were billed the fee.',
    category: 'Technology',
    typical_payout: '$15–$120',
    proof_required: false,
    deadline: daysOut(45),
    eligibility: { requires: ['used_streaming'], notes: 'Paid a monthly wireless/telecom subscription.' },
    eligibility_text: 'Wireless subscribers charged the monthly administrative fee during the class period.',
    source_url: 'https://sample-aggregator.example/settlements/telecom-admin-fee',
    claim_url: 'https://sample-aggregator.example/settlements/telecom-admin-fee/file',
  },
  {
    external_id: 'sample-aggregator:photo-face-scan-privacy-2025',
    title: 'Photo App Face-Geometry Privacy Settlement',
    summary:
      'A popular photo app scanned users’ facial geometry to power tagging features without the consent some state privacy laws require. Eligible users can file for a cash payment.',
    description:
      'The platform settled claims that it collected and stored biometric face templates without the written disclosures and consent required by state biometric privacy laws. Eligible residents receive a pro-rata cash payment from the settlement fund.',
    category: 'Privacy',
    typical_payout: '$150–$1,000',
    proof_required: false,
    deadline: daysOut(35),
    eligibility: { requires: ['uses_social_media'], states: ['IL', 'TX', 'WA', 'CA'] },
    eligibility_text: 'Residents of IL, TX, WA, or CA who used the app’s photo-tagging feature.',
    source_url: 'https://sample-aggregator.example/settlements/photo-face-scan-privacy',
    claim_url: 'https://sample-aggregator.example/settlements/photo-face-scan-privacy/file',
  },
  {
    external_id: 'sample-aggregator:dishwasher-defect-2025',
    title: 'Dishwasher Control-Board Defect Settlement',
    summary:
      'Certain dishwasher models shipped with a control board prone to premature failure. Owners can be reimbursed for repairs or receive a rebate toward a replacement.',
    description:
      'The manufacturer settled claims that a defective control board caused dishwashers to stop working outside the warranty period. Owners may claim reimbursement for documented repair costs or a rebate toward a new unit.',
    category: 'Consumer Products',
    typical_payout: 'Up to $350',
    proof_required: true,
    deadline: daysOut(110),
    eligibility: { requires: ['bought_consumer_goods'], notes: 'Owned a covered model purchased during the class period.' },
    eligibility_text: 'Owners of covered dishwasher models who paid for a control-board repair.',
    source_url: 'https://sample-aggregator.example/settlements/dishwasher-defect',
    claim_url: 'https://sample-aggregator.example/settlements/dishwasher-defect/file',
  },
];

export const sampleAggregatorAdapter: SourceAdapter = {
  slug: 'sample-aggregator',
  name: 'Sample Settlement Aggregator',
  homepage: 'https://sample-aggregator.example',
  async fetch(): Promise<ScrapedLawsuit[]> {
    // A real adapter would fetch + parse here; the sample returns fresh copies
    // (with deadlines recomputed relative to today) on every run.
    return RECORDS.map((r) => ({ ...r, eligibility: { ...r.eligibility } }));
  },
};
