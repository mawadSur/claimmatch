import { describe, expect, it } from 'vitest';
import {
  currentAddressOf,
  parseClaimProfileInput,
  secretsError,
  emptyClaimProfile,
  mergeClaimProfile,
  memberPrefillFromClaimProfile,
  profileValueForSpecPath,
  splitLegalName,
} from '@/lib/claim-profile';
import { packetSeedFromClaimProfile } from '@/lib/claim-profile-server';
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
    expect(profileValueForSpecPath(profile, 'member.first_name')).toBe('Ada');
    expect(profileValueForSpecPath(profile, 'member.last_name')).toBeNull();
    expect(profileValueForSpecPath(profile, 'member.address.zip')).toBe('78701');
    expect(profileValueForSpecPath(profile, 'answers.vin')).toBe('1HGCM82633A004352');
  });

  it('splits a multi-word legal name into first and last', () => {
    const profile = mergeClaimProfile({ legal_name: 'Ada Lovelace' }, null);
    expect(profileValueForSpecPath(profile, 'member.first_name')).toBe('Ada');
    expect(profileValueForSpecPath(profile, 'member.last_name')).toBe('Lovelace');
  });
});

describe('splitLegalName', () => {
  it('splits a full name on the first word, and leaves a single word as the first name only', () => {
    expect(splitLegalName('Ada Lovelace')).toEqual({ first_name: 'Ada', last_name: 'Lovelace' });
    expect(splitLegalName('  Jean  Claude Van Damme ')).toEqual({ first_name: 'Jean', last_name: 'Claude Van Damme' });
    expect(splitLegalName('Ada')).toEqual({ first_name: 'Ada', last_name: null });
    expect(splitLegalName('')).toEqual({ first_name: null, last_name: null });
    expect(splitLegalName(null)).toEqual({ first_name: null, last_name: null });
  });
});

describe('memberPrefillFromClaimProfile', () => {
  it('maps contact fields from the merged claim profile, leaving blanks empty', () => {
    const profile = mergeClaimProfile(
      {
        legal_name: 'Ada Lovelace',
        email: 'ada@example.test',
        phone: '555-0100',
        addresses: [
          { kind: 'current', line1: '1 Main', line2: 'Apt 2', city: 'Austin', state: 'TX', zip: '78701', lived_from: null, lived_to: null },
        ],
      },
      { full_name: 'Ignored' },
    );
    expect(memberPrefillFromClaimProfile(profile)).toEqual({
      full_name: 'Ada Lovelace',
      email: 'ada@example.test',
      phone: '555-0100',
      address_line1: '1 Main',
      address_line2: 'Apt 2',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    });
    expect(memberPrefillFromClaimProfile(emptyClaimProfile()).phone).toBeNull();
    expect(memberPrefillFromClaimProfile(emptyClaimProfile()).full_name).toBeNull();
  });
});

describe('mergeClaimProfile synthesizes the current address', () => {
  const partial = { full_name: 'Ada Lovelace', email: 'ada@example.test', city: 'Springfield', state: 'CA', zip: '94110' };

  it('keeps city, state and ZIP when the street line is blank', () => {
    // PR #82 keyed this on address_line1 alone, so a profile holding only
    // city/state/ZIP lost all three from the packet prefill — and because the
    // packet's member state feeds computeLane, that could also move the member
    // off the Easy-submit lane.
    const profile = mergeClaimProfile(null, { ...partial, address_line1: null, address_line2: null });
    expect(currentAddressOf(profile)).not.toBeNull();
    expect(memberPrefillFromClaimProfile(profile)).toMatchObject({
      address_line1: null,
      city: 'Springfield',
      state: 'CA',
      zip: '94110',
    });
  });

  it('treats an all-whitespace street line the same way', () => {
    const profile = mergeClaimProfile(null, { ...partial, address_line1: '   ' });
    expect(memberPrefillFromClaimProfile(profile)).toMatchObject({ address_line1: null, state: 'CA', zip: '94110' });
  });

  it('synthesizes nothing when every address part is empty', () => {
    const profile = mergeClaimProfile(null, { full_name: 'Ada Lovelace', address_line1: null, city: '', state: null, zip: '  ' });
    expect(currentAddressOf(profile)).toBeNull();
    expect(profile.addresses).toEqual([]);
    expect(memberPrefillFromClaimProfile(profile)).toMatchObject({ address_line1: null, city: null, state: null, zip: null });
  });

  it('still prefers a stored current address over the profiles row', () => {
    const profile = mergeClaimProfile(
      {
        addresses: [
          { kind: 'current', line1: '9 Stored Rd', line2: null, city: 'Austin', state: 'TX', zip: '78701', lived_from: null, lived_to: null },
        ],
      },
      { ...partial, address_line1: null },
    );
    expect(memberPrefillFromClaimProfile(profile)).toMatchObject({ address_line1: '9 Stored Rd', city: 'Austin', state: 'TX', zip: '78701' });
  });
});

describe('packetSeedFromClaimProfile', () => {
  const profile = mergeClaimProfile(
    { legal_name: 'Ada Lovelace', email: 'ada@example.test', phone: '555-0100', vehicle_vin: '1HGCM82633A004352' },
    { city: 'Springfield', state: 'CA', zip: '94110', address_line1: null },
  );

  it('seeds a contact fact only when the spec asks a question under that key', () => {
    const keys = ['email', 'phone', 'zip', 'state', 'vin'];
    expect(packetSeedFromClaimProfile(profile, keys, []).answers).toEqual({
      email: 'ada@example.test',
      phone: '555-0100',
      zip: '94110',
      state: 'CA',
      vin: '1HGCM82633A004352',
    });
    // Nothing leaks into a spec that never asks for it.
    expect(packetSeedFromClaimProfile(profile, ['notice_id'], []).answers).toEqual({});
  });

  it('leaves the keys whose meaning on a form is ambiguous alone', () => {
    // A seeded answer is signed with the packet, so city/street are only ever
    // filled in by the member (member_fields still prefill them as before).
    expect(packetSeedFromClaimProfile(profile, ['city', 'address_line1'], []).answers).toEqual({});
  });

  it('falls back to the sign-in email for an account or subscription email', () => {
    const keys = ['account_email', 'subscription_email'];
    expect(packetSeedFromClaimProfile(profile, keys, []).answers).toEqual({
      account_email: 'ada@example.test',
      subscription_email: 'ada@example.test',
    });
    const withAccountEmails = { ...profile, account_emails: ['reader@example.test'] };
    expect(packetSeedFromClaimProfile(withAccountEmails, keys, []).answers).toEqual({
      account_email: 'reader@example.test',
      subscription_email: 'reader@example.test',
    });
  });

  it('never invents an attestation: class_member is not seedable', () => {
    expect(packetSeedFromClaimProfile(profile, ['class_member'], []).answers).toEqual({});
  });
});
