import type { EligibilityCriteria, FeedStatus, ScrapedLawsuit } from '@/lib/types';
import { normalizeProof, withProof } from '@/lib/proof';
import type { SourceAdapter } from './index';

/**
 * SettleSignal open data adapter.
 *
 * Reads SettleSignal's public JSON feed of US class-action and consumer refund
 * settlements. The data is free under CC BY 4.0: every page showing a record
 * from this feed must credit "SettleSignal (settlesignal.com)" with a link.
 * See https://settlesignal.com/data/
 *
 * What the feed gives us per record: a SettleSignal page (`url`), the official
 * claim form (`official_claim_url`), the official settlement site
 * (`official_settlement_url`), a plain-English `status`, the deadline, a proof
 * rule and an evidence flag. It has no administrator field.
 *
 * Only records SettleSignal backs with official evidence are used. Records in
 * every status are returned (with `status` mapped below) so the ingest can
 * close or reopen rows it already has; the ingest only adds new rows that are
 * open for claims. Soft-fails to [] on any error. An empty or failed fetch
 * changes nothing (no miss increment, no absence close). After N consecutive
 * successful non-empty feeds, a source row still missing is closed.
 */

const FEED_URL = 'https://settlesignal.com/data/settlements.json';
const USER_AGENT = 'ClaimMatchBot/1.0 (+https://claimmatch.vercel.app)';
const FETCH_TIMEOUT_MS = 20_000;
const STALE_FEED_DAYS = 7;

interface SettleSignalRecord {
  '@id': string;
  title: string;
  url: string;
  category: string;
  settlement_type?: string;
  status: string;
  claim_deadline: string | null;
  proof_required: 'yes' | 'no' | 'optional' | 'unknown';
  applicable_states: string[];
  official_claim_url: string | null;
  official_settlement_url: string | null;
  estimated_payout: string | null;
  verification_status: string;
  accepted_official_evidence: boolean;
  last_verified: string;
}

interface SettleSignalFeed {
  settlements: SettleSignalRecord[];
  count: number;
  dateModified: string;
}

function mapCategory(category: string, settlementType?: string): string {
  const lower = (category || '').toLowerCase();
  const type = (settlementType || '').toLowerCase();

  if (lower.includes('data breach') || lower.includes('privacy')) return 'Privacy';
  if (lower.includes('healthcare') || lower.includes('pharma') || lower.includes('medical'))
    return 'Health & Pharma';
  if (lower.includes('employment') || lower.includes('wage') || lower.includes('labor'))
    return 'Employment';
  if (lower.includes('food') || lower.includes('beverage')) return 'Food & Beverage';
  if (lower.includes('auto') || lower.includes('vehicle')) return 'Auto & Vehicles';
  if (lower.includes('financial') || lower.includes('bank')) return 'Financial & Banking';
  if (lower.includes('tech') || type.includes('tech')) return 'Technology';
  if (lower.includes('consumer') || type.includes('consumer')) return 'Consumer Products';

  return 'General';
}

/**
 * SettleSignal's status mapped to ours. This default mapping is pending the
 * founder's review (Phase 0 item 6):
 * - open: "Open for claims".
 * - closed: "Claim window closed", "Closed", "Paid", "Payments started",
 *   "Payment pending" and "Automatic payment" (no claim form to file).
 * - unknown (leave our row as it is): "Published record", "Pending final
 *   approval" and any value we have not seen before.
 */
export function mapSettleSignalStatus(status: string | null | undefined): FeedStatus {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'open for claims':
      return 'open';
    case 'claim window closed':
    case 'closed':
    case 'paid':
    case 'payments started':
    case 'payment pending':
    case 'automatic payment':
      return 'closed';
    default:
      return 'unknown';
  }
}

/** An http(s) URL from the feed, or undefined. */
function webUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A YYYY-MM-DD deadline from the feed, or null. */
function feedDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(value.trim());
  return m ? m[0] : null;
}

