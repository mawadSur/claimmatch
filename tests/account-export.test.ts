import { describe, expect, it } from 'vitest';
import { buildAccountExport } from '@/lib/account-export';
import { PRIVACY_POLICY_VERSION } from '@/lib/consent';
import type { Profile } from '@/lib/types';

const profile = {
  id: 'user-1',
  email: 'ada@example.com',
  full_name: 'Ada',
  state: 'CA',
  zip: null,
  attributes: { owns_vehicle: true },
  email_opt_in: true,
  email_frequency: 'weekly',
  onboarded: true,
  is_admin: false,
  phone: null,
  sms_opt_in: false,
  referral_code: null,
  referred_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
} as Profile;

describe('account export payload', () => {
  it('includes profile, facts, consent, matches, and claims', () => {
    const payload = buildAccountExport({
      now: new Date('2026-11-04T12:00:00.000Z'),
      profile,
      facts: [
        {
          type: 'purchase',
          value: 'Toyota',
          start_date: '2021-03-01',
          end_date: '2021-03-01',
          source: 'settings',
        },
      ],
      consent: [
        {
          category: 'purchase',
          granted_at: '2026-11-04T00:00:00.000Z',
          policy_version: PRIVACY_POLICY_VERSION,
        },
      ],
      matches: [
        {
          score: 0.7,
          reasons: ['Bought Toyota in 2021, inside the class period'],
          dismissed: false,
          notified_at: null,
          lawsuit: { title: 'Example', slug: 'example' },
        },
      ],
      claims: [{ id: 'claim-1', status: 'self_file', lawsuit_title: 'Example' }],
    });

    expect(payload.exported_at).toBe('2026-11-04T12:00:00.000Z');
    expect(payload.policy_version).toBe(PRIVACY_POLICY_VERSION);
    expect(payload.profile.email_opt_in).toBe(true);
    expect(payload.profile.email_frequency).toBe('weekly');
    expect(payload.profile.attributes).toEqual({ owns_vehicle: true });
    expect(payload.profile_facts[0]).toMatchObject({ type: 'purchase', value: 'Toyota' });
    expect(payload.consent[0].category).toBe('purchase');
    expect(payload.matches[0].lawsuit_slug).toBe('example');
    expect(payload.claims[0].id).toBe('claim-1');
  });
});
