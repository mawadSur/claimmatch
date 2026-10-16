import { describe, expect, it } from 'vitest';
import {
  buildClosingSoon,
  buildDashboard,
  type DashboardSettlement,
} from '@/components/claims/dashboard-model';
import type { ClaimView } from '@/lib/claims';

const NOW = new Date('2026-10-16T18:00:00Z');
const isFictional = (slug: string) => slug.startsWith('fake-');
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function settlement(overrides: Partial<DashboardSettlement> = {}): DashboardSettlement {
  return {
    id: uuid(),
    slug: 'real-one',
    title: 'Real settlement',
    status: 'open',
    review_status: 'published',
    deadline: '2026-11-30',
    claim_url: 'https://www.realsettlement-admin.com/file',
    ...overrides,
  };
}
function claim(overrides: Partial<ClaimView> = {}): ClaimView {
  return {
    id: uuid(),
    lawsuit_id: 'l',
    lawsuit_title: 'Stored title',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    created_at: null,
    ...overrides,
  };
}
function row(c: ClaimView, s: DashboardSettlement | null) {
  return buildDashboard([{ claim: c, settlement: s }], NOW, isFictional);
}

describe('buildDashboard', () => {
  it('shows a legacy "submitted" claim as Not filed with the corrective notice', () => {
    const s = settlement();
    const { rows, notices } = row(claim({ status: 'submitted' }), s);
    expect(rows[0]).toMatchObject({
      label: 'Not filed',
      group: 'needs_filing',
      action: { label: 'Tell us', href: '/claim/real-one' },
      deadlineText: 'Deadline Nov 30, 2026 · 45 days left',
    });
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'legacy',
        deadline: '2026-11-30',
        deadlinePassed: false,
        officialUrl: 'https://www.realsettlement-admin.com/file',
      }),
    ]);
  });

  it('says a fictional settlement was not real and needs nothing', () => {
    const { rows, notices } = row(claim({ status: 'submitted' }), settlement({ slug: 'fake-olive-oil', review_status: 'rejected' }));
    expect(rows[0]).toMatchObject({
      label: 'Not a real settlement',
      group: 'closed',
      action: null,
      nextStep: 'This settlement was not real. There is nothing to do.',
    });
    expect(notices[0]).toMatchObject({ kind: 'fictional' });
  });

  it('gives each state a clear next step', () => {
    expect(row(claim(), settlement()).rows[0]).toMatchObject({
      label: 'Not filed yet',
      group: 'needs_filing',
      action: { label: 'How to file' },
    });
    expect(row(claim({ status: 'reported_filed' }), settlement()).rows[0]).toMatchObject({
      group: 'reported',
      action: { label: 'Add number' },
    });
    expect(row(claim({ status: 'submitted', confirmation_number: 'AB-1' }), settlement()).rows[0]).toMatchObject({
      label: 'Submitted · #AB-1',
      group: 'submitted',
      action: { label: 'View' },
    });
    const late = row(claim(), settlement({ deadline: '2026-10-06' })).rows[0];
    expect(late).toMatchObject({ label: 'Not reported filed', group: 'closed', action: { label: 'Tell us' } });
    expect(late.nextStep).toBe('Filed before the deadline? Tell us by Nov 5, 2026.');
    const tooLate = row(claim(), settlement({ deadline: '2026-08-01' })).rows[0];
    expect(tooLate).toMatchObject({ group: 'closed', action: null, deadlineText: 'Deadline was Aug 1, 2026' });
  });

  it('keeps a claim readable when its settlement row is gone', () => {
    const { rows } = row(claim({ status: 'reported_filed' }), null);
    expect(rows[0]).toMatchObject({ title: 'Stored title', action: null, deadlineText: 'No deadline listed' });
  });

  it('never shows money, percentages or "Matched"', () => {
    const statuses = ['self_file', 'reported_filed', 'submitted', 'processing', 'paid', 'withdrawn', 'mystery'];
    for (const status of statuses) {
      for (const s of [settlement(), settlement({ deadline: '2026-01-01' }), settlement({ slug: 'fake-x' }), null]) {
        const { rows } = row(claim({ status, confirmation_number: status === 'submitted' ? 'Z-9' : null }), s);
        const text = JSON.stringify(rows);
        expect(text).not.toMatch(/\$|%|matched|owed|receipt|expired/i);
      }
    }
  });
});

describe('buildClosingSoon', () => {
  it('lists only open, real, untracked settlements by nearest deadline', () => {
    const tracked = settlement({ slug: 'tracked', deadline: '2026-10-20' });
    const list = [
      settlement({ slug: 'later', deadline: '2026-12-31' }),
      settlement({ slug: 'soon', deadline: '2026-10-25' }),
      settlement({ slug: 'closed', status: 'closed', deadline: '2026-10-21' }),
      settlement({ slug: 'past', deadline: '2026-10-10' }),
      settlement({ slug: 'draft-review', review_status: 'pending_review', deadline: '2026-10-22' }),
      settlement({ slug: 'fake-olive-oil', deadline: '2026-10-23' }),
      settlement({ slug: 'no-deadline', deadline: null }),
      { ...settlement({ slug: 'code-sample', deadline: '2026-10-24' }), id: 'sample-databreach' },
      tracked,
    ];
    const items = buildClosingSoon(list, new Set([tracked.id]), NOW, isFictional);
    expect(items.map((i) => i.slug)).toEqual(['soon', 'later']);
    expect(items[0]).toMatchObject({ deadlineText: 'Deadline Oct 25, 2026 · 9 days left' });
    expect(buildClosingSoon(list, new Set(), NOW, isFictional, 1).map((i) => i.slug)).toEqual(['tracked']);
  });
});
