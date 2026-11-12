import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake service client for the send run: each table answers with its rows.
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
  sendDeadlineReminderEmail: async (_to: string, data: Record<string, unknown>) => {
    db.sent.push(data);
    return true;
  },
}));

import { addCalendarDays } from '@/lib/claim-deadlines';
import {
  isReminderEligibleProfile,
  pickDeadlineReminder,
  reminderKindForDays,
  sendDeadlineReminders,
} from '@/lib/deadline-reminders';
import { renderDeadlineReminderEmail } from '@/lib/email';
import { getSettlementGuide } from '@/lib/settlement-guides';

describe('deadline reminder selection', () => {
  const now = new Date('2026-11-05T12:00:00-05:00');

  it('picks 7d and 1d only', () => {
    expect(reminderKindForDays(7)).toBe('7d');
    expect(reminderKindForDays(1)).toBe('1d');
    expect(reminderKindForDays(0)).toBeNull();
    expect(reminderKindForDays(6)).toBeNull();
    expect(reminderKindForDays(14)).toBeNull();
  });

  it('requires email opt-in and an address', () => {
    expect(isReminderEligibleProfile({ email_opt_in: true, email: 'a@example.com' })).toBe(true);
    expect(isReminderEligibleProfile({ email_opt_in: false, email: 'a@example.com' })).toBe(false);
    expect(isReminderEligibleProfile({ email_opt_in: true, email: null })).toBe(false);
  });

  it('skips a kind that was already sent', () => {
    const deadline = addCalendarDays('2026-11-05', 7);
    const picked = pickDeadlineReminder(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme',
        deadline,
        alreadySent: new Set(['7d']),
      },
      now,
    );
    expect(picked).toBeNull();
  });

  it('returns a 7d candidate when the deadline is in 7 days and nothing was sent', () => {
    const deadline = addCalendarDays('2026-11-05', 7);
    const picked = pickDeadlineReminder(
      {
        claimId: 'c1',
        userId: 'u1',
        email: 'a@example.com',
        name: 'Ada',
        lawsuitId: 'l1',
        slug: 'acme',
        title: 'Acme Settlement',
        deadline,
        alreadySent: new Set(),
      },
      now,
    );
    expect(picked).toMatchObject({ kind: '7d', slug: 'acme', claimId: 'c1' });
  });
});

describe('deadline reminder email', () => {
  it('includes an unsubscribe link and no invented counts', () => {
    const html = renderDeadlineReminderEmail({
      title: 'Acme Settlement',
      slug: 'acme-settlement',
      deadline: '2026-11-12',
      kind: '7d',
      to: 'a@example.com',
    });
    expect(html).toContain('/unsubscribe');
    expect(html).toContain('Acme Settlement');
    expect(html).toContain('LawsuitAI');
    expect(html).not.toContain('ClaimMatch');
    expect(html).toMatch(/Nov 12, 2026/);
    expect(html).not.toMatch(/thousands|users like you|99%/i);
  });
});

describe('sendDeadlineReminders flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no-ops when the flag is off', async () => {
    const result = await sendDeadlineReminders();
    expect(result).toEqual({
      candidates: 0,
      emailed: 0,
      skipped: 'DEADLINE_REMINDERS_ENABLED is off',
    });
  });
});

describe('sendDeadlineReminders on a guided settlement', () => {
  const SLUG = 'kroger-prescription-drug-prices-class-action-settlement';
  const official = getSettlementGuide(SLUG)?.deadline as string;
  const day = (days: number) => addCalendarDays(official, days) as string;
  /** Noon in New York, `days` after the official deadline. */
  const at = (days: number) => new Date(`${day(days)}T17:00:00Z`);
  const withFeedDeadline = (deadline: string) => {
    db.tables.lawsuits = [{ id: 'l1', slug: SLUG, title: 'Kroger prescriptions', deadline }];
  };

  beforeEach(() => {
    vi.stubEnv('DEADLINE_REMINDERS_ENABLED', '1');
    db.tables = {
      claims: [{ id: 'c1', user_id: 'u1', status: 'self_file', lawsuit_id: 'l1' }],
      profiles: [{ id: 'u1', email: 'a@example.com', full_name: 'Ada', email_opt_in: true }],
      claim_reminder_sends: [],
    };
    db.inserts = [];
    db.sent = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reminds 7 days before the official deadline, when the feed’s is later', async () => {
    withFeedDeadline(day(30));
    expect(await sendDeadlineReminders({ now: at(-7) })).toEqual({ candidates: 1, emailed: 1, skipped: null });
    expect(db.sent).toMatchObject([{ slug: SLUG, deadline: official, kind: '7d', to: 'a@example.com' }]);
    expect(db.inserts).toMatchObject([{ table: 'claim_reminder_sends', row: { claim_id: 'c1', kind: '7d' } }]);
  });

  it('still reminds on the last day when the feed’s deadline passed first', async () => {
    withFeedDeadline(day(-20));
    expect(await sendDeadlineReminders({ now: at(-1) })).toMatchObject({ candidates: 1, emailed: 1 });
    expect(db.sent).toMatchObject([{ deadline: official, kind: '1d' }]);
  });

  it('sends nothing on the feed’s schedule once the official deadline has passed', async () => {
    withFeedDeadline(day(30));
    expect(await sendDeadlineReminders({ now: new Date(`${day(23)}T17:00:00Z`) })).toEqual({ candidates: 0, emailed: 0, skipped: null });
    expect(db.sent).toEqual([]);
  });
});
