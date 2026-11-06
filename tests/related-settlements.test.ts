import { describe, expect, it } from 'vitest';
import { relatedSettlements } from '@/lib/related-settlements';
import { makeLawsuit } from './helpers';

const now = new Date('2026-11-04T12:00:00Z');

describe('relatedSettlements', () => {
  it('prefers the same category, then the nearest deadlines, and skips closed rows', () => {
    const current = makeLawsuit(
      {},
      { slug: 'here', title: 'Here', category: 'Privacy', deadline: '2026-12-01', status: 'open', review_status: 'published' },
    );
    const sameSoon = makeLawsuit(
      {},
      { id: '2', slug: 'same-soon', title: 'Same soon', category: 'Privacy', deadline: '2026-11-10', status: 'open', review_status: 'published' },
    );
    const sameLater = makeLawsuit(
      {},
      { id: '3', slug: 'same-later', title: 'Same later', category: 'Privacy', deadline: '2027-01-01', status: 'open', review_status: 'published' },
    );
    const otherSoon = makeLawsuit(
      {},
      { id: '4', slug: 'other-soon', title: 'Other soon', category: 'Auto & Vehicles', deadline: '2026-11-08', status: 'open', review_status: 'published' },
    );
    const closed = makeLawsuit(
      {},
      { id: '5', slug: 'closed-row', title: 'Closed', category: 'Privacy', deadline: '2026-11-05', status: 'closed', review_status: 'published' },
    );
    const unpublished = makeLawsuit(
      {},
      { id: '6', slug: 'draft-row', title: 'Draft', category: 'Privacy', deadline: '2026-11-06', status: 'open', review_status: 'pending_review' },
    );

    const rows = relatedSettlements(current, [current, sameSoon, sameLater, otherSoon, closed, unpublished], 3, now);
    expect(rows.map((r) => r.slug)).toEqual(['same-soon', 'same-later', 'other-soon']);
    expect(rows.every((r) => r.path === `/lawsuits/${r.slug}`)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/\$\d|testimonial|people have claimed/i);
  });

  it('never includes the current slug or invents rows beyond the catalog', () => {
    const current = makeLawsuit({}, { slug: 'only-me', category: 'Privacy', status: 'open', review_status: 'published' });
    expect(relatedSettlements(current, [current], 4, now)).toEqual([]);
  });
});
