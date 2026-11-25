import { describe, expect, it } from 'vitest';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { planIngest, type ExistingRow } from '@/lib/scraper/plan';
import { guidedDeadline, applySettlementGuide } from '@/lib/settlement-guides';
import type { ScrapedLawsuit } from '@/lib/types';
import { makeLawsuit } from './helpers';

const locked: ExistingRow = {
  id: '9170831c-0878-4521-a01f-52885a400424',
  slug: 'ford-transit-trail',
  external_id: 'settlesignal:ford',
  status: 'open',
  deadline: '2026-01-01',
  deadline_override: '2027-01-15',
  review_status: 'published',
  reviewed_at: '2026-01-01T00:00:00Z',
  title: 'Ford Transit Trail',
  claim_url: 'https://example.com/claim',
};

describe('deadline override', () => {
  it('public deadline is coalesce(override, feed)', () => {
    expect(guidedDeadline({ slug: 'x', deadline: '2026-01-01', deadline_override: '2027-01-15' })).toBe('2027-01-15');
    expect(guidedDeadline({ slug: 'x', deadline: '2026-01-01', deadline_override: null })).toBe('2026-01-01');
    expect(guidedDeadline({ slug: 'x', deadline: '2026-01-01' })).toBe('2026-01-01');
  });

  it('catalog overlay writes the override onto deadline for display', () => {
    const row = makeLawsuit(
      {},
      {
        slug: 'non-bank-atm',
        deadline: '2026-02-01',
        deadline_override: '2027-02-10',
      },
    );
    expect(applySettlementGuide(row).deadline).toBe('2027-02-10');
  });

  it('open-for-claims follows the override, not a past feed date', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const feedPast = makeLawsuit({}, { deadline: '2026-01-01', status: 'open', review_status: 'published' });
    expect(isOpenForClaims({ ...feedPast, deadline: guidedDeadline({ ...feedPast, deadline_override: '2027-01-15' }) }, now)).toBe(
      true,
    );
  });

  it('ingest may refresh the feed deadline but never writes override columns', () => {
    const item: ScrapedLawsuit = {
      external_id: 'settlesignal:ford',
      title: 'Ford Transit Trail',
      summary: 'Ford Transit Trail',
      description: 'Ford Transit Trail',
      category: 'Consumer',
      typical_payout: 'Varies',
      proof_required: false,
      deadline: '2026-06-01',
      eligibility: {},
      eligibility_text: null,
      source_url: 'https://example.com/source',
      claim_url: 'https://example.com/claim',
      status: 'open',
    };
    const plan = planIngest({
      items: [item],
      existing: [locked],
      sourceId: 'src-1',
      now: new Date('2026-03-01T12:00:00Z'),
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].patch.deadline).toBe('2026-06-01');
    expect(plan.updates[0].patch).not.toHaveProperty('deadline_override');
    expect(plan.updates[0].patch).not.toHaveProperty('deadline_override_at');
    expect(plan.updates[0].patch).not.toHaveProperty('deadline_override_note');
    expect(plan.updates[0].closes).toBe(false);
  });
});
