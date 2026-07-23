import type { LeadEvent, Partner, PartnerCategory } from './types';

/**
 * Pure, dependency-free partner/revenue logic. Kept separate from `partners.ts`
 * (which imports the server-only Supabase client) so it can be imported from
 * client components and unit-tested without pulling in `next/headers`.
 */

/** Default FTC-style disclosure shown when a partner sets none of its own. */
export const DEFAULT_PARTNER_DISCLOSURE =
  'Sponsored. ClaimMatch may earn a fee if you use this service — it’s paid by the partner and never comes out of your settlement.';

/** Format a whole-cents amount as USD (e.g. 4000 → "$40.00"). */
export function centsToUSD(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/**
 * Which partner categories fit a given settlement category, best first. Drives
 * contextual placements (e.g. a data-breach settlement → credit monitoring).
 */
export const CATEGORY_AFFINITY: Record<string, PartnerCategory[]> = {
  'Data Breach': ['credit', 'claims_service', 'law_firm'],
  Privacy: ['law_firm', 'credit', 'claims_service'],
  'Financial & Banking': ['financial', 'tax', 'claims_service'],
  'Auto & Vehicles': ['claims_service', 'law_firm'],
  'Health & Pharma': ['law_firm', 'claims_service'],
  Employment: ['law_firm', 'financial'],
  'Consumer Products': ['claims_service', 'general'],
  Technology: ['credit', 'law_firm'],
};

/**
 * Rank + trim a partner list for a placement. When a settlement category is
 * given, partners in an affine category rank first (best fit first); otherwise
 * partners keep their configured priority order. Pure — no I/O.
 */
export function rankPartnersForContext(
  partners: Partner[],
  opts: { lawsuitCategory?: string | null; limit?: number },
): Partner[] {
  const { lawsuitCategory, limit = 2 } = opts;
  const affinity = lawsuitCategory ? CATEGORY_AFFINITY[lawsuitCategory] : undefined;

  const scored = partners.map((p) => {
    let score = p.priority;
    if (affinity) {
      const rank = affinity.indexOf(p.category);
      if (rank >= 0) score += 1000 - rank * 100;
    }
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.p);
}

/**
 * Revenue we earn from a click, given the partner's payout model. per_lead and
 * hybrid accrue the lead fee immediately at click; per_conversion accrues
 * nothing until a conversion postback arrives.
 */
export function leadRevenueAtClick(
  partner: Pick<Partner, 'payout_model' | 'lead_fee_cents'>,
): number {
  return partner.payout_model === 'per_conversion' ? 0 : partner.lead_fee_cents;
}

/** Status to stamp on a lead event at click time, given the payout model. */
export function leadStatusAtClick(
  partner: Pick<Partner, 'payout_model'>,
): 'clicked' | 'lead' {
  return partner.payout_model === 'per_conversion' ? 'clicked' : 'lead';
}

export interface LeadSummary {
  clicks: number;
  leads: number;
  conversions: number;
  /** conversions / clicks, 0..1 */
  conversionRate: number;
  revenueCents: number;
  /** revenue for events already marked paid, in cents */
  paidCents: number;
  byPartner: Record<string, { clicks: number; conversions: number; revenueCents: number }>;
}

/**
 * Aggregate a set of lead events into headline revenue metrics. Pure so it can
 * be unit-tested and reused by the admin overview + partner table.
 */
export function summarizeLeadEvents(
  events: Pick<LeadEvent, 'partner_id' | 'status' | 'revenue_cents'>[],
): LeadSummary {
  const summary: LeadSummary = {
    clicks: events.length,
    leads: 0,
    conversions: 0,
    conversionRate: 0,
    revenueCents: 0,
    paidCents: 0,
    byPartner: {},
  };

  for (const e of events) {
    const converted = e.status === 'converted' || e.status === 'paid';
    if (e.status === 'lead' || converted) summary.leads += 1;
    if (converted) summary.conversions += 1;
    summary.revenueCents += e.revenue_cents;
    if (e.status === 'paid') summary.paidCents += e.revenue_cents;

    const bucket =
      summary.byPartner[e.partner_id] ??
      (summary.byPartner[e.partner_id] = { clicks: 0, conversions: 0, revenueCents: 0 });
    bucket.clicks += 1;
    if (converted) bucket.conversions += 1;
    bucket.revenueCents += e.revenue_cents;
  }

  summary.conversionRate = summary.clicks > 0 ? summary.conversions / summary.clicks : 0;
  return summary;
}
