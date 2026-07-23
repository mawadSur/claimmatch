/* eslint-disable no-console */
/**
 * Run every registered scraper source and upsert results into `lawsuits`.
 *
 * Sources come from `SOURCE_ADAPTERS`: a real, operator-configured HTML source
 * (set `INGEST_SOURCE_URL` — and only after confirming that site's ToS/robots)
 * plus the offline-safe sample adapter, or just the sample when no real source
 * is configured. Every scraped row lands in `review_status='pending_review'`
 * (unless a human already published it), so nothing auto-publishes.
 *
 * Run: `npm run scrape`  (requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * NOTE: tsx executes this file directly, so the import uses a relative path
 * ('../src/lib/...') rather than the '@/' alias.
 */
import { runAllSources } from '../src/lib/scraper/index';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('\n[scrape] Missing required environment variables:');
    console.error(`  NEXT_PUBLIC_SUPABASE_URL   = ${url ? 'set' : 'MISSING'}`);
    console.error(`  SUPABASE_SERVICE_ROLE_KEY  = ${serviceKey ? 'set' : 'MISSING'}`);
    console.error('\nAdd them to .env.local (or your shell) and re-run: npm run scrape\n');
    process.exit(1);
    return;
  }

  const realSource = process.env.INGEST_SOURCE_URL?.trim();
  console.log('[scrape] Running all enabled sources…');
  console.log(
    realSource
      ? `  real source: ${realSource} (+ sample fallback)`
      : '  real source: none configured (INGEST_SOURCE_URL unset) — sample only',
  );

  const summary = await runAllSources();

  console.log('\n[scrape] Done.');
  console.log(`  inserted        : ${summary.inserted}`);
  console.log(`  updated         : ${summary.updated}`);
  console.log(`  pending_review  : ${summary.pending_review}`);
  console.log(`  published       : ${summary.published}`);
  console.log('  by source:');
  const entries = Object.entries(summary.bySource);
  if (entries.length === 0) {
    console.log('    (none)');
  } else {
    for (const [slug, count] of entries) {
      console.log(`    ${slug}: ${count}`);
    }
  }
  if (summary.pending_review > 0) {
    console.log(
      `\n  ${summary.pending_review} row(s) await human review before they go live.`,
    );
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('[scrape] Unexpected error:', err);
  process.exit(1);
});
