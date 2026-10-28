import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAdministratorAdapter,
  listRegisteredAdapters,
  registerAdministratorAdapter,
  UnsupportedAdministratorAdapter,
} from '@/lib/administrators/adapters';
import { authorizedClaimsToCsv, exportAuthorizedClaims } from '@/lib/administrators/export';
import { guessAdministratorSlug, isFilingMethod, KNOWN_ADMINISTRATORS } from '@/lib/administrators/registry';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('administrator registry', () => {
  it('includes the major claims administrators on manual filing', () => {
    const slugs = KNOWN_ADMINISTRATORS.map((a) => a.slug);
    expect(slugs).toEqual(expect.arrayContaining(['epiq', 'kroll', 'jnd', 'angeion']));
    expect(KNOWN_ADMINISTRATORS.every((a) => a.filing_method === 'manual')).toBe(true);
    expect(isFilingMethod('api')).toBe(true);
    expect(isFilingMethod('browser')).toBe(true);
    expect(isFilingMethod('manual')).toBe(true);
    expect(isFilingMethod('fax')).toBe(false);
    expect(guessAdministratorSlug('Epiq Class Action')).toBe('epiq');
  });
});

describe('administrator API adapters', () => {
  it('returns unsupported until a real adapter is registered', async () => {
    const adapter = getAdministratorAdapter('epiq');
    expect(adapter).toBeInstanceOf(UnsupportedAdministratorAdapter);
    expect(await adapter.submit({
      administratorSlug: 'epiq',
      lawsuitId: 'l1',
      claimUrl: null,
      profile: { full_name: 'Ada' } as never,
    })).toEqual({ status: 'unsupported' });
    expect(listRegisteredAdapters()).toEqual([]);
  });

  it('registers a future adapter by slug', () => {
    const stub = new UnsupportedAdministratorAdapter('kroll');
    registerAdministratorAdapter(stub);
    expect(getAdministratorAdapter('kroll')).toBe(stub);
    expect(listRegisteredAdapters()).toContain('kroll');
  });
});

describe('authorized-claims export', () => {
  const rows = [
    {
      claim_id: 'c1',
      user_id: 'u1',
      lawsuit_id: 'l1',
      lawsuit_title: 'NY Auto',
      authorization_version: 'v1',
      authorized_at: '2026-10-28T00:00:00.000Z',
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      state: 'NY',
      zip: '10001',
      address_line1: '1 Main',
      address_line2: null,
      city: 'New York',
    },
  ];

  it('is off unless DIRECT_FILING_ENABLED=1', () => {
    expect(exportAuthorizedClaims(rows, 'csv').ok).toBe(false);
    vi.stubEnv('DIRECT_FILING_ENABLED', '1');
    const csv = exportAuthorizedClaims(rows, 'csv');
    expect(csv.ok).toBe(true);
    if (csv.ok) {
      expect(csv.contentType).toMatch(/csv/);
      expect(csv.body).toContain('Ada Lovelace');
      expect(csv.body.split('\n')[0]).toContain('authorization_version');
    }
    const json = exportAuthorizedClaims(rows, 'json');
    expect(json.ok).toBe(true);
    if (json.ok) {
      expect(JSON.parse(json.body).count).toBe(1);
    }
  });

  it('escapes commas in CSV cells', () => {
    const body = authorizedClaimsToCsv([{ ...rows[0], city: 'New York, NY' }]);
    expect(body).toContain('"New York, NY"');
  });
});
