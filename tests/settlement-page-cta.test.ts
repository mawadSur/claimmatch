import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';
import { faqJsonLd, breadcrumbJsonLd, settlementFaqs } from '@/lib/settlement-seo';
import { jsonLd } from '@/lib/jsonld';
import { makeLawsuit } from './helpers';

const db = vi.hoisted(() => ({
  list: { data: [] as unknown[] | null, error: null as { message: string } | null },
  single: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => null,
}));

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: () => undefined }),
}));

vi.mock('@/lib/supabase/server', () => {
  function query() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'not', 'order', 'ilike', 'limit']) {
      q[m] = () => q;
    }
    q.maybeSingle = async () => db.single;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(db.list).then(resolve, reject);
    return q;
  }
  const client = { from: () => query() };
  return {
    createClient: async () => client,
    createPublicClient: () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

import LawsuitDetailPage from '@/app/lawsuits/[slug]/page';
import { parseSettlementScopeSlug, scopedPreviewQuestions, settlementPreviewPath } from '@/lib/match-preview';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  db.single = { data: null, error: null };
  db.list = { data: [], error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function lawsuit(overrides: Partial<Lawsuit> = {}): Lawsuit {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'amazon-return-policy-settlement',
    title: 'Amazon Return Policy Settlement',
    summary: 'Amazon Return Policy Settlement. Estimated payout: No fixed amount is stated.',
    description: 'No fixed amount is stated.',
    category: 'Consumer Products',
    status: 'open',
    typical_payout: 'No fixed amount is stated.',
    payout_min: null,
    payout_max: null,
    proof_required: false,
    deadline: '2099-12-01',
    eligibility: { proof: 'optional', requires: ['bought_consumer_goods'], states: ['CA'] },
    eligibility_text: 'Anyone who returned an item to Amazon in 2023.',
    source_id: null,
    source_url: 'https://settlesignal.com/settlements/amazon-return-policy-settlement/',
    claim_url: 'https://www.returnsettlement.com/submit-claim',
    external_id: 'settlesignal:amazon',
    hero_image_url: null,
    is_featured: false,
    review_status: 'published',
    extraction_confidence: null,
    administrator: null,
    raw_source_text: null,
    estimated_value_min: null,
    estimated_value_max: null,
    reviewed_by: null,
    reviewed_at: null,
    last_seen_at: null,
    missed_feed_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Lawsuit;
}

function page(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function renderDetail(row: Lawsuit) {
  db.single = { data: row, error: null };
  db.list = { data: [row], error: null };
  return renderToStaticMarkup(await LawsuitDetailPage(page(row.slug)));
}

describe('settlement page CTA flag', () => {
  it('keeps today’s /claim CTAs when the flag is off', async () => {
    const html = await renderDetail(lawsuit());
    expect(html).toContain('href="/claim/amazon-return-policy-settlement"');
    expect(html).toContain('Check if you qualify');
    expect(html).toContain('Start your claim');
    expect(html).not.toContain('/preview?settlement=');
    expect(html).not.toContain('Related open settlements');
    expect(html).not.toContain('settlement_cta_viewed');
  });

  it('points the existing qualify CTA at a scoped preview when the flag is on', async () => {
    vi.stubEnv('SETTLEMENT_PAGE_CTA_ENABLED', '1');
    const html = await renderDetail(lawsuit());
    expect(html).toContain('/preview?settlement=amazon-return-policy-settlement');
    expect(html).toContain('Check if you qualify');
    expect(html).toContain('href="/claim/amazon-return-policy-settlement"');
    expect(html).not.toMatch(/\$50,000 people|testimonials/i);
  });

  it('never shows the qualify preview CTA on a closed settlement', async () => {
    vi.stubEnv('SETTLEMENT_PAGE_CTA_ENABLED', '1');
    const html = await renderDetail(lawsuit({ status: 'closed' }));
    expect(html).toContain('Claims closed');
    expect(html).not.toContain('/preview?settlement=');
    expect(html).not.toContain('href="/claim/');
  });
});

describe('related settlements flag', () => {
  it('stays hidden when the flag is off', async () => {
    db.list = {
      data: [
        lawsuit(),
        lawsuit({
          id: '2',
          slug: 'other-consumer',
          title: 'Other Consumer Settlement',
          category: 'Consumer Products',
          eligibility_text: 'People who bought a widget.',
        }),
      ],
      error: null,
    };
    const html = await renderDetail(lawsuit());
    expect(html).not.toContain('Related open settlements');
    expect(html).not.toContain('href="/lawsuits/other-consumer"');
  });

  it('lists other open published settlements when the flag is on', async () => {
    vi.stubEnv('RELATED_SETTLEMENTS_ENABLED', '1');
    const current = lawsuit();
    const other = lawsuit({
      id: '2',
      slug: 'other-consumer',
      title: 'Other Consumer Settlement',
      category: 'Consumer Products',
      eligibility_text: 'People who bought a widget.',
      deadline: '2099-11-01',
    });
    db.single = { data: current, error: null };
    db.list = { data: [current, other], error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page(current.slug)));
    expect(html).toContain('Related open settlements');
    expect(html).toContain('href="/lawsuits/other-consumer"');
    expect(html).toContain('Other Consumer Settlement');
  });
});

describe('settlement JSON-LD', () => {
  it('emits valid BreadcrumbList and FAQPage objects from catalog fields only', () => {
    const row = makeLawsuit(
      {},
      {
        title: 'Widget Settlement',
        slug: 'widget-settlement',
        eligibility_text: 'People who bought a Widget in 2023.',
        deadline: '2026-12-01',
      },
    );
    const faq = faqJsonLd(settlementFaqs(row));
    const crumbs = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Open settlements', path: '/lawsuits' },
      { name: row.title, path: `/lawsuits/${row.slug}` },
    ]);
    expect(faq['@type']).toBe('FAQPage');
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(() => JSON.parse(jsonLd(faq))).not.toThrow();
    expect(() => JSON.parse(jsonLd(crumbs))).not.toThrow();
    const parsed = JSON.parse(jsonLd(faq)) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    const text = parsed.mainEntity.map((item) => item.acceptedAnswer.text).join(' ');
    expect(text).toContain('People who bought a Widget in 2023.');
    expect(text).not.toMatch(/you qualify for this|testimonial/i);
  });

  it('renders those JSON-LD types on the settlement page', async () => {
    const html = await renderDetail(lawsuit());
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('application/ld+json');
  });
});

describe('scoped preview helpers', () => {
  it('asks only catalog matcher keys for a scoped settlement', () => {
    const questions = scopedPreviewQuestions({
      states: ['CA'],
      requires: ['bought_consumer_goods', 'took_medication'],
    });
    expect(questions.map((q) => q.key)).toEqual(['state', 'bought_consumer_goods']);
    expect(settlementPreviewPath('amazon-return-policy-settlement')).toBe(
      '/preview?settlement=amazon-return-policy-settlement',
    );
    expect(parseSettlementScopeSlug('../evil')).toBeNull();
  });
});
