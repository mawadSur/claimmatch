import type { ScrapedLawsuit, EligibilityCriteria } from '@/lib/types';
import type { SourceAdapter } from './index';

/**
 * SettleSignal open data adapter.
 *
 * Fetches real settlement data from the SettleSignal public JSON feed, which
 * provides ~800+ verified US class-action and consumer refund settlements.
 *
 * Data is free under CC-BY 4.0 with attribution to SettleSignal.
 * See: https://settlesignal.com/data/
 *
 * The feed returns only settlements that have:
 * - "Open for claims" status (actively accepting claims)
 * - Verified evidence from official sources
 *
 * User-Agent identifies the bot politely. Soft-fails to [] on any error.
 */

const FEED_URL = 'https://settlesignal.com/data/settlements.json';
const USER_AGENT = 'ClaimMatchBot/1.0 (+https://claimmatch.vercel.app)';

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

function mapProofRequired(proof: string): boolean {
  return proof === 'yes';
}

function buildEligibility(record: SettleSignalRecord): EligibilityCriteria {
  const criteria: EligibilityCriteria = {};

  if (record.applicable_states && record.applicable_states.length > 0) {
    criteria.states = record.applicable_states;
  }

  if (record.proof_required === 'optional') {
    criteria.notes = 'Proof of purchase is optional but may increase your claim amount.';
  } else if (record.proof_required === 'yes') {
    criteria.notes = 'Documentation or proof of purchase required to file a claim.';
  }

  return criteria;
}

function mapRecord(record: SettleSignalRecord): ScrapedLawsuit | null {
  if (!record.title || !record['@id']) return null;

  if (record.status !== 'Open for claims') return null;

  const externalId = `settlesignal:${record['@id'].replace(/[^a-zA-Z0-9-]/g, '-').slice(-80)}`;

  return {
    external_id: externalId,
    title: record.title,
    summary: record.estimated_payout
      ? `${record.title}. Estimated payout: ${record.estimated_payout}`
      : record.title,
    description: record.estimated_payout || undefined,
    category: mapCategory(record.category, record.settlement_type),
    typical_payout: record.estimated_payout || 'Varies',
    proof_required: mapProofRequired(record.proof_required),
    deadline: record.claim_deadline || undefined,
    eligibility: buildEligibility(record),
    eligibility_text: record.applicable_states?.length
      ? `Residents of: ${record.applicable_states.join(', ')}`
      : 'Open to eligible US residents.',
    source_url: record.url,
    claim_url: record.official_claim_url || record.official_settlement_url || undefined,
  };
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
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        console.error(`[settlesignal] HTTP ${res.status}: ${res.statusText}`);
        return [];
      }

      const data: SettleSignalFeed = await res.json();

      if (!data.settlements || !Array.isArray(data.settlements)) {
        console.error('[settlesignal] Invalid feed structure');
        return [];
      }

      const items = data.settlements
        .filter((r) => r.accepted_official_evidence)
        .map(mapRecord)
        .filter((item): item is ScrapedLawsuit => item !== null);

      console.log(
        `[settlesignal] Fetched ${items.length} verified open settlements from ${data.count} total`,
      );
      return items;
    } catch (err) {
      console.error('[settlesignal] Fetch failed:', err);
      return [];
    }
  },
};
