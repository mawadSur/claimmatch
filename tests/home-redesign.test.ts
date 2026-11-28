import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';
import { HOME_HERO_PRIMARY_CTA } from '@/lib/copy';
import { makeLawsuit } from './helpers';

const catalog = vi.hoisted(() => ({ lawsuits: [] as Lawsuit[], error: false }));

vi.mock('@/lib/lawsuits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lawsuits')>()),
  lookupLawsuits: async () => ({ lawsuits: catalog.lawsuits, openingSoon: [], error: catalog.error }),
}));

vi.mock('next/dynamic', async () => {
  const { HowItWorks } = await import('@/components/home/HowItWorks');
  const { HomeTrimCatalog } = await import('@/components/home/HomeTrimCatalog');
  const { Testimonials } = await import('@/components/home/Testimonials');
  return {
    default: (load: () => Promise<unknown>) => {
      const src = String(load);
      if (src.includes('HomeTrimCatalog')) return HomeTrimCatalog;
      if (src.includes('Testimonials')) return Testimonials;
      return HowItWorks;
    },
  };
});

import HomePage from '@/app/page';

afterEach(() => {
  catalog.lawsuits = [];
  catalog.error = false;
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const render = async () => renderToStaticMarkup(await HomePage());

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): { width: number; height: number } {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`not a WebP file (chunk ${chunk})`);
}

describe('home page redesign', () => {
  it('states who we are, not a law firm, and keeps the trust lines that are true', async () => {
    const html = await render();
    expect(html).toMatch(/not a law firm/i);
    expect(html).toContain('Lawsuit AI LLC');
    expect(html).toContain('We never handle settlement payments');
    expect(html).toContain('We never ask for your Social Security number or bank account details');
  });

  it('walks through three matching steps and says matching is free', async () => {
    const html = await render();
    for (const title of [
      'Answer a few questions',
      'See matched settlements',
      'File with our guide',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('Matching is free');
    expect(html).toContain('id="how-it-works"');
  });

  it('shows live catalog proof counters only when the catalog loaded', async () => {
    catalog.lawsuits = [
      makeLawsuit({ proof: 'no' }, { id: 'a', slug: 'a', deadline: '2099-01-10', typical_payout: '$25' }),
      makeLawsuit({ proof: 'yes' }, { id: 'b', slug: 'b', deadline: '2099-02-10', typical_payout: 'Varies' }),
    ];
    const ok = await render();
    expect(ok).toContain('Live catalog');
    expect(ok).toContain('open settlements taking claims right now');
    expect(ok).toContain('list a per-person payout amount in their own text');

    catalog.error = true;
    const failed = await render();
    expect(failed).not.toContain('open settlements taking claims right now');
    expect(failed).toContain('We couldn’t load settlements right now.');

    catalog.error = false;
    catalog.lawsuits = [];
    const empty = await render();
    expect(empty).not.toContain('open settlements taking claims right now');
  });

  it('uses the same open-to-file and 30-day counts for the payout line and stats strip', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T02:00:00Z')); // Still Nov 1 in New York.
    catalog.lawsuits = [
      makeLawsuit({}, { id: 'today', deadline: '2026-11-01', typical_payout: 'Varies' }),
      makeLawsuit({}, { id: 'boundary', deadline: '2026-12-01', typical_payout: 'Varies' }),
      makeLawsuit({}, { id: 'later', deadline: '2026-12-02', typical_payout: '$25' }),
      makeLawsuit({}, { id: 'undated', deadline: null, typical_payout: 'Varies' }),
    ];
    const html = await render();
    expect(html).toContain('4 open now');
    expect(html).toContain('2 settlements close in the next 30 days');
    expect(html).toMatch(/>open settlements taking claims(?: right now)?<\/dt>\s*<dd[^>]*>(?:<span[^>]*>)*4</);
    expect(html).toMatch(/>close in the next 30 days<\/dt>\s*<dd[^>]*>(?:<span[^>]*>)*2</);
    expect(html).toContain('4 settlements are taking claims right now.');
  });

  it.each(['', '1'])('shows non-affiliation next to featured listings (trim=%j)', async (trim) => {
    vi.stubEnv('HOME_HTML_TRIM_ENABLED', trim);
    catalog.lawsuits = [
      makeLawsuit({}, { id: 'closing', title: 'Closing Settlement', deadline: '2099-01-10' }),
      makeLawsuit({}, { id: 'top', title: 'Top Settlement', deadline: null, typical_payout: '$25' }),
    ];
    const html = await render();
    for (const [heading, title] of [['top-heading', 'Top Settlement'], ['open-heading', 'Closing Settlement']]) {
      const section = html.split(`aria-labelledby="${heading}"`)[1]?.split('</section>')[0];
      expect(section).toMatch(/not affiliated with the settlements listed here or their administrators/i);
      expect(section).toContain(title);
    }
  });

  it('lets visitors see matching settlements before an account', async () => {
    catalog.lawsuits = [makeLawsuit({}, { deadline: '2099-01-10' })];
    const html = await render();
    expect(html).toContain(HOME_HERO_PRIMARY_CTA);
    expect(html).toContain('href="/preview"');
    expect(html).toContain('Is Lawsuit AI legit?');
    expect(html).toContain('hello@lawsuitai.org');
    expect(html).not.toMatch(/15\s*%/);
    const matchAt = html.indexOf(HOME_HERO_PRIMARY_CTA);
    const browseAt = html.indexOf('See open settlements');
    expect(matchAt).toBeGreaterThan(-1);
    expect(browseAt).toBeGreaterThan(matchAt);
  });

  it('hides the testimonials section when there are no real reviews', async () => {
    const html = await render();
    expect(html).not.toContain('From people who used Lawsuit AI');
    expect(html).not.toContain('Sample reviews');
  });

  it('every screenshot it references exists, at the size the page declares', () => {
    const src = readFileSync(root('src/app/page.tsx'), 'utf8');
    const screens = [...src.matchAll(/src: '(\/screens\/[^']+\.webp)',\s*width: (\d+),\s*height: (\d+)/g)];
    expect(screens.length).toBeGreaterThanOrEqual(3);
    for (const [, file, width, height] of screens) {
      const path = root(`public${file}`);
      expect(existsSync(path), file).toBe(true);
      expect(webpSize(readFileSync(path)), file).toEqual({ width: Number(width), height: Number(height) });
    }
  });
});
