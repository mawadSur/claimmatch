/* eslint-disable no-console */
/**
 * Run the catalog ingest once against a LOCAL or STAGING database. Never
 * production (production runs it from the daily cron).
 *
 * Same rules as the cron (src/lib/scraper/pipeline.ts): new records wait for
 * review, published rows only take deadline and status changes, a past
 * deadline closes a row, and a feed-source row missing from N consecutive
 * successful non-empty feeds is closed. A failed or empty feed never closes
 * anyone for absence.
 *
 * --dry-run (or INGEST_DRY_RUN=1) plans the same writes and prints which
 * rows would close, then writes nothing.
 *
 * Refuses to run unless CLAIMMATCH_ENV is "local" or "staging", and always
 * refuses when the Supabase URL or service key belongs to production
 * (src/lib/scraper/env-guard.ts).
 *
 * Run: CLAIMMATCH_ENV=local npm run scrape
 *      CLAIMMATCH_ENV=local npm run scrape:dry-run
 *      (also needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * NOTE: tsx executes this file directly, so the imports use relative paths
 * ('../src/lib/...') rather than the '@/' alias.
 */
import { checkScriptTarget } from '../src/lib/scraper/env-guard';
import { runAllSources } from '../src/lib/scraper/index';

async function main(): Promise<void> {
  const target = checkScriptTarget(process.env);
  if (!target.ok) {
    console.error(`\n[scrape] Refusing to run: ${target.reason}\n`);
    process.exit(1);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('\n[scrape] Missing required environment variables:');
    console.error(`  NEXT_PUBLIC_SUPABASE_URL   = ${url ? 'set' : 'MISSING'}`);
    console.error(`  SUPABASE_SERVICE_ROLE_KEY  = ${serviceKey ? 'set' : 'MISSING'}`);
    console.error('\nAdd them to .env.local (or your shell) and re-run: CLAIMMATCH_ENV=local npm run scrape\n');
    process.exit(1);
    return;
  }

  const dryRun =
    process.argv.includes('--dry-run') ||
    process.env.INGEST_DRY_RUN === '1' ||
    process.env.INGEST_DRY_RUN === 'true';

  console.log(
    `[scrape] ${dryRun ? 'Dry-run: planning' : 'Running'} all enabled sources against the ${target.env} database…`,
  );
  const summary = await runAllSources({ dryRun });

  console.log(dryRun ? '\n[scrape] Dry-run complete (nothing written).' : '\n[scrape] Done.');
  console.log(`  feed records read      : ${summary.ingested}`);
  console.log(`  new rows for review    : ${summary.inserted}`);
  console.log(`  rows updated           : ${summary.updated}`);
  console.log(`  closed / reopened      : ${summary.closed} / ${summary.reopened}`);
  console.log(`  closed by deadline     : ${summary.closedByDeadline}`);
  console.log(`  closed by missing feed : ${summary.closedByMissingFeed}`);
  console.log(`  deadline changes       : ${summary.deadlineChanges}`);
  console.log(`  flagged for review     : ${summary.flagged}`);
  console.log(`  closures held (breaker): ${summary.held}`);
  console.log(`  miss increments (open) : ${summary.wouldIncrementMiss.length}`);
  console.log(`  failures               : ${summary.failed}`);
  if (summary.emptySources.length) {
    console.log(`  sources with no records: ${summary.emptySources.join(', ')}`);
  }
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
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[scrape] Unexpected error:', err);
  process.exit(1);
});
