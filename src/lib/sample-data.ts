import type { Lawsuit } from './types';

/**
 * A small set of realistic sample settlements used as a graceful fallback when
 * Supabase is not configured or the `lawsuits` table is empty. This keeps the
 * deployed site looking alive before the DB is seeded. The full seed lives in
 * supabase/seed.sql. These are illustrative examples, not legal solicitations.
 */
function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const base = {
  status: 'open' as const,
  payout_min: null,
  payout_max: null,
  source_id: null,
  external_id: null,
  hero_image_url: null,
  review_status: 'published' as const,
  extraction_confidence: null,
  administrator: null,
  raw_source_text: null,
  estimated_value_min: null,
  estimated_value_max: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const SAMPLE_LAWSUITS: Lawsuit[] = [
  {
    ...base,
    id: 'sample-databreach',
    slug: 'nationwide-data-breach-settlement',
    title: 'Nationwide Data Breach Settlement',
    summary:
      'A major retailer exposed customer names, emails, and payment details. If you shopped there and got a breach notice, you may claim reimbursement plus time spent.',
    description:
      'The settlement covers consumers whose personal information was compromised in the breach. Class members may claim up to $150 for ordinary losses and lost time, or documented out-of-pocket losses up to $5,000.',
    category: 'Data Breach',
    typical_payout: '$25–$150',
    proof_required: false,
    deadline: iso(45),
    eligibility: { requires: ['had_data_breach'] },
    eligibility_text: 'Anyone who received a data-breach notification from the company.',
    source_url: 'https://example.com/data-breach-settlement',
    claim_url: 'https://example.com/data-breach-settlement/claim',
    is_featured: true,
  },
  {
    ...base,
    id: 'sample-bankfees',
    slug: 'bank-overdraft-fees-settlement',
    title: 'Bank Overdraft & Account Fees Settlement',
    summary:
      'Customers charged surprise overdraft or maintenance fees may be owed automatic refunds. No receipts required for most claimants.',
    description:
      'The bank agreed to refund a portion of overdraft and "insufficient funds" fees charged during the class period. Payments are calculated automatically from account records.',
    category: 'Financial & Banking',
    typical_payout: '$40–$500',
    proof_required: false,
    deadline: iso(80),
    eligibility: { requires: ['used_banking'] },
    eligibility_text: 'Account holders charged overdraft or NSF fees in the last 5 years.',
    source_url: 'https://example.com/overdraft-settlement',
    claim_url: 'https://example.com/overdraft-settlement/claim',
    is_featured: true,
  },
  {
    ...base,
    id: 'sample-privacy',
    slug: 'social-media-privacy-settlement',
    title: 'Social Media Biometric Privacy Settlement',
    summary:
      'A social platform collected facial-recognition and location data without proper consent. Users in eligible states can file for a cash payment.',
    description:
      'The platform settled claims that it collected biometric identifiers without the disclosures required by state privacy law. Eligible users receive a pro-rata cash payment.',
    category: 'Privacy',
    typical_payout: '$30–$400',
    proof_required: false,
    deadline: iso(20),
    eligibility: { requires: ['uses_social_media'], states: ['IL', 'TX', 'CA', 'WA'] },
    eligibility_text: 'Residents of IL, TX, CA, or WA who used the platform.',
    source_url: 'https://example.com/privacy-settlement',
    claim_url: 'https://example.com/privacy-settlement/claim',
    is_featured: true,
  },
  {
    ...base,
    id: 'sample-auto',
    slug: 'vehicle-defect-settlement',
    title: 'Vehicle Infotainment Defect Settlement',
    summary:
      'Owners and lessees of certain model-year vehicles with failing touchscreens may be reimbursed for repairs and extended warranties.',
    description:
      'The automaker settled claims that infotainment units failed prematurely. Class members can claim repair reimbursement and an extended warranty.',
    category: 'Auto & Vehicles',
    typical_payout: 'Up to $1,200',
    proof_required: true,
    deadline: iso(120),
    eligibility: { requires: ['owns_vehicle'], anyOf: { vehicle_brands: ['Toyota', 'Honda', 'Ford', 'Kia', 'Hyundai'] } },
    eligibility_text: 'Owners/lessees of covered model-year vehicles.',
    source_url: 'https://example.com/vehicle-settlement',
    claim_url: 'https://example.com/vehicle-settlement/claim',
    is_featured: false,
  },
  {
    ...base,
    id: 'sample-consumer',
    slug: 'mislabeled-supplements-settlement',
    title: 'Mislabeled Supplements Settlement',
    summary:
      'Buyers of a popular supplement line that overstated its active ingredients can claim a refund — no proof of purchase needed for small claims.',
    description:
      'The company settled false-advertising claims about ingredient amounts. Consumers may claim a per-unit refund up to a household cap without a receipt.',
    category: 'Consumer Products',
    typical_payout: '$10–$75',
    proof_required: false,
    deadline: iso(60),
    eligibility: { requires: ['bought_consumer_goods'] },
    eligibility_text: 'Anyone who purchased the product during the class period.',
    source_url: 'https://example.com/supplements-settlement',
    claim_url: 'https://example.com/supplements-settlement/claim',
    is_featured: false,
  },
  {
    ...base,
    id: 'sample-streaming',
    slug: 'streaming-auto-renewal-settlement',
    title: 'Streaming Auto-Renewal Settlement',
    summary:
      'A streaming service renewed subscriptions without the required notice. Subscribers may receive account credits or a cash payment.',
    description:
      'The service settled claims that it auto-renewed subscriptions without clear disclosure. Class members receive a credit or cash payment per the settlement grid.',
    category: 'Technology',
    typical_payout: '$15–$90',
    proof_required: false,
    deadline: iso(35),
    eligibility: { requires: ['used_streaming'] },
    eligibility_text: 'Anyone billed for an auto-renewed subscription during the class period.',
    source_url: 'https://example.com/streaming-settlement',
    claim_url: 'https://example.com/streaming-settlement/claim',
    is_featured: false,
  },
];

export function getSampleFeatured(): Lawsuit[] {
  return SAMPLE_LAWSUITS.filter((l) => l.is_featured);
}
