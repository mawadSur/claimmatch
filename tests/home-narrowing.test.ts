import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeNarrowing } from '@/components/home/HomeNarrowing';
import { homeWedgeAvailability } from '@/lib/home-wedges';
import { HOME_HERO_PRIMARY_CTA } from '@/lib/copy';
import type { Lawsuit } from '@/lib/types';
import { makeLawsuit } from './helpers';

const listed = vi.hoisted(() => ({ lawsuits: [] as Lawsuit[] }));

afterEach(() => {
  vi.unstubAllEnvs();
  listed.lawsuits = [];
});

vi.mock('@/lib/lawsuits', () => ({
  lookupLawsuits: async () => ({ lawsuits: listed.lawsuits, openingSoon: [], error: false }),
}));

vi.mock('next/dynamic', async () => {
  const { HowItWorks } = await import('@/components/home/HowItWorks');
  const { HomeBrowseTeaser } = await import('@/components/home/HomeBrowseTeaser');
  const { HomeSimplifyBelow } = await import('@/components/home/HomeSimplifyBelow');
  const { Testimonials } = await import('@/components/home/Testimonials');
  return {
    default: (load: () => Promise<unknown>) => {
      const src = String(load);
      if (src.includes('HomeBrowseTeaser')) return HomeBrowseTeaser;
      if (src.includes('HomeSimplifyBelow')) return HomeSimplifyBelow;
      if (src.includes('Testimonials')) return Testimonials;
      return HowItWorks;
    },
  };
});

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

  it('stays off the simplified homepage even when the wedge flag is on', async () => {
    const off = renderToStaticMarkup(await HomePage());
    expect(off).not.toContain('No proof required');
    expect(off).not.toContain('Start with a type of settlement');
    expect(off).toContain('See open settlements');
    expect(off).toContain('href="/lawsuits"');

    listed.lawsuits = [
      makeLawsuit({ proof: 'no' }, { category: 'Data Breach', title: 'Acme Breach' }),
      makeLawsuit({ proof: 'no' }, { category: 'Privacy', title: 'Acme Privacy', slug: 'acme-privacy' }),
    ];
    vi.stubEnv('HOME_WEDGE_ENTRIES_ENABLED', '1');
    const on = renderToStaticMarkup(await HomePage());
    expect(on).not.toContain('Start with a type of settlement');
    expect(on).not.toContain('No proof required');
    expect(on).toContain(HOME_HERO_PRIMARY_CTA);
    expect(on).toContain('Browse settlements');
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
