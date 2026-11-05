import { describe, expect, it, vi } from 'vitest';
import {
  consentCategoriesFromFacts,
  consentRowsForFacts,
  PRIVACY_POLICY_VERSION,
  recordFactConsent,
} from '@/lib/consent';

describe('fact consent', () => {
  it('records one category per fact type and the draft policy version', () => {
    expect(
      consentCategoriesFromFacts([
        { type: 'purchase' },
        { type: 'purchase' },
        { type: 'employer' },
      ]),
    ).toEqual(['purchase', 'employer']);
    expect(
      consentRowsForFacts('user-1', [{ type: 'location' }, { type: 'brand' }]),
    ).toEqual([
      { user_id: 'user-1', category: 'location', policy_version: PRIVACY_POLICY_VERSION },
      { user_id: 'user-1', category: 'brand', policy_version: PRIVACY_POLICY_VERSION },
    ]);
    expect(PRIVACY_POLICY_VERSION).toMatch(/draft/);
  });

  it('skips the write when no facts were collected', async () => {
    const upsert = vi.fn();
    await recordFactConsent({ from: () => ({ upsert }) }, 'user-1', []);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts unique consent rows and ignores duplicates', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    await recordFactConsent({ from: () => ({ upsert }) }, 'user-1', [{ type: 'purchase' }]);
    expect(upsert).toHaveBeenCalledWith(
      [{ user_id: 'user-1', category: 'purchase', policy_version: PRIVACY_POLICY_VERSION }],
      { onConflict: 'user_id,category,policy_version', ignoreDuplicates: true },
    );
  });
});
