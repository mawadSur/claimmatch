import type { ScrapedLawsuit } from '@/lib/types';
import { flags } from '@/lib/flags';
import { sampleAggregatorAdapter } from './sample-source';
import { settleSignalAdapter } from './settlesignal';

/**
 * A `SourceAdapter` knows how to pull settlement/lawsuit listings from ONE
 * upstream source and normalize them into {@link ScrapedLawsuit} records. The
 * ingest ({@link ../pipeline.ingestAndExtract}) walks every registered adapter,
 * ensures a matching `sources` row, and reconciles the results with the
 * `lawsuits` table keyed by `external_id`. New rows always wait for human
 * review; see pipeline.ts for what a refresh may change on published rows.
 *
 * ── How to add a REAL source ────────────────────────────────────────────────
 * 1. Create a sibling file `src/lib/scraper/sources/<slug>.ts`.
 * 2. Export a `SourceAdapter`. The quickest path is the generic template:
 *
 *        import { makeHtmlAdapter } from './generic-html';
 *        export const topClassActions = makeHtmlAdapter({
 *          slug: 'top-class-actions',
 *          name: 'Top Class Actions',
 *          homepage: 'https://topclassactions.com',
 *          listUrl: 'https://topclassactions.com/lawsuit-settlements/open-settlements/',
 *        });
 *
 *    For anything non-trivial, hand-write `fetch()`:
 *      a. `const res = await fetch(listUrl)` and `const html = await res.text()`.
 *      b. Parse the listing page with a DOM parser or regex to pull each
 *         settlement's title, URL, payout, deadline, and "who qualifies" copy.
 *      c. Map every extracted item onto the `ScrapedLawsuit` shape, choosing a
 *         `category` from `LAWSUIT_CATEGORIES` and expressing eligibility with
 *         the attribute keys defined in `@/lib/eligibility`.
 *      d. Set a STABLE `external_id` (e.g. `"<slug>:<hash-of-canonical-url>"`)
 *         so re-runs dedupe/update the same row instead of creating duplicates.
 *      e. Always fail soft — return `[]` on network/parse errors, never throw.
 *      f. If the source states a claim status, map it to `status`
 *         ('open' | 'closed' | 'unknown'); leave it undefined otherwise.
 * 3. Register the adapter in `SOURCE_ADAPTERS` below.
 *
 * ⚠️  Production adapters MUST respect each source's robots.txt and Terms of
 *     Service, identify themselves with a descriptive User-Agent, and rate-limit
 *     requests. Prefer official RSS/JSON feeds or licensed data over scraping.
 */
export interface SourceAdapter {
  /** Stable unique key; also stored as `sources.slug`. */
  slug: string;
  /** Human-readable source name; stored as `sources.name`. */
  name: string;
  /** Optional canonical homepage; stored as `sources.homepage_url`. */
  homepage?: string;
  /** Fetch + normalize the source's current listings. Never throws. */
  fetch(): Promise<ScrapedLawsuit[]>;
}

/**
 * Adapters that may run in every environment, production included:
 * - settleSignalAdapter: SettleSignal's public JSON feed
 *   (https://settlesignal.com/data/), CC BY 4.0 with attribution.
 */
export const SOURCE_ADAPTERS: SourceAdapter[] = [settleSignalAdapter];

/**
 * The adapters the ingest runs right now. The sample-aggregator adapter makes
 * up settlements, so it is added only when flags.sampleSource() is on, which
 * requires ENABLE_SAMPLE_SOURCE=1 and is never true in production.
 */
export function getSourceAdapters(): SourceAdapter[] {
  return flags.sampleSource()
    ? [...SOURCE_ADAPTERS, sampleAggregatorAdapter]
    : [...SOURCE_ADAPTERS];
}
