/* eslint-disable no-console */
/**
 * Run every registered scraper source and upsert results into `lawsuits`.
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

  console.log('[scrape] Running all enabled sources…');
  const summary = await runAllSources();

  console.log('\n[scrape] Done.');
  console.log(`  inserted : ${summary.inserted}`);
  console.log(`  updated  : ${summary.updated}`);
  console.log('  by source:');
  const entries = Object.entries(summary.bySource);
  if (entries.length === 0) {
    console.log('    (none)');
  } else {
    for (const [slug, count] of entries) {
      console.log(`    ${slug}: ${count}`);
    }
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('[scrape] Unexpected error:', err);
  process.exit(1);
});
