import { describe, expect, it } from 'vitest';
import {
  BREACH_CATEGORY_SLUGS,
  NO_PIN_CLAIM_ACTION_TYPES,
  isBreachCategory,
  isBreachSettlement,
  isNoPinClaimAction,
  noPinBreachRank,
} from '@/lib/claim-priority';

describe('isNoPinClaimAction', () => {
  it('is true only for the two claim_action_type values with an open official path', () => {
    expect([...NO_PIN_CLAIM_ACTION_TYPES]).toEqual(['desk_file', 'online_form']);
    expect(isNoPinClaimAction('desk_file')).toBe(true);
    expect(isNoPinClaimAction('online_form')).toBe(true);
  });

  it('treats an absent column as "not known to be no-PIN", never as no-PIN', () => {
    // lookupLawsuits() selects *, so before migration 0051 is applied every
    // row simply has no claim_action_type key and the boost must no-op.
    expect(isNoPinClaimAction(undefined)).toBe(false);
    expect(isNoPinClaimAction(null)).toBe(false);
    expect(isNoPinClaimAction('')).toBe(false);
  });

  it('is false for every claim path that needs an ID, the mail, or nothing at all', () => {
    for (const type of ['needs_notice_id', 'mail_in', 'automatic_payment', 'not_open', 'link_out']) {
      expect(isNoPinClaimAction(type), type).toBe(false);
    }
  });
});

describe('isBreachCategory', () => {
  it('covers the free-text category labels breach cases are actually filed under', () => {
    expect([...BREACH_CATEGORY_SLUGS]).toEqual(['data-breach', 'privacy']);
    expect(isBreachCategory('Data Breach')).toBe(true);
    expect(isBreachCategory('data-breach')).toBe(true);
    expect(isBreachCategory('Privacy')).toBe(true);
  });

  it('rejects unrelated categories and missing values', () => {
    for (const category of ['General', 'Employment', 'Auto & Vehicles', '', null, undefined]) {
      expect(isBreachCategory(category), String(category)).toBe(false);
    }
  });
});

describe('isBreachSettlement', () => {
  it('catches a breach row mis-filed under another free-text category', () => {
    expect(
      isBreachSettlement({ category: 'Health & Pharma', title: 'Clinic Data Breach Settlement' }),
    ).toBe(true);
    expect(
      isBreachSettlement({ category: 'General', summary: 'A vendor breached its customer records.' }),
    ).toBe(true);
  });

  it('does not read an unrelated consumer listing as a breach', () => {
    expect(isBreachSettlement({ category: 'Food & Beverage', title: 'Packaged Snack Labels Settlement' })).toBe(
      false,
    );
    expect(isBreachSettlement({})).toBe(false);
  });
});

describe('noPinBreachRank', () => {
  it('ranks no-PIN breach first, then no-PIN, then everything else', () => {
    expect(noPinBreachRank({ claim_action_type: 'desk_file', category: 'Data Breach' })).toBe(0);
    expect(noPinBreachRank({ claim_action_type: 'online_form', category: 'Privacy' })).toBe(0);
    expect(noPinBreachRank({ claim_action_type: 'online_form', category: 'Employment' })).toBe(1);
    expect(noPinBreachRank({ claim_action_type: 'needs_notice_id', category: 'Data Breach' })).toBe(2);
    expect(noPinBreachRank({ claim_action_type: 'mail_in', category: 'Data Breach' })).toBe(2);
  });

  it('ranks a row with no known claim_action_type last, whatever its category', () => {
    expect(noPinBreachRank({ category: 'Data Breach' })).toBe(2);
    expect(noPinBreachRank({ claim_action_type: null, category: 'Data Breach' })).toBe(2);
  });
});
