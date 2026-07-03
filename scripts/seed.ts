/* eslint-disable no-console */
/**
 * Seed the `lawsuits` table.
 *
 * Uses the raw @supabase/supabase-js client (no cookies in a script context) and
 * the SERVICE ROLE key so it can write past RLS. Combines the static sample
 * catalog with the sample scraper adapter's records and upserts them by slug.
 *
 * Run: `npm run seed`  (requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * NOTE: tsx executes this file directly, so imports use relative paths
 * ('../src/lib/...') rather than the '@/' alias.
 */
import { createClient } from '@supabase/supabase-js';
import { SAMPLE_LAWSUITS } from '../src/lib/sample-data';
import { slugify } from '../src/lib/utils';
import { sampleAggregatorAdapter } from '../src/lib/scraper/sources/sample-source';
import type {
  EligibilityCriteria,
  LawsuitStatus,
  ScrapedLawsuit,
} from '../src/lib/types';

/** The subset of `lawsuits` columns we write from a seed (id/timestamps are DB-generated). */
interface LawsuitRow {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: string;
  status: LawsuitStatus;
  typical_payout: string | null;
  proof_required: boolean;
  deadline: string | null;
  eligibility: EligibilityCriteria;
  eligibility_text: string | null;
  source_url: string | null;
  claim_url: string | null;
  external_id: string | null;
  is_featured: boolean;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('\n[seed] Missing required environment variables:');
    console.error(`  NEXT_PUBLIC_SUPABASE_URL   = ${url ? 'set' : 'MISSING'}`);
    console.error(`  SUPABASE_SERVICE_ROLE_KEY  = ${serviceKey ? 'set' : 'MISSING'}`);
    console.error('\nAdd them to .env.local (or your shell) and re-run: npm run seed\n');
    process.exit(1);
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Static sample catalog → rows (drop synthetic id / timestamps).
  const sampleRows: LawsuitRow[] = SAMPLE_LAWSUITS.map((l) => ({
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    description: l.description,
    category: l.category,
    status: l.status,
    typical_payout: l.typical_payout,
    proof_required: l.proof_required,
    deadline: l.deadline,
    eligibility: l.eligibility,
    eligibility_text: l.eligibility_text,
    source_url: l.source_url,
    claim_url: l.claim_url,
    external_id: null,
    is_featured: l.is_featured,
  }));

  // 2) Sample scraper adapter → rows.
  const scraped: ScrapedLawsuit[] = await sampleAggregatorAdapter.fetch();
  const scrapedRows: LawsuitRow[] = scraped.map((item) => ({
    slug: slugify(item.title),
    title: item.title,
    summary: item.summary ?? null,
    description: item.description ?? null,
    category: item.category ?? 'General',
    status: 'open',
    typical_payout: item.typical_payout ?? 'Varies',
    proof_required: item.proof_required ?? false,
    deadline: item.deadline ?? null,
    eligibility: item.eligibility ?? {},
    eligibility_text: item.eligibility_text ?? null,
    source_url: item.source_url ?? null,
    claim_url: item.claim_url ?? null,
    external_id: item.external_id,
    is_featured: false,
  }));

  // 3) Merge + dedupe by slug (last wins) so onConflict has unique targets.
  const bySlug = new Map<string, LawsuitRow>();
  for (const row of [...sampleRows, ...scrapedRows]) bySlug.set(row.slug, row);
  const rows = [...bySlug.values()];

  // Report how many are new vs. already present.
  const slugs = rows.map((r) => r.slug);
  const { data: existing } = await supabase
    .from('lawsuits')
    .select('slug')
    .in('slug', slugs);
  const existingSlugs = new Set(
    (existing ?? []).map((r: { slug: string }) => r.slug),
  );

  const { error } = await supabase
    .from('lawsuits')
    .upsert(rows, { onConflict: 'slug' });

  if (error) {
    console.error('[seed] Upsert failed:', error.message);
    process.exit(1);
    return;
  }

  const inserted = slugs.filter((s) => !existingSlugs.has(s)).length;

  console.log('\n[seed] Done.');
  console.log(`  lawsuits upserted  : ${rows.length}`);
  console.log(`  inserted (new)     : ${inserted}`);
  console.log(`  updated (existing) : ${rows.length - inserted}`);
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Unexpected error:', err);
  process.exit(1);
});
