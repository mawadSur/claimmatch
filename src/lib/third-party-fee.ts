export const THIRD_PARTY_FEE_STATUSES = ['unknown', 'allowed', 'barred'] as const;
export type ThirdPartyFeeStatus = (typeof THIRD_PARTY_FEE_STATUSES)[number];

export function isThirdPartyFeeStatus(value: unknown): value is ThirdPartyFeeStatus {
  return typeof value === 'string' && (THIRD_PARTY_FEE_STATUSES as readonly string[]).includes(value);
}

/**
 * Paid assist is only allowed when the settlement explicitly allows a
 * third-party fee. unknown and barred both return false. Does not charge.
 */
export function canOfferPaidAssist(lawsuit: {
  third_party_fee_status?: ThirdPartyFeeStatus | string | null;
  third_party_fee_allowed?: boolean | null;
}): boolean {
  if (lawsuit.third_party_fee_status === 'barred') return false;
  if (lawsuit.third_party_fee_status === 'allowed') return true;
  return lawsuit.third_party_fee_allowed === true;
}

export function normalizeThirdPartyFeeStatus(value: unknown): ThirdPartyFeeStatus | null {
  if (!isThirdPartyFeeStatus(value)) return null;
  return value;
}
