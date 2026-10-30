import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { publicPageMetadata, SITE_OG_IMAGE, settlementOgImagePath } from '@/lib/site-metadata';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('public page metadata', () => {
  it('canonicalizes to lawsuitai.org and includes the site OG image', () => {
    const meta = publicPageMetadata({
      title: 'How it works',
      description: 'Find a settlement and file on the official site.',
      path: '/how-it-works',
    });
    expect(meta.alternates).toEqual({ canonical: 'https://lawsuitai.org/how-it-works' });
    expect(meta.openGraph?.images).toEqual([SITE_OG_IMAGE]);
    expect(meta.title).toBe('How it works');
    expect(settlementOgImagePath('acme-breach')).toBe('/lawsuits/acme-breach/opengraph-image');
  });

  it('does not put the home canonical on every page via the root layout', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('images: [SITE_OG_IMAGE]');
    expect(layout).not.toContain("canonical: canonicalUrl('/')");
    expect(layout).not.toContain('sameAs: []');
    const home = read('src/app/page.tsx');
    expect(home).toContain("path: '/'");
    expect(home).toContain('title: { absolute:');
  });

  it('keeps page titles free of a doubled ClaimMatch suffix', () => {
    for (const [file, unexpected] of [
      ['src/app/how-it-works/page.tsx', 'How ClaimMatch Works'],
      ['src/app/about/page.tsx', 'About ClaimMatch'],
      ['src/app/lawsuits/page.tsx', 'Open Class Action Settlements — ClaimMatch'],
      ['src/app/settlements/closing-soon/page.tsx', 'Settlements closing soon — ClaimMatch'],
    ] as const) {
      expect(read(file), file).not.toContain(unexpected);
    }
  });
});
