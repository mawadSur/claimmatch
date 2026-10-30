import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeNarrowing } from '@/components/home/HomeNarrowing';
import { homeWedgeAvailability } from '@/lib/home-wedges';
import type { Lawsuit } from '@/lib/types';
import { makeLawsuit } from './helpers';

const listed = vi.hoisted(() => ({ lawsuits: [] as Lawsuit[] }));

afterEach(() => {
  vi.unstubAllEnvs();
  listed.lawsuits = [];
});

vi.mock('@/lib/lawsuits', () => ({
  lookupLawsuits: async () => ({ lawsuits: listed.lawsuits, error: false }),
}));

import HomePage from '@/app/page';

describe('C17 home narrowing', () => {
  it('renders the two entry points without match language', () => {
    const html = renderToStaticMarkup(createElement(HomeNarrowing));
    expect(html).toContain('Data breach');
    expect(html).toContain('Privacy');
    expect(html).toContain('No proof required');
    expect(html).toContain('/lawsuits?proof=no');
    expect(html).not.toMatch(/\bmatch/i);
  });

  it('stays off the home page unless a wedge flag is exactly 1 and the catalog can back it', async () => {
    const off = renderToStaticMarkup(await HomePage());
    expect(off).not.toContain('No proof required');
    expect(off).not.toContain('Start with a type of settlement');

    listed.lawsuits = [
      makeLawsuit({ proof: 'no' }, { category: 'Data Breach', title: 'Acme Breach' }),
      makeLawsuit({ proof: 'no' }, { category: 'Privacy', title: 'Acme Privacy', slug: 'acme-privacy' }),
    ];
    vi.stubEnv('HOME_WEDGE_ENTRIES_ENABLED', '1');
    const on = renderToStaticMarkup(await HomePage());
    expect(on).toContain('Start with a type of settlement');
    expect(on).toContain('No proof required');
    expect(on).toContain('Data breach');
    expect(on).not.toMatch(/\bmatch(?:ed|es|ing)?\b/i);
  });

  it('only offers filters the catalog can honestly fill', () => {
    const onlyBreach = homeWedgeAvailability([
      makeLawsuit({}, { category: 'Data Breach', proof_required: false }),
    ]);
    expect(onlyBreach.showDataBreach).toBe(true);
    expect(onlyBreach.showPrivacy).toBe(false);
    expect(onlyBreach.showNoProof).toBe(false);

    const noProof = homeWedgeAvailability([
      makeLawsuit({ proof: 'no' }, { category: 'Consumer Products' }),
    ]);
    expect(noProof.showNoProof).toBe(true);
    expect(noProof.showBreachPrivacy).toBe(false);
  });
});
