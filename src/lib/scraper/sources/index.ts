import type { ScrapedLawsuit } from '@/lib/types';
import { sampleAggregatorAdapter } from './sample-source';
import { settleSignalAdapter } from './settlesignal';

/**
 * A `SourceAdapter` knows how to pull settlement/lawsuit listings from ONE
 * upstream source and normalize them into {@link ScrapedLawsuit} records. The
 * scraper runner ({@link ../index.runAllSources}) walks every registered
 * adapter, upserts a matching `sources` row, and persists the results into the
 * `lawsuits` table keyed by `(source_id, external_id)`.
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
 * The registry the runner iterates.
 *
 * Production adapters:
 * - settleSignalAdapter: pulls ~800+ verified settlements from SettleSignal's
 *   public CC-BY JSON feed (https://settlesignal.com/data/).
 *
 * Offline/test adapters:
 * - sampleAggregatorAdapter: deterministic sample data for tests/seeding.
 */
export const SOURCE_ADAPTERS: SourceAdapter[] = [
  settleSignalAdapter,
  sampleAggregatorAdapter,
];
