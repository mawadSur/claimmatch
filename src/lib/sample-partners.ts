import type { Partner } from './types';

/**
 * Placeholder partner catalog used when Supabase isn't configured (local /
 * preview / first deploy), mirroring `@/lib/sample-data`. These are NOT real
 * partnerships — the ids are prefixed `sample-` and the URLs point at
 * example.com, so no lead events are ever persisted for them. Replace with real,
 * contracted partners (and real payout terms) via the `partners` table.
 */
export const SAMPLE_PARTNERS: Partner[] = [
  {
    id: 'sample-claimpros',
    slug: 'claimpros',
    name: 'ClaimPros',
    category: 'claims_service',
    tagline: 'Full-service help for complex or high-value claims',
    description:
      'A licensed claims-filing service that handles the paperwork end-to-end for settlements that require proof or documentation you’d rather not chase yourself.',
    url: 'https://partners.example.com/claimpros',
    logo_url: null,
    payout_model: 'hybrid',
    lead_fee_cents: 300,
    conversion_fee_cents: 4000,
    disclosure: null,
    active: true,
    priority: 30,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-settlementcounsel',
    slug: 'settlement-counsel',
    name: 'Settlement Counsel LLP',
    category: 'law_firm',
    tagline: 'Talk to an attorney about opting out or a larger claim',
    description:
      'A consumer-rights law firm for members who may have a larger individual claim or want legal advice before joining or opting out of a class.',
    url: 'https://partners.example.com/settlement-counsel',
    logo_url: null,
    payout_model: 'per_lead',
    lead_fee_cents: 800,
    conversion_fee_cents: 0,
    disclosure: null,
    active: true,
    priority: 20,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-taxrelief',
    slug: 'taxrelief-partners',
    name: 'TaxRelief Partners',
    category: 'tax',
    tagline: 'Figure out if your settlement payout is taxable',
    description:
      'Settlement income can be taxable. These specialists review your payout and help you report it correctly — often a quick, free consultation.',
    url: 'https://partners.example.com/taxrelief',
    logo_url: null,
    payout_model: 'per_conversion',
    lead_fee_cents: 0,
    conversion_fee_cents: 2500,
    disclosure: null,
    active: true,
    priority: 10,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sample-creditguard',
    slug: 'creditguard',
    name: 'CreditGuard',
    category: 'credit',
    tagline: 'Monitor your credit after a data-breach settlement',
    description:
      'If you were part of a data-breach settlement, ongoing credit monitoring helps you catch misuse early. Free tier available.',
    url: 'https://partners.example.com/creditguard',
    logo_url: null,
    payout_model: 'per_lead',
    lead_fee_cents: 150,
    conversion_fee_cents: 0,
    disclosure: null,
    active: true,
    priority: 5,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];
