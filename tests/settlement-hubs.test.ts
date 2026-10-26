import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';
import { hubClosingSoon, hubNewest, newestUpdatedAt } from '@/lib/settlement-hubs';
import { makeLawsuit } from './helpers';

const db = vi.hoisted(() => ({
  calls: [] as [string, unknown[]][],
  list: { data: [] as unknown[] | null, error: null as { message: string } | null },
}));

vi.mock('@/lib/supabase/server', () => {
  function query() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'not', 'order', 'ilike', 'limit']) {
      q[m] = (...args: unknown[]) => {
        db.calls.push([m, args]);
        return q;
      };
    }
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(db.list).then(resolve, reject);
    return q;
  }
  const client = {
    from: (table: string) => {
      db.calls.push(['from', [table]]);
      return query();
    },
  };
  return {
    createClient: async () => client,
    createPublicClient: () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

import ClosingSoonHubPage from '@/app/settlements/closing-soon/page';
import NewSettlementsHubPage from '@/app/settlements/new/page';
import CategoryHubPage, { generateMetadata as categoryMeta } from '@/app/settlements/category/[slug]/page';
import sitemap from '@/app/sitemap';

function row(overrides: Partial<Lawsuit> = {}): Lawsuit {
  return makeLawsuit(
    { proof: 'optional' },
    {
      id: '1',
      slug: 'amazon-return-policy-settlement',
      title: 'Amazon Return Policy Settlement',
      category: 'Consumer Products',
      deadline: '2099-12-01',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      typical_payout: 'No fixed amount is stated.',
      ...overrides,
    },
  );
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  db.calls.length = 0;
  db.list = { data: [], error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hub ordering', () => {
  it('lists closing soon by nearest deadline and new by created_at', () => {
    const soon = row({ id: 'a', slug: 'a', title: 'A', deadline: '2026-11-01' });
    const later = row({ id: 'b', slug: 'b', title: 'B', deadline: '2026-12-01' });
    const undated = row({ id: 'c', slug: 'c', title: 'C', deadline: null });
    expect(hubClosingSoon([later, undated, soon]).map((l) => l.slug)).toEqual(['a', 'b']);

    const older = row({ id: 'old', slug: 'old', title: 'Old', created_at: '2026-01-01T00:00:00Z' });
    const newer = row({ id: 'new', slug: 'new', title: 'New', created_at: '2026-10-20T00:00:00Z' });
    expect(hubNewest([older, newer]).map((l) => l.slug)).toEqual(['new', 'old']);
  });

  it('reads lastmod from the newest updated_at', () => {
    const date = newestUpdatedAt([
      row({ updated_at: '2026-10-01T00:00:00Z' }),
      row({ updated_at: '2026-10-20T00:00:00Z' }),
    ]);
    expect(date?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(newestUpdatedAt([])).toBeNull();
  });
});

describe('hub pages', () => {
  it('closing-soon and new hubs list open rows and link the other hubs', async () => {
    db.list = {
      data: [
        row(),
        row({
          id: '2',
          slug: 'closed-one',
          title: 'Closed',
          status: 'closed',
          deadline: '2020-01-01',
        }),
      ],
      error: null,
    };

    const closing = renderToStaticMarkup(await ClosingSoonHubPage());
    expect(closing).toContain('Settlements closing soon');
    expect(closing).toContain('Amazon Return Policy Settlement');
    expect(closing).not.toContain('>Closed<');
    expect(closing).toContain('href="/settlements/new"');
    expect(closing).toContain('BreadcrumbList');
    expect(closing).toContain('CollectionPage');

    const newest = renderToStaticMarkup(await NewSettlementsHubPage());
    expect(newest).toContain('New settlements');
    expect(newest).toContain('Amazon Return Policy Settlement');
    expect(newest).toContain('href="/settlements/closing-soon"');
  });

  it('category hubs 404 unknown slugs and render known ones', async () => {
    db.list = { data: [row()], error: null };
    const html = renderToStaticMarkup(
      await CategoryHubPage({ params: Promise.resolve({ slug: 'consumer-products' }) }),
    );
    expect(html).toContain('Consumer Products settlements');
    expect(html).toContain('Amazon Return Policy Settlement');

    await expect(CategoryHubPage({ params: Promise.resolve({ slug: 'not-a-category' }) })).rejects.toThrow();
    const meta = await categoryMeta({ params: Promise.resolve({ slug: 'not-a-category' }) });
    expect(meta.robots).toMatchObject({ index: false });

    const emptyMeta = await categoryMeta({ params: Promise.resolve({ slug: 'data-breach' }) });
    expect(emptyMeta.robots).toMatchObject({ index: false, follow: true });
    const liveMeta = await categoryMeta({ params: Promise.resolve({ slug: 'consumer-products' }) });
    expect(liveMeta.robots).toMatchObject({ index: true, follow: true });
  });
});

describe('sitemap', () => {
  it('lists only open published rows, with lastmod, plus hubs', async () => {
    db.list = {
      data: [
        row(),
        row({ id: '2', slug: 'past', title: 'Past', deadline: '2020-01-01', status: 'closed' }),
      ],
      error: null,
    };
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/lawsuits/amazon-return-policy-settlement'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/lawsuits/past'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/settlements/closing-soon'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/settlements/new'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/settlements/category/consumer-products'))).toBe(true);
    const settlement = entries.find((e) => e.url.endsWith('/lawsuits/amazon-return-policy-settlement'));
    expect(settlement?.lastModified).toEqual(new Date('2026-10-10T00:00:00Z'));
  });

  it('omits hubs when there are no open settlements', async () => {
    db.list = { data: [], error: null };
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes('/settlements/'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/lawsuits'))).toBe(true);
  });

  it('exports hourly ISR as a numeric literal', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/app/sitemap.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/export const revalidate = 3600;/);
    expect(src).not.toMatch(/export const revalidate = [A-Z_]/);
  });
});
