/**
 * Narrow catalog columns for the homepage when HOME_HTML_TRIM_ENABLED=1.
 * Omits long text (raw_source_text, eligibility_text, description, summary,
 * tags, form_field_order) that is not rendered on home cards.
 */
import type { Lawsuit } from '@/lib/types';

export const HOME_CATALOG_COLUMNS = [
  'id',
  'slug',
  'title',
  'category',
  'status',
  'review_status',
  'typical_payout',
  'payout_min',
  'payout_max',
  'proof_required',
  'deadline',
  'deadline_override',
  'eligibility',
  'claim_url',
  'source_url',
  'last_seen_at',
  'proof_verified',
  'verified_at',
  'verified_by',
  'eligibility_verified',
  'administrator',
  'claim_action_type',
  'claim_action',
  'is_test',
  'is_featured',
].join(', ');

export type HomeSettlementCard = Pick<
  Lawsuit,
  | 'id'
  | 'slug'
  | 'title'
  | 'category'
  | 'status'
  | 'review_status'
  | 'typical_payout'
  | 'payout_min'
  | 'payout_max'
  | 'proof_required'
  | 'deadline'
  | 'eligibility'
  | 'claim_url'
  | 'source_url'
  | 'last_seen_at'
  | 'proof_verified'
  | 'verified_at'
  | 'verified_by'
  | 'eligibility_verified'
  | 'administrator'
  | 'claim_action_type'
  | 'is_test'
  | 'is_featured'
> &
  Partial<Pick<Lawsuit, 'deadline_override' | 'claim_action'>> & {
    eligibility_text: string | null;
  };

const CARD_KEYS: Array<keyof HomeSettlementCard> = [
  'id',
  'slug',
  'title',
  'category',
  'status',
  'review_status',
  'typical_payout',
  'payout_min',
  'payout_max',
  'proof_required',
  'deadline',
  'deadline_override',
  'eligibility',
  'claim_url',
  'source_url',
  'last_seen_at',
  'proof_verified',
  'verified_at',
  'verified_by',
  'eligibility_verified',
  'administrator',
  'claim_action_type',
  'claim_action',
  'is_test',
  'is_featured',
];

export function slimHomeCard(row: Lawsuit | HomeSettlementCard): HomeSettlementCard {
  const out = {} as HomeSettlementCard;
  for (const key of CARD_KEYS) {
    const value = (row as HomeSettlementCard)[key];
    if (value !== undefined) (out as Record<string, unknown>)[key as string] = value;
  }
  out.eligibility_text = (row as { eligibility_text?: string | null }).eligibility_text ?? null;
  return out;
}

export function slimHomeCards(rows: Array<Lawsuit | HomeSettlementCard>): HomeSettlementCard[] {
  return rows.map(slimHomeCard);
}
