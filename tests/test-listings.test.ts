import { describe, expect, it } from 'vitest';
import {
  isPublicTestListing,
  isTestSettlementSlug,
  ONE_CLICK_TEST_SLUG,
  rejectPublicTestListings,
} from '@/lib/test-settlements';
import { makeLawsuit } from './helpers';

describe('public test listing guard', () => {
  it('hides the one-click test slug', () => {
    expect(isTestSettlementSlug(ONE_CLICK_TEST_SLUG)).toBe(true);
    expect(isPublicTestListing({ slug: ONE_CLICK_TEST_SLUG, title: 'Anything' })).toBe(true);
  });

  it('hides is_test rows even with a normal slug', () => {
    expect(isPublicTestListing({ slug: 'ford-transit-trail-settlement', title: 'Ford Transit', is_test: true })).toBe(
      true,
    );
    expect(isPublicTestListing({ slug: 'ford-transit-trail-settlement', title: 'Ford Transit', is_test: false })).toBe(
      false,
    );
  });

  it('hides [TEST] titles and dummy slugs', () => {
    expect(isPublicTestListing({ slug: 'acme', title: '[TEST] Dummy settlement' })).toBe(true);
    expect(isPublicTestListing({ slug: 'dummy-settlement', title: 'Something' })).toBe(true);
    expect(isPublicTestListing({ slug: 'sample-listing', title: 'Sample' })).toBe(true);
  });

  it('leaves real catalog rows visible', () => {
    expect(
      isPublicTestListing({
        slug: 'amazon-return-policy-settlement',
        title: 'Amazon Return Policy Settlement',
      }),
    ).toBe(false);
    expect(
      isPublicTestListing({
        slug: 'non-bank-atm-fee-settlement',
        title: 'Non-Bank ATM Fee Settlement',
      }),
    ).toBe(false);
  });

  it('filters a mixed list without deleting rows', () => {
    const rows = [
      makeLawsuit({}, { slug: 'amazon-return-policy-settlement', title: 'Amazon Return Policy Settlement' }),
      makeLawsuit({}, { slug: ONE_CLICK_TEST_SLUG, title: '[TEST] Lawsuit AI one-click test settlement' }),
      makeLawsuit({}, { slug: 'kept', title: 'Kept', is_test: true }),
    ];
    expect(rejectPublicTestListings(rows).map((r) => r.slug)).toEqual(['amazon-return-policy-settlement']);
    expect(rows).toHaveLength(3);
  });
});
