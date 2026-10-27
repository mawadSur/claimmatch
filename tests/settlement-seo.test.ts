import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeLawsuit } from './helpers';
import {
  breadcrumbJsonLd,
  categoryHubPath,
  categorySlug,
  faqJsonLd,
  lawsuitsInCategory,
  pageUrl,
  resolveCategoryName,
  settlementAnswerFacts,
  settlementArticleJsonLd,
  settlementFaqs,
  settlementMetaDescription,
  settlementMetaTitle,
  truncateAtWord,
} from '@/lib/settlement-seo';
import { GET as llmsTxt } from '@/app/llms.txt/route';

describe('settlement SEO helpers', () => {
  it('builds unique titles and descriptions from stored fields only', () => {
    const lawsuit = makeLawsuit(
      { proof: 'optional' },
      {
        title: 'Acme Data Breach Settlement',
        deadline: '2026-12-01',
        typical_payout: '$25–$150',
        eligibility_text: 'Anyone who got a breach notice from Acme in 2024.',
      },
    );
    expect(settlementMetaTitle(lawsuit)).toBe(
      'Acme Data Breach Settlement: Who Qualifies, Claim Deadline & Payout',
    );
    const description = settlementMetaDescription(lawsuit);
    expect(description).toContain('Acme Data Breach Settlement');
    expect(description).toContain('Dec 1, 2026');
    expect(description).toContain('$25–$150');
    expect(description).toContain('Optional');
    expect(description.length).toBeLessThanOrEqual(155);
  });

  it('does not invent a payout, administrator or eligibility rule', () => {
    const lawsuit = makeLawsuit(
      {},
      {
        title: 'Quiet Settlement',
        typical_payout: null,
        administrator: null,
        eligibility_text: 'Open to eligible US residents.',
        deadline: null,
      },
    );
    const facts = settlementAnswerFacts(lawsuit);
    expect(facts.payout).toBe('Not stated');
    expect(facts.administrator).toBeNull();
    expect(facts.qualifies).toBeNull();
    expect(facts.deadline).toBeNull();
    expect(facts.missing).toEqual(['who qualifies', 'deadline', 'administrator']);
    expect(settlementMetaTitle(lawsuit)).toBe('Quiet Settlement: Official Claim Link & What We Know');
    expect(settlementMetaDescription(lawsuit)).not.toMatch(/Who Qualifies|Claim deadline/i);

    const faqs = settlementFaqs(lawsuit);
    const text = faqs.map((f) => f.a).join(' ');
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/testimonial|review|stars/i);
    expect(text).toContain('does not state a payout');
    expect(text).toContain('does not name an administrator');
  });

  it('uses listing text when it is real, and frames it as unverified', () => {
    const lawsuit = makeLawsuit(
      { proof: 'yes' },
      {
        title: 'Widget Settlement',
        eligibility_text: 'People who bought a Widget in California in 2023.',
        administrator: 'Angeion Group',
        typical_payout: 'Up to $40',
        deadline: '2026-11-15',
      },
    );
    const facts = settlementAnswerFacts(lawsuit);
    expect(facts.qualifies).toBe('People who bought a Widget in California in 2023.');
    expect(facts.administrator).toBe('Angeion Group');
    expect(settlementFaqs(lawsuit).some((f) => f.a.includes('Angeion Group'))).toBe(true);
    expect(settlementFaqs(lawsuit).some((f) => f.a.includes('not the official rules'))).toBe(true);
  });

  it('emits FAQPage, BreadcrumbList and Article JSON-LD', () => {
    const lawsuit = makeLawsuit({}, { title: 'Widget Settlement', slug: 'widget-settlement' });
    const faq = faqJsonLd(settlementFaqs(lawsuit));
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(4);
    expect(faq.mainEntity[0]['@type']).toBe('Question');

    const crumbs = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Open settlements', path: '/lawsuits' },
      { name: 'Widget Settlement', path: '/lawsuits/widget-settlement' },
    ]);
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement).toHaveLength(3);

    const article = settlementArticleJsonLd(lawsuit);
    expect(article['@type']).toBe('Article');
    expect(article.about['@type']).toBe('Thing');
    expect(article.about.name).toBe('Widget Settlement');
  });

  it('maps category slugs and keeps unknown slugs unresolved', () => {
    expect(categorySlug('Data Breach')).toBe('data-breach');
    expect(categoryHubPath('Data Breach')).toBe('/settlements/category/data-breach');
    expect(resolveCategoryName('data-breach')).toBe('Data Breach');
    expect(resolveCategoryName('not-a-real-category')).toBeNull();
    expect(resolveCategoryName('custom-feed', ['Custom Feed'])).toBe('Custom Feed');
    expect(lawsuitsInCategory([makeLawsuit({}, { category: 'Data Breach' })], 'data-breach')).toHaveLength(1);
  });

  it('truncates descriptions on a word boundary', () => {
    expect(truncateAtWord('Short text', 155)).toBe('Short text');
    const long = 'word '.repeat(50).trim();
    const cut = truncateAtWord(long, 40);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(40);
  });

  it('builds canonical URLs from the site origin', () => {
    expect(pageUrl('/')).toMatch(/^https?:\/\//);
    expect(pageUrl('/lawsuits')).toMatch(/\/lawsuits$/);
  });
});

describe('llms.txt', () => {
  it('points crawlers at the settlement hubs', async () => {
    const res = llmsTxt();
    const body = await res.text();
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('/settlements/closing-soon');
    expect(body).toContain('/settlements/new');
    expect(body).toContain('/settlements/category/data-breach');
    expect(body).toContain('/lawsuits');
    expect(body).not.toMatch(/we file|you(?:'|’)re owed|15%/i);
  });
});

describe('settlement page source uses the safe JSON-LD helper', () => {
  it('does not stringify JSON-LD inline', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/app/lawsuits/[slug]/page.tsx', import.meta.url)), 'utf8');
    expect(src).toContain('faqJsonLd');
    expect(src).toContain('breadcrumbJsonLd');
    expect(src).toContain('settlementArticleJsonLd');
    expect(src).toContain('<JsonLd');
    expect(src).not.toContain('JSON.stringify');
  });
});

describe('ISR revalidate exports', () => {
  it('uses a 900s revalidate on the paginated /lawsuits list', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/app/lawsuits/page.tsx', import.meta.url)), 'utf8');
    expect(src).toMatch(/export const revalidate = 900;/);
  });

  it('uses a numeric literal on every SEO route', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const files = [
      '../src/app/lawsuits/[slug]/page.tsx',
      '../src/app/settlements/category/[slug]/page.tsx',
      '../src/app/settlements/closing-soon/page.tsx',
      '../src/app/settlements/new/page.tsx',
      '../src/app/llms.txt/route.ts',
      '../src/app/sitemap.ts',
    ];
    for (const rel of files) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(src, rel).toMatch(/export const revalidate = 3600;/);
      expect(src, rel).not.toMatch(/export const revalidate = [A-Za-z_]/);
    }
  });
});

describe('HubLinks', () => {
  it('internally links the hubs', async () => {
    const { HubLinks } = await import('@/components/settlement/HubLinks');
    const html = renderToStaticMarkup(
      createElement(HubLinks, { categories: ['Data Breach', 'Privacy'] }),
    );
    expect(html).toContain('href="/lawsuits"');
    expect(html).toContain('href="/settlements/closing-soon"');
    expect(html).toContain('href="/settlements/new"');
    expect(html).toContain('href="/settlements/category/data-breach"');
    expect(html).toContain('href="/settlements/category/privacy"');
  });
});
