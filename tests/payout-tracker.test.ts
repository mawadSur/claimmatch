import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  inserts: [] as { table: string; row: unknown }[],
  sent: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/server', () => {
  function query(table: string) {
    const q: Record<string, unknown> = {};
    for (const name of ['select', 'in', 'eq']) q[name] = () => q;
    q.insert = async (row: unknown) => {
      db.inserts.push({ table, row });
      return { error: null };
    };
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(resolve, reject);
    return q;
  }
  return { isSupabaseConfigured: () => true, createServiceClient: () => ({ from: query }) };
});

vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendPayoutTrackerEmail: async (_to: string, data: Record<string, unknown>) => {
    db.sent.push(data);
    return true;
  },
}));

vi.mock('@/lib/closing-soon-email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/closing-soon-email')>()),
  commercialEmailPrereqs: () => ({ ok: true }),
}));

import { renderPayoutTrackerEmail } from '@/lib/email';
import {
  hearingHasPassed,
  pickPayoutTrackerSends,
  sendKey,
  sendPayoutTrackerEmails,
} from '@/lib/payout-tracker';

describe('payout tracker selection', () => {
  const now = new Date('2026-11-10T12:00:00-05:00');

  it('picks hearing_passed only once the listed date has passed', () => {
    expect(hearingHasPassed('2026-11-10', now)).toBe(true);
    expect(hearingHasPassed('2026-11-09', now)).toBe(true);
    expect(hearingHasPassed('2026-11-11', now)).toBe(false);
    expect(hearingHasPassed(null, now)).toBe(false);
  });

  it('does not invent a hearing email without a listed date', () => {
    const picked = pickPayoutTrackerSends(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme',
        hearingAt: null,
        paymentTimingText: null,
        alreadySent: new Set(),
      },
      now,
    );
    expect(picked).toEqual([]);
  });

  it('skips a kind+fingerprint that was already sent', () => {
    const picked = pickPayoutTrackerSends(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme',
        hearingAt: '2026-11-01',
        paymentTimingText: 'Checks in 90 days',
        alreadySent: new Set([sendKey('hearing_passed', ''), sendKey('payment_timing', 'Checks in 90 days')]),
      },
      now,
    );
    expect(picked).toEqual([]);
  });

  it('sends payment_timing again only when the listed text changes', () => {
    const first = pickPayoutTrackerSends(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme',
        hearingAt: null,
        paymentTimingText: 'Checks in 90 days',
        alreadySent: new Set(),
      },
      now,
    );
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'payment_timing', fingerprint: 'Checks in 90 days' });

    const same = pickPayoutTrackerSends(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme',
        hearingAt: null,
        paymentTimingText: 'Checks in 90 days',
        alreadySent: new Set([sendKey('payment_timing', 'Checks in 90 days')]),
      },
      now,
    );
    expect(same).toEqual([]);

    const updated = pickPayoutTrackerSends(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme',
        hearingAt: null,
        paymentTimingText: 'Checks in 60 days',
        alreadySent: new Set([sendKey('payment_timing', 'Checks in 90 days')]),
      },
      now,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].fingerprint).toBe('Checks in 60 days');
  });
});

describe('payout tracker email copy', () => {
  it('includes unsubscribe, no fee, and no invented dates', () => {
    const html = renderPayoutTrackerEmail({
      title: 'Acme Settlement',
      slug: 'acme-settlement',
      kind: 'payment_timing',
      paymentTimingText: 'Paid after final approval',
      to: 'a@example.com',
    });
    expect(html).toContain('/unsubscribe');
    expect(html).toContain('Acme Settlement');
    expect(html).toContain('Lawsuit AI');
    expect(html).not.toContain('ClaimMatch');
    expect(html).toContain('Paid after final approval');
    expect(html).not.toMatch(/fee|percent|15%/i);
    expect(html).not.toMatch(/we(?:['’]ll|\s+will)\s+file/i);
  });
});

describe('sendPayoutTrackerEmails flag and idempotency', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    db.tables = {};
    db.inserts = [];
    db.sent = [];
  });

  it('no-ops when the flag is off', async () => {
    const result = await sendPayoutTrackerEmails();
    expect(result).toEqual({ candidates: 0, emailed: 0, skipped: 'PAYOUT_TRACKER_EMAILS_ENABLED is off' });
    expect(db.sent).toEqual([]);
  });

  it('sends once and records the send log', async () => {
    vi.stubEnv('PAYOUT_TRACKER_EMAILS_ENABLED', '1');
    db.tables = {
      claims: [
        { id: 'c1', user_id: 'u1', status: 'reported_filed', lawsuit_id: 'l1', confirmation_number: null },
      ],
      lawsuits: [
        {
          id: 'l1',
          slug: 'acme',
          title: 'Acme',
          final_approval_hearing_at: '2026-11-01',
          payment_timing_text: null,
        },
      ],
      profiles: [{ id: 'u1', email: 'a@example.com', full_name: 'Ada', email_opt_in: true }],
      payout_tracker_sends: [],
    };
    const result = await sendPayoutTrackerEmails({ now: new Date('2026-11-10T12:00:00-05:00') });
    expect(result).toEqual({ candidates: 1, emailed: 1, skipped: null });
    expect(db.sent).toHaveLength(1);
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: 'payout_tracker_sends',
        row: expect.objectContaining({ claim_id: 'c1', kind: 'hearing_passed', fingerprint: '' }),
      }),
    ]);
  });

  it('does not resend when the send log already has that kind', async () => {
    vi.stubEnv('PAYOUT_TRACKER_EMAILS_ENABLED', '1');
    db.tables = {
      claims: [
        {
          id: 'c1',
          user_id: 'u1',
          status: 'submitted',
          lawsuit_id: 'l1',
          confirmation_number: 'AB-12',
        },
      ],
      lawsuits: [
        {
          id: 'l1',
          slug: 'acme',
          title: 'Acme',
          final_approval_hearing_at: '2026-11-01',
          payment_timing_text: null,
        },
      ],
      profiles: [{ id: 'u1', email: 'a@example.com', full_name: 'Ada', email_opt_in: true }],
      payout_tracker_sends: [{ claim_id: 'c1', kind: 'hearing_passed', fingerprint: '' }],
    };
    const result = await sendPayoutTrackerEmails({ now: new Date('2026-11-10T12:00:00-05:00') });
    expect(result).toEqual({ candidates: 0, emailed: 0, skipped: null });
    expect(db.sent).toEqual([]);
  });
});
