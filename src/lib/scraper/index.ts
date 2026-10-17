import { ingestAndExtract, type IngestSummary } from './pipeline';

/**
 * Run every registered source. This used to be a second ingest path that
 * upserted rows straight into the catalog (publishing them through the column
 * default and reopening closed rows). It now runs the same fenced ingest as
 * the nightly cron, so both entry points follow the same rules: nothing is
 * published, published rows only take deadline and status changes, and a
 * missing record never closes anything. See ./pipeline.ts and ./plan.ts.
 *
 * Used by /api/cron/scrape and `npm run scrape`.
 */
export type RunSummary = IngestSummary;

export async function runAllSources(): Promise<RunSummary> {
  return ingestAndExtract();
}
