import type { EligibilityCriteria, Lawsuit, Profile } from '@/lib/types';

/**
 * Test fixtures for the matcher, which reads profile.state, profile.attributes,
 * lawsuit.id, lawsuit.eligibility, lawsuit.deadline, and (when the unstructured
 * flag is on) title/summary/category. Each fixture sets those fields plus a few
 * identifying ones and is cast to the domain type, so adding a column to
 * Profile or Lawsuit does not break every test file. A test that depends on
 * any other field must pass it in `overrides`.
 */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    state: null,
    attributes: {},
    onboarded: true,
    ...overrides,
  } as Profile;
}

export function makeLawsuit(
  eligibility: EligibilityCriteria = {},
  overrides: Partial<Lawsuit> = {},
): Lawsuit {
  return {
    id: 'lawsuit-1',
    slug: 'test-settlement',
    title: 'Test Settlement',
    category: 'General',
    status: 'open',
    review_status: 'published',
    deadline: null,
    eligibility,
    ...overrides,
  } as Lawsuit;
}

/**
 * A full published catalog row (every Lawsuit column, typed, no cast), for
 * the catalog query and page tests (tests/catalog-queries.test.ts and
 * tests/catalog-pages.test.ts).
 */
export function catalogLawsuit(overrides: Partial<Lawsuit> = {}): Lawsuit {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'amazon-return-policy-settlement',
    title: 'Amazon Return Policy Settlement',
    summary: 'Amazon Return Policy Settlement. Estimated payout: No fixed amount is stated.',
    description: 'No fixed amount is stated.',
    category: 'Consumer Products',
    status: 'open',
    typical_payout: 'No fixed amount is stated.',
    payout_min: null,
    payout_max: null,
    proof_required: false,
    deadline: '2099-12-01',
    eligibility: { proof: 'optional' },
    eligibility_text: 'Open to eligible US residents.',
    source_id: null,
    source_url: 'https://settlesignal.com/settlements/amazon-return-policy-settlement/',
    claim_url: 'https://www.returnsettlement.com/submit-claim',
    external_id: 'settlesignal:amazon',
    hero_image_url: null,
    is_featured: false,
    review_status: 'published',
    extraction_confidence: null,
    administrator: null,
    raw_source_text: null,
    estimated_value_min: null,
    estimated_value_max: null,
    reviewed_by: null,
    reviewed_at: null,
    last_seen_at: null,
    missed_feed_count: 0,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}
