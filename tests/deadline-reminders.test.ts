import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCalendarDays } from '@/lib/claim-deadlines';
import {
  isReminderEligibleProfile,
  pickDeadlineReminder,
  reminderKindForDays,
  sendDeadlineReminders,
} from '@/lib/deadline-reminders';
import { renderDeadlineReminderEmail } from '@/lib/email';

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
