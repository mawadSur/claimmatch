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
