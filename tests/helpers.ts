import type { EligibilityCriteria, Lawsuit, Profile } from '@/lib/types';

/**
 * Test fixtures. The matcher only reads a handful of fields, but we build fully
 * type-valid objects so `tsc --noEmit` (run in CI over tests/**) stays green and
 * the fixtures can't silently drift from the domain types.
 */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'test@example.com',
    full_name: 'Test User',
    state: null,
    zip: null,
    attributes: {},
    email_opt_in: true,
    onboarded: true,
    is_admin: false,
    phone: null,
    sms_opt_in: false,
    referral_code: null,
    referred_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeLawsuit(
  eligibility: EligibilityCriteria = {},
  overrides: Partial<Lawsuit> = {},
): Lawsuit {
  return {
    id: 'lawsuit-1',
    slug: 'test-settlement',
    title: 'Test Settlement',
    summary: null,
    description: null,
    category: 'General',
    status: 'open',
    typical_payout: null,
    payout_min: null,
    payout_max: null,
    proof_required: false,
    deadline: null,
    eligibility,
    eligibility_text: null,
    source_id: null,
    source_url: null,
    claim_url: null,
    external_id: null,
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
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
