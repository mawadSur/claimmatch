import { describe, expect, it } from 'vitest';
import { canOfferPaidAssist, isThirdPartyFeeStatus } from '@/lib/third-party-fee';

describe('canOfferPaidAssist', () => {
  it('returns true only when the settlement allows a third-party fee', () => {
    expect(canOfferPaidAssist({ third_party_fee_status: 'allowed' })).toBe(true);
    expect(canOfferPaidAssist({ third_party_fee_status: 'unknown' })).toBe(false);
    expect(canOfferPaidAssist({ third_party_fee_status: 'barred' })).toBe(false);
    expect(canOfferPaidAssist({ third_party_fee_allowed: true })).toBe(true);
    expect(canOfferPaidAssist({ third_party_fee_status: 'barred', third_party_fee_allowed: true })).toBe(
      false,
    );
    expect(isThirdPartyFeeStatus('allowed')).toBe(true);
    expect(isThirdPartyFeeStatus('maybe')).toBe(false);
  });
});
