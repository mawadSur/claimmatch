import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isPlaceholderPayout, isThinSettlement } from '@/lib/catalog-page';
import {
  catalogIndexing,
  listingUpdatedOn,
  SETTLEMENT_TITLE_MAX,
  settlementArticleJsonLd,
  settlementFaqs,
  settlementMetaTitle,
  settlementQuestionName,
  shortSettlementName,
  truncateAtWord,
} from '@/lib/settlement-seo';
import { settlementHowToJsonLd } from '@/lib/settlement-howto';
import { siteJsonLd } from '@/lib/site-jsonld';
import { LLMS_FULL_PATH, llmsSettlementBlock, renderLlmsFullTxt, renderLlmsTxt } from '@/lib/llms-txt';
import { AnswerBlock } from '@/components/settlement/AnswerBlock';
import { catalogLawsuit, makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@/lib/lawsuits');
  vi.resetModules();
});

describe('settlement titles stay within the SERP width', () => {
  it('shortens "Company - Topic Class Action Settlement" names without adding words', () => {
    expect(shortSettlementName('Fontaine Modification Company - Employee Wages Class Action Settlement')).toBe(
      'Fontaine Modification Company Employee Wages Settlement',
    );
    expect(shortSettlementName('Acme Class-Action Lawsuit')).toBe('Acme Lawsuit');
    expect(shortSettlementName('Welch')).toBe('Welch');
  });

  it('never exceeds SETTLEMENT_TITLE_MAX for long catalog names', () => {
    const titles = [
      'Fontaine Modification Company - Employee Wages Class Action Settlement',
      'ITS Technologies and Logistics - Biometric Privacy (Illinois) Class Action Settlement',
      'Dartmouth-Hitchcock $850,000 ERISA Class Action Settlement With A Very Long Name Indeed',
    ];
    for (const title of titles) {
      const out = settlementMetaTitle(
        makeLawsuit({}, { title, deadline: '2026-12-04', eligibility_text: 'Worked there in 2022.', typical_payout: '$100' }),
      );
      expect(out.length).toBeLessThanOrEqual(SETTLEMENT_TITLE_MAX);
      expect(out.length).toBeGreaterThan(20);
    }
  });

  it('keeps the richest suffix that fits and never names facts that are missing', () => {
    const short = makeLawsuit({}, {
      title: 'Acme Settlement',
      deadline: '2026-12-01',
      eligibility_text: 'Bought a Widget in 2023.',
      typical_payout: '$25',
    });
    expect(settlementMetaTitle(short)).toBe('Acme Settlement: Who Qualifies, Claim Deadline & Payout');
    const noRules = makeLawsuit({}, { title: 'Acme Settlement', deadline: '2026-12-01', eligibility_text: null, typical_payout: null });
    expect(settlementMetaTitle(noRules)).toBe('Acme Settlement: Claim Deadline');
    const undated = makeLawsuit({}, {
      title: 'Fontaine Modification Company - Employee Wages Class Action Settlement',
      deadline: null,
      eligibility_text: null,
      typical_payout: null,
    });
    expect(settlementMetaTitle(undated)).not.toMatch(/Deadline|Who Qualifies/);
  });

  it('truncates at a word boundary for short limits', () => {
    expect(truncateAtWord('alpha beta gamma delta epsilon zeta eta theta iota kappa lambda', 30)).toBe(
      'alpha beta gamma delta…',
    );
  });
});

describe('question wording', () => {
  it('adds "settlement" to bare case names', () => {
    expect(settlementQuestionName('Welch')).toBe('Welch settlement');
    expect(settlementQuestionName('Naro v. Walgreen Co.')).toBe('Naro v. Walgreen Co. settlement');
    expect(settlementQuestionName('Acme Data Breach Settlement')).toBe('Acme Data Breach Settlement');
    expect(settlementQuestionName('In re Widget Litigation')).toBe('In re Widget Litigation');
  });

  it('uses it in FAQ and HowTo structured data', () => {
    const lawsuit = makeLawsuit({}, { title: 'Welch', slug: 'welch' });
    const faqs = settlementFaqs(lawsuit);
    expect(faqs[0]?.q).toBe('Am I eligible for the Welch settlement?');
    expect(faqs.map((f) => f.q).join(' ')).not.toMatch(/the Welch\?/);
    expect(JSON.stringify(settlementHowToJsonLd(lawsuit, 'self_file'))).toContain('How to file a claim for the Welch settlement');
  });
});

