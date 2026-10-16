import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';

// ---------------------------------------------------------------------------
// A fake Supabase client: records the query and returns canned rows.
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => ({
  calls: [] as [string, unknown[]][],
  list: { data: [] as unknown[] | null, error: null as { message: string } | null },
  single: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock('@/lib/supabase/server', () => {
  // A query: every filter returns itself; awaiting it yields db.list.
  function query() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'not', 'order', 'ilike', 'limit']) {
      q[m] = (...args: unknown[]) => {
        db.calls.push([m, args]);
        return q;
      };
    }
    q.maybeSingle = async () => db.single;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(db.list).then(resolve, reject);
    return q;
  }
  // The client itself must not be thenable, or `await createClient()` unwraps it.
  const client = {
    from: (table: string) => {
      db.calls.push(['from', [table]]);
      return query();
    },
  };
  return {
    createClient: async () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

import { lookupLawsuitBySlug, lookupLawsuits } from '@/lib/lawsuits';
import { LawsuitCard } from '@/components/LawsuitCard';
import LawsuitDetailPage, { generateMetadata } from '@/app/lawsuits/[slug]/page';
import LawsuitsPage from '@/app/lawsuits/page';

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
    eligibility: { proof: 'optional' },
    eligibility_text: 'Open to eligible US residents.',
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
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const BANNED = [
  /we file/i,
  /on your behalf/i,
  /receipt number/i,
  /no win,? no fee/i,
  /contingency/i,
  /15%/,
  /autopilot/i,
  /you(?:'|’)re owed/i,
  /ai matched/i,
  /matched \d+%/i,
  /bank-level/i,
];

function expectHonest(html: string) {
  for (const pattern of BANNED) expect(html).not.toMatch(pattern);
}

const page = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  db.calls.length = 0;
  db.list = { data: [], error: null };
  db.single = { data: null, error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('catalog queries', () => {
  it('ask the database only for rows open for claims', async () => {
    db.list = { data: [lawsuit()], error: null };
    const now = new Date('2026-10-16T08:00:00Z');
    const result = await lookupLawsuits(undefined, now);
    expect(result).toEqual({ lawsuits: [lawsuit()], error: false });

    const call = (name: string) => db.calls.filter(([m]) => m === name).map(([, a]) => a);
    expect(call('eq')).toContainEqual(['review_status', 'published']);
    expect(call('in')).toContainEqual(['status', ['open', 'closing_soon']]);
    expect(call('or')).toContainEqual(['deadline.is.null,deadline.gte.2026-10-15']);
    const not = call('not')[0];
    expect(not[0]).toBe('slug');
    expect(not[1]).toBe('in');
    expect(String(not[2])).toContain('robocall-tcpa-settlement');
    expect(String(not[2])).toContain('heartburn-medication-impurity-settlement');
  });

  it('drop rows that break the rule even if the database returns them', async () => {
    db.list = {
      data: [
        lawsuit({ slug: 'ok' }),
        lawsuit({ slug: 'robocall-tcpa-settlement' }),
        lawsuit({ slug: 'closed', status: 'closed' }),
        lawsuit({ slug: 'pending', review_status: 'pending_review' }),
        lawsuit({ slug: 'past', deadline: '2020-01-01' }),
      ],
      error: null,
    };
    const { lawsuits } = await lookupLawsuits();
    expect(lawsuits.map((l) => l.slug)).toEqual(['ok']);
  });

  it('report a failed query instead of falling back to sample data', async () => {
    db.list = { data: null, error: { message: 'boom' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await lookupLawsuits()).toEqual({ lawsuits: [], error: true });
  });

  it('return nothing, and no samples, when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(await lookupLawsuits()).toEqual({ lawsuits: [], error: false });
    expect(await lookupLawsuitBySlug('nationwide-data-breach-settlement')).toEqual({ status: 'missing' });
    expect(db.calls).toHaveLength(0);
  });

  it('treat fictional and unpublished settlements as missing', async () => {
    expect(await lookupLawsuitBySlug('robocall-tcpa-settlement')).toEqual({ status: 'missing' });
    expect(db.calls).toHaveLength(0);

    db.single = { data: lawsuit({ review_status: 'pending_review' }), error: null };
    expect(await lookupLawsuitBySlug('amazon-return-policy-settlement')).toEqual({ status: 'missing' });

    db.single = { data: lawsuit({ status: 'closed' }), error: null };
    expect((await lookupLawsuitBySlug('amazon-return-policy-settlement')).status).toBe('found');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.single = { data: null, error: { message: 'boom' } };
    expect(await lookupLawsuitBySlug('amazon-return-policy-settlement')).toEqual({ status: 'error' });
  });
});

describe('LawsuitCard', () => {
  const render = (props: Parameters<typeof LawsuitCard>[0]) =>
    renderToStaticMarkup(createElement(LawsuitCard, props));

  it('shows the D50 label, the official link and "Start your claim" while open', () => {
    const html = render({ lawsuit: lawsuit() });
    expect(html).toContain('Unverified: check the official site.');
    expect(html).toContain('href="https://www.returnsettlement.com/submit-claim"');
    expect(html).toContain('href="/claim/amazon-return-policy-settlement"');
    expect(html).toContain('Start your claim');
    expect(html).toContain('Optional');
    expectHonest(html);
  });

  it('shows "Claims closed" and no call to action when not open', () => {
    for (const l of [lawsuit({ status: 'closed' }), lawsuit({ deadline: '2020-01-01' })]) {
      const html = render({ lawsuit: l });
      expect(html).toContain('Claims closed');
      expect(html).not.toContain('Start your claim');
      expect(html).not.toContain('/claim/');
    }
  });

  it('says Unknown, not None, when proof is not recorded', () => {
    const html = render({ lawsuit: lawsuit({ eligibility: {}, proof_required: false }) });
    expect(html).toContain('Unknown');
    expect(html).not.toMatch(/>None</);
  });

  it('drops match scores and "Matched" badges', () => {
    const html = render({ lawsuit: lawsuit(), badge: { label: 'Matched 100%' } });
    expect(html).not.toContain('Matched');
    expect(html).not.toContain('100%');
    expect(html).toContain('Consumer Products');
    expect(render({ lawsuit: lawsuit(), badge: { label: 'AI Matched' } })).not.toContain('AI Matched');
    expect(render({ lawsuit: lawsuit(), badge: { label: 'Not filed yet' } })).toContain('Not filed yet');
  });

  it('labels a SettleSignal page as a listing when there is no official link', () => {
    const html = render({ lawsuit: lawsuit({ claim_url: null }) });
    expect(html).toContain('SettleSignal listing');
    expect(html).not.toContain('Official site');
  });
});

describe('settlement page', () => {
  it('shows an open settlement with the label, official link, CTA and SettleSignal credit', async () => {
    db.single = { data: lawsuit(), error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Open for claims');
    expect(html).toContain('Unverified: check the official site');
    expect(html).toContain('href="https://www.returnsettlement.com/submit-claim"');
    expect(html).toContain('href="/claim/amazon-return-policy-settlement"');
    expect(html).toContain('Start your claim');
    expect(html).toContain('CC BY 4.0');
    expect(html).toContain('SettleSignal (settlesignal.com)');
    expect(html).not.toContain('Claims closed');
    expectHonest(html);
  });

  it('shows a plain "Claims closed" state for a closed settlement', async () => {
    db.single = { data: lawsuit({ status: 'closed' }), error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Claims closed');
    expect(html).not.toContain('Open for claims');
    expect(html).not.toContain('Start your claim');
    expect(html).not.toContain('href="/claim/');
    expectHonest(html);

    const meta = await generateMetadata(page('amazon-return-policy-settlement'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  it('credits SettleSignal only on SettleSignal records', async () => {
    db.single = {
      data: lawsuit({ external_id: null, source_url: null, claim_url: 'https://www.court.gov/notice' }),
      error: null,
    };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).not.toContain('SettleSignal');
    expect(html).toContain('href="https://www.court.gov/notice"');
  });

  it('returns 404 for fictional settlements', async () => {
    await expect(LawsuitDetailPage(page('robocall-tcpa-settlement'))).rejects.toThrow();
    const meta = await generateMetadata(page('robocall-tcpa-settlement'));
    expect(meta.robots).toMatchObject({ index: false });
  });
});

describe('catalog page', () => {
  const searchParams = (p: Record<string, string>) => ({ searchParams: Promise.resolve(p) });

  it('lists open settlements with the D50 label and the SettleSignal credit', async () => {
    db.list = {
      data: [lawsuit(), lawsuit({ id: '2', slug: 'robocall-tcpa-settlement', title: 'Fake' })],
      error: null,
    };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({})));
    expect(html).toContain('Unverified: check the official site');
    expect(html).toContain('Showing 1 open settlement');
    expect(html).toContain('Amazon Return Policy Settlement');
    expect(html).not.toContain('Fake');
    expect(html).toContain('CC BY 4.0');
    expectHonest(html);
  });

  it('shows a clear empty state for a search with no results', async () => {
    db.list = { data: [lawsuit()], error: null };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({ q: 'zzz' })));
    expect(html).toContain('No open settlements match your search');
    expect(html).toContain('Clear filters');
  });

  it('shows an error state, not sample data, when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.list = { data: null, error: { message: 'boom' } };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({})));
    expect(html).toContain('We couldn’t load settlements right now');
    expect(html).not.toContain('Nationwide Data Breach');
  });
});
