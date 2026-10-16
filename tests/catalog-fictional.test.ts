import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FICTIONAL_SLUGS,
  SAMPLE_ADAPTER_FICTIONAL_SLUGS,
  SEED_FICTIONAL_SLUGS,
  isFictionalSlug,
} from '@/lib/fictional-slugs';
import { sampleAggregatorAdapter } from '@/lib/scraper/sources/sample-source';
import { slugify } from '@/lib/utils';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

/** Slugs of the rows a seed file inserts into public.lawsuits. */
function seededLawsuitSlugs(sql: string): string[] {
  const at = sql.search(/insert\s+into\s+public\.lawsuits/i);
  if (at < 0) return [];
  return Array.from(sql.slice(at).matchAll(/\(\s*\n\s*'([a-z0-9-]+)',/g), (m) => m[1]);
}

describe('fictional settlement denylist', () => {
  it('lists exactly 22 distinct slugs', () => {
    expect(FICTIONAL_SLUGS).toHaveLength(22);
    expect(new Set(FICTIONAL_SLUGS).size).toBe(22);
  });

  it('matches the 16 rows in supabase/seed.dev.sql', () => {
    const slugs = seededLawsuitSlugs(read('supabase/seed.dev.sql'));
    expect(slugs).toHaveLength(16);
    expect([...slugs].sort()).toEqual([...SEED_FICTIONAL_SLUGS].sort());
  });

  it('matches the 6 records the sample-aggregator adapter produces', async () => {
    const records = await sampleAggregatorAdapter.fetch();
    expect(records.map((r) => slugify(r.title)).sort()).toEqual(
      [...SAMPLE_ADAPTER_FICTIONAL_SLUGS].sort(),
    );
  });

  it('leaves supabase/seed.sql with no settlement or source rows', () => {
    const sql = read('supabase/seed.sql');
    expect(sql).not.toMatch(/insert\s+into/i);
    for (const slug of FICTIONAL_SLUGS) expect(sql).not.toContain(slug);
  });

  it('is covered by migration 0005, by slug and by sample external_id', async () => {
    const sql = read('supabase/migrations/0005_unpublish_fictional.sql');
    for (const slug of FICTIONAL_SLUGS) expect(sql).toContain(`'${slug}'`);
    for (const record of await sampleAggregatorAdapter.fetch()) {
      expect(sql).toContain(`'${record.external_id}'`);
    }
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it('keeps the settlement page able to send a real 404', () => {
    // A loading.tsx at or above /lawsuits/[slug] wraps the page in Suspense, so
    // the response starts streaming as 200 before notFound() runs (a soft 404).
    for (const path of ['src/app/lawsuits/loading.tsx', 'src/app/lawsuits/[slug]/loading.tsx']) {
      expect(existsSync(`${root}/${path}`)).toBe(false);
    }
  });

  it('recognises fictional slugs and nothing else', () => {
    expect(isFictionalSlug('robocall-tcpa-settlement')).toBe(true);
    expect(isFictionalSlug(' Heartburn-Medication-Impurity-Settlement ')).toBe(true);
    expect(isFictionalSlug('amazon-return-policy-settlement')).toBe(false);
    expect(isFictionalSlug('')).toBe(false);
    expect(isFictionalSlug(null)).toBe(false);
    expect(isFictionalSlug(undefined)).toBe(false);
  });
});

describe('sample data never reaches production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('registers the sample adapter only when the flag is on outside production', async () => {
    vi.stubEnv('ENABLE_SAMPLE_SOURCE', '');
    vi.stubEnv('NODE_ENV', 'development');
    const { getSourceAdapters } = await import('@/lib/scraper/sources');
    expect(getSourceAdapters().map((a) => a.slug)).toEqual(['settlesignal']);

    vi.stubEnv('ENABLE_SAMPLE_SOURCE', '1');
    expect(getSourceAdapters().map((a) => a.slug)).toEqual(['settlesignal', 'sample-aggregator']);

    vi.stubEnv('NODE_ENV', 'production');
    expect(getSourceAdapters().map((a) => a.slug)).toEqual(['settlesignal']);
  });

  it('keeps the always-on registry free of the sample adapter', async () => {
    const { SOURCE_ADAPTERS } = await import('@/lib/scraper/sources');
    expect(SOURCE_ADAPTERS.map((a) => a.slug)).not.toContain('sample-aggregator');
  });

  it('empties SAMPLE_LAWSUITS in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { SAMPLE_LAWSUITS } = await import('@/lib/sample-data');
    expect(SAMPLE_LAWSUITS).toEqual([]);
  });

  it('has no SAMPLE_LAWSUITS fallback in the catalog or the matches route', () => {
    for (const path of ['src/lib/lawsuits.ts', 'src/app/api/matches/route.ts']) {
      const code = read(path);
      expect(code).not.toContain('sample-data');
      expect(code).not.toContain('SAMPLE_LAWSUITS');
    }
  });
});