describe('thin listings', () => {
  it('treats feed placeholder payouts as no payout', () => {
    expect(isPlaceholderPayout('Varies')).toBe(true);
    expect(isPlaceholderPayout(' varies. ')).toBe(true);
    expect(isPlaceholderPayout('TBD')).toBe(true);
    expect(isPlaceholderPayout(null)).toBe(true);
    expect(isPlaceholderPayout('Up to $40')).toBe(false);
    expect(isPlaceholderPayout('Varies by state, up to $500')).toBe(false);
  });

  it('a "Varies" payout alone does not make a listing indexable', () => {
    const row = { deadline: null, eligibility_text: null, administrator: null, typical_payout: 'Varies' };
    expect(isThinSettlement(row)).toBe(true);
    expect(isThinSettlement({ ...row, administrator: 'Angeion Group' })).toBe(false);
    expect(isThinSettlement({ ...row, typical_payout: '$50 per person' })).toBe(false);
  });
});

describe('catalog indexing rules', () => {
  it('indexes the unfiltered catalog and its pages', () => {
    expect(catalogIndexing({ page: 1 })).toEqual({ index: true, canonicalPath: null });
    expect(catalogIndexing({ page: 3 })).toEqual({ index: true, canonicalPath: null });
  });
  it('sends category-only views to the hub and noindexes search/filters', () => {
    expect(catalogIndexing({ category: 'Data Breach', page: 1 })).toEqual({
      index: true,
      canonicalPath: '/settlements/category/data-breach',
    });
    expect(catalogIndexing({ category: 'Data Breach', page: 2 }).index).toBe(false);
    expect(catalogIndexing({ q: 'fee', page: 1 }).index).toBe(false);
    expect(catalogIndexing({ hasDeadline: true, page: 1 }).index).toBe(false);
    expect(catalogIndexing({ openingSoon: true, page: 1 }).index).toBe(false);
  });
});

describe('site JSON-LD', () => {
  it('has Organization with legal name + square logo and WebSite with SearchAction', () => {
    const data = siteJsonLd();
    const [org, site] = data['@graph'];
    expect(org['@type']).toBe('Organization');
    expect(org.legalName).toBe('Lawsuit AI LLC');
    expect(org.logo.url).toMatch(/\/apple-icon$/);
    expect(site['@type']).toBe('WebSite');
    expect(site.publisher['@id']).toBe(org['@id']);
    expect(site.potentialAction['@type']).toBe('SearchAction');
    expect(site.potentialAction.target.urlTemplate).toMatch(/\/lawsuits\?q=\{search_term_string\}$/);
    expect(site.potentialAction['query-input']).toBe('required name=search_term_string');
  });

  it('settlement Article points at the same Organization @id', () => {
    const article = settlementArticleJsonLd(catalogLawsuit());
    expect(article.publisher['@id']).toBe(siteJsonLd()['@graph'][0]['@id']);
  });
});

describe('listing updated date', () => {
  it('uses the America/New_York calendar day', () => {
    // 03:00 UTC on Nov 27 is still Nov 26 in New York.
    expect(listingUpdatedOn('2026-11-27T03:00:00Z')).toEqual({ iso: '2026-11-26', label: 'Nov 26, 2026' });
    expect(listingUpdatedOn('2026-11-27T06:00:19.508331+00:00')?.iso).toBe('2026-11-27');
    expect(listingUpdatedOn(null)).toBeNull();
    expect(listingUpdatedOn('not a date')).toBeNull();
  });

  it('AnswerBlock shows the date and cites the official site', () => {
    const html = renderToStaticMarkup(
      AnswerBlock({
        facts: { qualifies: null, payout: '$10', deadline: null, proof: null, administrator: null, missing: [] },
        open: false,
        claimHref: '/claim/x',
        official: { href: 'https://www.example-settlement.com/', kind: 'official', label: 'Official site', host: 'example-settlement.com' },
        updatedOn: { iso: '2026-11-26', label: 'Nov 26, 2026' },
      }),
    );
    expect(html).toContain('<time dateTime="2026-11-26">Nov 26, 2026</time>');
    expect(html).toContain('Source: the official settlement site (example-settlement.com)');
  });
});

