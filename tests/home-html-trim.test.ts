import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags } from '@/lib/flags';
import { HOME_CATALOG_COLUMNS, slimHomeCard, slimHomeCards } from '@/lib/home-catalog';
import { catalogLawsuit, makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('HOME_HTML_TRIM_ENABLED', () => {
  it('defaults off', () => {
    expect(flags.homeHtmlTrim()).toBe(false);
    vi.stubEnv('HOME_HTML_TRIM_ENABLED', '1');
    expect(flags.homeHtmlTrim()).toBe(true);
  });

  it('omits long catalog text from the homepage column list', () => {
    expect(HOME_CATALOG_COLUMNS).toContain('id');
    expect(HOME_CATALOG_COLUMNS).toContain('slug');
    expect(HOME_CATALOG_COLUMNS).toContain('title');
    expect(HOME_CATALOG_COLUMNS).not.toContain('raw_source_text');
    expect(HOME_CATALOG_COLUMNS).not.toContain('description');
    expect(HOME_CATALOG_COLUMNS).not.toContain('form_field_order');
  });

  it('drops unused lawsuit fields from cards without changing title or slug', () => {
    const row = makeLawsuit(
      {},
      {
        id: 'card-1',
        slug: 'acme',
        title: 'Acme settlement',
        description: 'A very long description that must not ship in home HTML.',
      },
    );
    const slim = slimHomeCard(row);
    expect(slim.title).toBe('Acme settlement');
    expect(slim.slug).toBe('acme');
    expect((slim as { description?: string }).description).toBeUndefined();
  });

  it('ships catalog blocks as a client island when the flag is on, without changing SEO metadata', () => {
    const page = read('src/app/page.tsx');
    expect(page).toContain('flags.homeHtmlTrim()');
    expect(page).toContain('HomeTrimCatalog');
    expect(page).not.toContain('HOME_HTML_MEASURE_CARDS');
    expect(page).toContain("dynamic(() => import('@/components/home/HowItWorks')");
    expect(page).toContain("import('@/components/home/HomeTrimCatalog')");
    expect(page).toContain('HOME_CATALOG_COLUMNS');
    expect(page).toContain("path: '/'");
    expect(read('src/components/home/HomeTrimCatalog.tsx')).toContain("'use client'");
    expect(read('src/components/home/HomeTrimCatalog.tsx')).toContain('Biggest payouts still open');
    expect(read('src/components/home/HomeSettlementList.tsx')).not.toContain(
      "from '@/lib/settlement-guides'",
    );
    expect(read('src/components/settlement/ListingVerification.tsx')).not.toContain(
      "from '@/lib/settlement-guides'",
    );
  });

  it('serializes slimmer card payloads than a full catalog row', () => {
    const row = catalogLawsuit({
      description: 'A'.repeat(4000),
      raw_source_text: 'B'.repeat(8000),
      eligibility_text: 'C'.repeat(2000),
    });
    const full = JSON.stringify(row).length;
    const slim = JSON.stringify(slimHomeCards([row])[0]).length;
    expect(slim).toBeLessThan(full / 2);
  });
});