function buildEligibility(record: SettleSignalRecord): EligibilityCriteria {
  const proof = normalizeProof(record.proof_required);
  const criteria: EligibilityCriteria = {};

  const states = Array.isArray(record.applicable_states)
    ? record.applicable_states.filter((s): s is string => typeof s === 'string' && !!s.trim())
    : [];
  if (states.length > 0) criteria.states = states;

  if (proof === 'optional') {
    criteria.notes = 'Proof of purchase is optional but may increase your claim amount.';
  } else if (proof === 'yes') {
    criteria.notes = 'Documentation or proof of purchase required to file a claim.';
  }

  return withProof(criteria, proof);
}

/** Stable row key, derived from the record's SettleSignal URL. Never change its format. */
export function settleSignalExternalId(id: string): string {
  return `settlesignal:${id.replace(/[^a-zA-Z0-9-]/g, '-').slice(-80)}`;
}

function isRecord(value: unknown): value is SettleSignalRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['@id'] === 'string' &&
    !!(r['@id'] as string).trim() &&
    typeof r.title === 'string' &&
    !!(r.title as string).trim() &&
    typeof r.status === 'string'
  );
}

/**
 * One feed record as a ScrapedLawsuit, or null when it is malformed or lacks
 * SettleSignal's official evidence.
 */
export function mapSettleSignalRecord(value: unknown): ScrapedLawsuit | null {
  if (!isRecord(value)) return null;
  const record = value;
  if (record.accepted_official_evidence !== true) return null;

  const title = record.title.trim();
  const payout =
    typeof record.estimated_payout === 'string' && record.estimated_payout.trim()
      ? record.estimated_payout.trim()
      : null;
  const states = buildEligibility(record).states ?? [];

  return {
    external_id: settleSignalExternalId(record['@id']),
    title,
    summary: payout ? `${title}. Estimated payout: ${payout}` : title,
    description: payout ?? undefined,
    category: mapCategory(record.category, record.settlement_type),
    typical_payout: payout ?? 'Varies',
    proof_required: normalizeProof(record.proof_required) === 'yes',
    deadline: feedDate(record.claim_deadline),
    eligibility: buildEligibility(record),
    eligibility_text: states.length
      ? `Residents of: ${states.join(', ')}`
      : 'Open to eligible US residents.',
    source_url: webUrl(record.url),
    claim_url: webUrl(record.official_claim_url) ?? webUrl(record.official_settlement_url),
    status: mapSettleSignalStatus(record.status),
  };
}

/** Map a parsed feed body; returns [] when it is not the expected shape. */
export function mapSettleSignalFeed(body: unknown): ScrapedLawsuit[] {
  const settlements = (body as Partial<SettleSignalFeed> | null)?.settlements;
  if (!Array.isArray(settlements)) return [];
  return settlements
    .map(mapSettleSignalRecord)
    .filter((item): item is ScrapedLawsuit => item !== null);
}

export const settleSignalAdapter: SourceAdapter = {
  slug: 'settlesignal',
  name: 'SettleSignal',
  homepage: 'https://settlesignal.com',

  async fetch(): Promise<ScrapedLawsuit[]> {
    try {
      const res = await fetch(FEED_URL, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        console.error(`[settlesignal] HTTP ${res.status}: ${res.statusText}`);
        return [];
      }

      const data = (await res.json()) as Partial<SettleSignalFeed>;
      if (!Array.isArray(data?.settlements)) {
        console.error('[settlesignal] Unexpected feed shape; nothing changed.');
        return [];
      }

      const modified = data.dateModified ? Date.parse(data.dateModified) : NaN;
      if (!Number.isNaN(modified)) {
        const ageDays = (Date.now() - modified) / 86_400_000;
        if (ageDays > STALE_FEED_DAYS) {
          console.warn(`[settlesignal] Feed last modified ${Math.floor(ageDays)} days ago.`);
        }
      }

      const items = mapSettleSignalFeed(data);
      const open = items.filter((i) => i.status === 'open').length;
      console.log(
        `[settlesignal] ${items.length} records with official evidence (${open} open) of ${data.settlements.length}`,
      );
      return items;
    } catch (err) {
      console.error('[settlesignal] Fetch failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },
};