describe('/llms-full.txt', () => {
  const rows = [
    catalogLawsuit({ slug: 'later', title: 'Later Settlement', deadline: '2099-12-20', updated_at: '2026-11-27T06:00:00Z' }),
    catalogLawsuit({ slug: 'sooner', title: 'Sooner Settlement', deadline: '2099-12-01', administrator: 'Angeion Group' }),
    catalogLawsuit({
      slug: 'thin',
      title: 'Thin',
      deadline: null,
      eligibility_text: null,
      administrator: null,
      typical_payout: 'Varies',
    }),
    catalogLawsuit({
      slug: 'undated',
      title: 'Undated Settlement',
      deadline: null,
      typical_payout: '$5',
      claim_url: null,
      source_url: 'https://settlesignal.com/settlements/undated/',
    }),
  ];

  it('lists open non-thin rows, soonest deadline first, with only catalog facts', () => {
    const body = renderLlmsFullTxt(rows, new Date('2026-11-27T12:00:00Z'));
    expect(body.startsWith('# Lawsuit AI')).toBe(true);
    expect(body).toContain('Generated 2026-11-27. 3 open settlements');
    expect(body).not.toContain('## Thin');
    const sooner = body.indexOf('## Sooner Settlement');
    const later = body.indexOf('## Later Settlement');
    const undated = body.indexOf('## Undated Settlement');
    expect(sooner).toBeGreaterThan(0);
    expect(sooner).toBeLessThan(later);
    expect(later).toBeLessThan(undated);
    expect(body).toContain('- Page: https://');
    expect(body).toContain('/lawsuits/sooner');
    expect(body).toContain('- Administrator: Angeion Group');
    expect(body).not.toMatch(/testimonial|reviews?\b|stars/i);
  });

  it('only labels a link "Official claim site" when it is the official site', () => {
    const official = llmsSettlementBlock(rows[0]!);
    expect(official).toContain('- Official claim site: https://www.returnsettlement.com/submit-claim');
    const sourceOnly = llmsSettlementBlock(rows[3]!);
    expect(sourceOnly).not.toContain('Official claim site');
    expect(sourceOnly).not.toContain('- Claim deadline');
  });

  it('is linked from /llms.txt', () => {
    expect(renderLlmsTxt({ feeLine: 'x' })).toContain(LLMS_FULL_PATH);
  });

  it('route: 404 when the flag is off, 200 text when on', async () => {
    vi.stubEnv('LLMS_TXT_ENABLED', '');
    vi.resetModules();
    vi.doMock('@/lib/lawsuits', async (orig) => ({
      ...(await orig<typeof import('@/lib/lawsuits')>()),
      getLawsuits: async () => rows,
    }));
    let { GET } = await import('@/app/llms-full.txt/route');
    expect((await GET()).status).toBe(404);

    vi.stubEnv('LLMS_TXT_ENABLED', '1');
    vi.resetModules();
    ({ GET } = await import('@/app/llms-full.txt/route'));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toContain('## Sooner Settlement');
  });

  it('route: 503 when the catalog cannot be read', async () => {
    vi.stubEnv('LLMS_TXT_ENABLED', '1');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    vi.doMock('@/lib/lawsuits', async (orig) => ({
      ...(await orig<typeof import('@/lib/lawsuits')>()),
      getLawsuits: async () => {
        throw new Error('boom');
      },
    }));
    const { GET } = await import('@/app/llms-full.txt/route');
    const res = await GET();
    expect(res.status).toBe(503);
  });
});
