import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deadline reminders with one-click filing: a claim the member still has to
// finish is reminded (one-click wording); a claim that is signed or further
// along never is, so nobody is prompted to file a second time.
const db = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  statusFilter: [] as unknown[],
  selfFileSent: [] as Array<Record<string, unknown>>,
  agentSent: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/server', () => {
  function query(table: string) {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.in = (column: string, values: unknown[]) => {
      if (table === 'claims' && column === 'status') db.statusFilter = values;
      return q;
    };
    q.insert = async () => ({ error: null });
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(resolve, reject);
    return q;
  }
  return { isSupabaseConfigured: () => true, createServiceClient: () => ({ from: query }) };
});
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  sendDeadlineReminderEmail: async (_to: string, data: Record<string, unknown>) => {
    db.selfFileSent.push(data);
    return true;
  },
}));
vi.mock('@/lib/filing/channels/member-notices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/channels/member-notices')>()),
  sendAgentReminderEmail: async (data: Record<string, unknown>) => {
    db.agentSent.push(data);
    return true;
  },
}));

import { isAgentReminderStatus, reminderStatuses, remindsForStatus, sendDeadlineReminders } from '@/lib/deadline-reminders';
import { NO_REMINDER_STATUSES, REMINDER_AGENT_STATUSES } from '@/lib/filing/v2/contract';
import { renderAgentReminder } from '@/lib/filing/channels/member-notices';

const NOW = new Date('2026-11-05T17:00:00Z');

beforeEach(() => {
  vi.stubEnv('DEADLINE_REMINDERS_ENABLED', '1');
  db.tables = {
    lawsuits: [{ id: 'l1', slug: 'acme', title: 'Acme', deadline: '2026-11-12' }],
    profiles: ['u1', 'u2', 'u3', 'u4'].map((id) => ({ id, email: `${id}@example.com`, full_name: null, email_opt_in: true })),
    claim_reminder_sends: [],
  };
  db.statusFilter = [];
  db.selfFileSent = [];
  db.agentSent = [];
});
afterEach(() => vi.unstubAllEnvs());

describe('which statuses are reminded', () => {
  it('is unchanged with the flag off: self_file and not_reported_filed only', () => {
    expect(reminderStatuses(false)).toEqual(['self_file', 'not_reported_filed']);
    expect(remindsForStatus('preparing', false)).toBe(false);
  });

  it('adds the unsigned one-click statuses with the flag on, and never anything signed or later', () => {
    expect(reminderStatuses(true)).toEqual(['self_file', 'not_reported_filed', ...REMINDER_AGENT_STATUSES]);
    for (const status of NO_REMINDER_STATUSES) expect(remindsForStatus(status, true)).toBe(false);
    expect(isAgentReminderStatus('needs_you')).toBe(true);
    expect(isAgentReminderStatus('self_file')).toBe(false);
  });
});

describe('sendDeadlineReminders', () => {
  const claims = [
    { id: 'c1', user_id: 'u1', status: 'self_file', lawsuit_id: 'l1' },
    { id: 'c2', user_id: 'u2', status: 'ready', lawsuit_id: 'l1' },
    { id: 'c3', user_id: 'u3', status: 'queued', lawsuit_id: 'l1' },
    { id: 'c4', user_id: 'u4', status: 'filed_by_claimmatch', lawsuit_id: 'l1' },
  ];

  it('asks the database for the old statuses only while the flag is off', async () => {
    db.tables.claims = claims.slice(0, 1);
    await sendDeadlineReminders({ now: NOW });
    expect(db.statusFilter).toEqual(['self_file', 'not_reported_filed']);
    expect(db.selfFileSent).toHaveLength(1);
  });

  it('reminds an unsigned one-click claim with its own wording and skips signed ones even if returned', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    db.tables.claims = claims;
    const out = await sendDeadlineReminders({ now: NOW });
    expect(out).toEqual({ candidates: 2, emailed: 2, skipped: null });
    expect(db.selfFileSent.map((s) => s.slug)).toEqual(['acme']);
    expect(db.agentSent).toEqual([expect.objectContaining({ claimId: 'c2', kind: '7d', deadline: '2026-11-12', to: 'u2@example.com' })]);
  });

  it('words the one-click reminder for a claim the member started, never as filing it for them', () => {
    const { subject, text } = renderAgentReminder({ title: 'Acme', slug: 'acme', deadline: '2026-11-12', kind: '1d', to: 'a@example.com' });
    expect(subject).toBe("Your claim for Acme isn't signed yet: the deadline is tomorrow");
    expect(text).toContain('Thursday, November 12, 2026');
    expect(text.toLowerCase()).not.toMatch(/we file|files it for you|on your behalf|guarantee/);
  });
});
