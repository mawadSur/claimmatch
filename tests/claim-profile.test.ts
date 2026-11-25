import { describe, expect, it } from 'vitest';
import {
  parseClaimProfileInput,
  secretsError,
  emptyClaimProfile,
  mergeClaimProfile,
  profileValueForSpecPath,
} from '@/lib/claim-profile';
import { missingFieldsForSpec } from '@/lib/filing/v2/missing-fields';
import type { FilingSpecContent } from '@/lib/filing/v2/contract-spec';

const spec = {
  member_fields: [
    { field: 'legal_name', official_label: 'Full name', required: true },
  ],
  questions: [
    { key: 'vin', official_label: 'VIN', type: 'vin', required: true, help: null },
    { key: 'notice_id', official_label: 'Notice ID', type: 'notice_id', required: true, help: null },
    { key: 'pin', official_label: 'Login PIN', type: 'text', required: true, help: null },
  ],
  payout_options: [],
} as unknown as FilingSpecContent;

describe('parseClaimProfileInput', () => {
  it('accepts a name, address and payout method name', () => {
    const parsed = parseClaimProfileInput({
      legal_name: 'Ada Lovelace',
      email: 'ada@example.com',
      payout_preference: 'check',
      current_address: { line1: '1 Main St', city: 'Austin', state: 'tx', zip: '78701' },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.legal_name).toBe('Ada Lovelace');
    expect(parsed.profile.payout_preference).toBe('check');
    expect(parsed.profilePatch.state).toBe('TX');
    expect(parsed.profilePatch.zip).toBe('78701');
  });

  it('rejects a Social Security number anywhere', () => {
    const parsed = parseClaimProfileInput({ legal_name: 'Ada 123-45-6789' });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a VIN that is not 17 characters', () => {
    const parsed = parseClaimProfileInput({ vehicle_vin: 'SHORT' });
    expect(parsed.ok).toBe(false);
  });

  it('rejects bank-like digits in an address', () => {
    expect(secretsError('routing 021000021', 'Address')).toMatch(/never stores/i);
  });
});

describe('missingFieldsForSpec', () => {
  it('asks only for required fields still empty, never a login PIN by default', () => {
    const profile = mergeClaimProfile({ legal_name: 'Ada Lovelace', addresses: [] }, null);
    const missing = missingFieldsForSpec({ spec, profile, needsNoticeId: true });
    const keys = missing.map((f) => f.key);
    expect(keys).toContain('vin');
    expect(keys).toContain('notice_id');
    expect(keys).not.toContain('legal_name');
    expect(keys).not.toContain('pin');
    expect(missing.every((f) => !f.isAdminPin)).toBe(true);
  });

  it('maps VIN and notice ID correctly', () => {
    const profile = emptyClaimProfile();
    profile.vehicle_vin = '1HGCM82633A004352';
    const missing = missingFieldsForSpec({
      spec,
      profile,
      answers: { notice_id: 'N-1' },
    });
    expect(missing.map((f) => f.key)).not.toContain('vin');
    expect(missing.map((f) => f.key)).not.toContain('notice_id');
  });
});

describe('profileValueForSpecPath', () => {
  it('reads current address and VIN', () => {
    const profile = mergeClaimProfile(
      {
        vehicle_vin: '1HGCM82633A004352',
        addresses: [
          { kind: 'current', line1: '1 Main', line2: null, city: 'Austin', state: 'TX', zip: '78701', lived_from: null, lived_to: null },
        ],
      },
      { full_name: 'Ada' },
    );
    expect(profileValueForSpecPath(profile, 'member.legal_name')).toBe('Ada');
    expect(profileValueForSpecPath(profile, 'member.address.zip')).toBe('78701');
    expect(profileValueForSpecPath(profile, 'answers.vin')).toBe('1HGCM82633A004352');
  });
});
