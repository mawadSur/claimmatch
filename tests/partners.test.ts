import { describe, it, expect } from 'vitest';
import {
  leadRevenueAtClick,
  leadStatusAtClick,
  summarizeLeadEvents,
  rankPartnersForContext,
  centsToUSD,
} from '@/lib/partners-core';
import type { LeadEvent, Partner, PayoutModel } from '@/lib/types';

function mkPartner(over: Partial<Partner> = {}): Partner {
  return {
    id: over.id ?? 'p1',
    slug: over.slug ?? 'p1',
    name: over.name ?? 'Partner One',
    category: over.category ?? 'general',
    tagline: null,
    description: null,
    url: 'https://example.com',
    logo_url: null,
    payout_model: over.payout_model ?? 'per_lead',
    lead_fee_cents: over.lead_fee_cents ?? 0,
    conversion_fee_cents: over.conversion_fee_cents ?? 0,
    disclosure: null,
    active: over.active ?? true,
    priority: over.priority ?? 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mkEvent(
  partner_id: string,
  status: LeadEvent['status'],
  revenue_cents: number,
): Pick<LeadEvent, 'partner_id' | 'status' | 'revenue_cents'> {
  return { partner_id, status, revenue_cents };
}

describe('leadRevenueAtClick', () => {
  const cases: [PayoutModel, number, number][] = [
    ['per_lead', 300, 300],
    ['hybrid', 300, 300],
    ['per_conversion', 300, 0], // nothing accrues until a conversion postback
  ];
  it.each(cases)('%s partner with %i lead fee → %i cents at click', (model, fee, expected) => {
    expect(leadRevenueAtClick({ payout_model: model, lead_fee_cents: fee })).toBe(expected);
  });
});

describe('leadStatusAtClick', () => {
  it('marks per_conversion clicks as "clicked" (not yet a paid lead)', () => {
    expect(leadStatusAtClick({ payout_model: 'per_conversion' })).toBe('clicked');
  });
  it('marks per_lead and hybrid clicks as "lead"', () => {
    expect(leadStatusAtClick({ payout_model: 'per_lead' })).toBe('lead');
    expect(leadStatusAtClick({ payout_model: 'hybrid' })).toBe('lead');
  });
});

describe('summarizeLeadEvents', () => {
  it('returns an all-zero summary for no events', () => {
    const s = summarizeLeadEvents([]);
    expect(s).toMatchObject({ clicks: 0, leads: 0, conversions: 0, revenueCents: 0, paidCents: 0 });
    expect(s.conversionRate).toBe(0);
    expect(s.byPartner).toEqual({});
  });

  it('counts leads, conversions, revenue and paid, and rolls up per partner', () => {
    const events = [
      mkEvent('a', 'lead', 300), // qualified lead, revenue accrued
      mkEvent('a', 'clicked', 0), // click only (per_conversion, not yet a lead)
      mkEvent('a', 'converted', 4300), // converted → counts as lead + conversion
      mkEvent('b', 'paid', 800), // paid conversion
      mkEvent('b', 'rejected', 0), // rejected → no revenue
    ];
    const s = summarizeLeadEvents(events);

    expect(s.clicks).toBe(5);
    expect(s.leads).toBe(3); // 1 lead + 2 converted/paid
    expect(s.conversions).toBe(2); // converted + paid
    expect(s.revenueCents).toBe(300 + 4300 + 800);
    expect(s.paidCents).toBe(800); // only the 'paid' event
    expect(s.conversionRate).toBeCloseTo(2 / 5);

    expect(s.byPartner.a).toEqual({ clicks: 3, conversions: 1, revenueCents: 4600 });
    expect(s.byPartner.b).toEqual({ clicks: 2, conversions: 1, revenueCents: 800 });
  });
});

describe('rankPartnersForContext', () => {
  const credit = mkPartner({ id: 'credit', category: 'credit', priority: 1 });
  const law = mkPartner({ id: 'law', category: 'law_firm', priority: 5 });
  const general = mkPartner({ id: 'general', category: 'general', priority: 10 });

  it('orders by priority when no category context is given', () => {
    const out = rankPartnersForContext([credit, law, general], { limit: 3 });
    expect(out.map((p) => p.id)).toEqual(['general', 'law', 'credit']);
  });

  it('floats affine categories to the top for a settlement category', () => {
    // Data Breach affinity is [credit, claims_service, law_firm]; credit wins
    // despite the lowest priority, then law_firm, then the unrelated general.
    const out = rankPartnersForContext([credit, law, general], {
      lawsuitCategory: 'Data Breach',
      limit: 3,
    });
    expect(out.map((p) => p.id)).toEqual(['credit', 'law', 'general']);
  });

  it('respects the limit', () => {
    expect(rankPartnersForContext([credit, law, general], { limit: 1 })).toHaveLength(1);
  });
});

describe('centsToUSD', () => {
  it('formats whole cents as USD', () => {
    expect(centsToUSD(4000)).toBe('$40.00');
    expect(centsToUSD(0)).toBe('$0.00');
    expect(centsToUSD(150)).toBe('$1.50');
  });
});
