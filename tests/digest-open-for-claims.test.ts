import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';
import { catalogLawsuit } from './helpers';

// /api/cron/digest emails a settlement only when it is open for claims once
// the official-notice guides apply, as the catalog lists it: the weekly digest
// skips a match whose official deadline has passed, and the closing-soon email
// leaves out closed rows. Supabase and the senders are fake.

const m = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  /** The ids of each "mark notified" update. */
  marked: [] as unknown[][],
  notifyNewMatches: vi.fn(),
  sendClosingSoonEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      let updating = false;
      const q: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'is', 'gte', 'order']) q[name] = () => q;
      q.update = () => {
        updating = true;
        return q;
      };
      q.in = (_column: string, values: unknown[]) => {
        if (updating) m.marked.push(values);
        return q;
      };
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: updating ? null : (m.tables[table] ?? []), error: null }).then(resolve, reject);
      return q;
    },
  }),
  isSupabaseConfigured: () => true,
}));
vi.mock('@/lib/notifications', () => ({ notifyNewMatches: m.notifyNewMatches }));
vi.mock('@/lib/email', () => ({ sendClosingSoonEmail: m.sendClosingSoonEmail }));
vi.mock('@/lib/jobs', () => ({ recordCronFailure: vi.fn() }));

import { GET } from '@/app/api/cron/digest/route';
import { addCalendarDays } from '@/lib/claim-deadlines';
import { getSettlementGuide } from '@/lib/settlement-guides';

const SECRET = 'test-cron-secret';
const KIA = 'kia-optima-sportage-window-regulator-settlement';
const DEERE = 'john-deere-repair-services-antitrust-settlement';
const official = (slug: string) => getSettlementGuide(slug)?.deadline as string;
const plus = (date: string, days: number) => addCalendarDays(date, days) as string;

let n = 0;
function lawsuit(slug: string, overrides: Partial<Lawsuit> = {}): Lawsuit {
  n += 1;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return catalogLawsuit({ id, slug, title: slug, ...overrides });
}
const verified = (row: Lawsuit) => ({
  ...row,
  verified_at: '2026-10-20T12:00:00Z',
  eligibility_verified: 'People who bought it.',
});

async function runCron() {
  const req = new Request('https://claimmatch.test/api/cron/digest', { headers: { authorization: `Bearer ${SECRET}` } });
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

function today(date: string) {
  vi.setSystemTime(new Date(`${date}T17:00:00Z`));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  m.tables = {
    profiles: [
      {
        id: 'u1',
        email: 'jane@example.com',
        full_name: 'Jane',
        email_opt_in: true,
        email_frequency: 'weekly',
        onboarded: true,
      },
    ],
  };
  m.marked = [];
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  vi.stubEnv('ALERT_WEBHOOK_URL', '');
  vi.stubEnv('DIGEST_ENABLED', '');
  vi.stubEnv('CLOSING_SOON_EMAIL_ENABLED', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('weekly digest', () => {
  it('emails only matches open for claims once the guides apply, and marks only those notified', async () => {
    const TODAY = plus(official(KIA), 1);
    expect(official(KIA) < TODAY && TODAY < official(DEERE)).toBe(true);
    today(TODAY);
    vi.stubEnv('DIGEST_ENABLED', '1');
    const match = (id: string, row: Lawsuit) => ({ id, score: 0.9, dismissed: false, notified_at: null, lawsuit: row });
    m.tables.matches = [
      // The official deadline has passed; the feed's is still ahead.
      match('m-kia', lawsuit(KIA, { deadline: plus(official(KIA), 60) })),
      // The feed's deadline has passed; the official one is still ahead.
      match('m-deere', lawsuit(DEERE, { deadline: plus(TODAY, -10) })),
      match('m-closed', lawsuit('closed-settlement', { status: 'closed', deadline: plus(TODAY, 30) })),
      match('m-open', lawsuit('open-settlement', { deadline: plus(TODAY, 30) })),
    ];

    const { status, body } = await runCron();

    expect(status).toBe(200);
    expect(body.steps.digest).toEqual({ status: 'ran', result: { users: 1, emailed: 1 } });
    expect(m.notifyNewMatches).toHaveBeenCalledOnce();
    const items = m.notifyNewMatches.mock.calls[0][1] as { slug: string; deadline: string }[];
    expect(items.map((item) => [item.slug, item.deadline])).toEqual([
      [DEERE, official(DEERE)],
      ['open-settlement', plus(TODAY, 30)],
    ]);
    // Like the match sweep: what was not emailed stays unnotified.
    expect(m.marked).toEqual([['m-deere', 'm-open']]);
  });
});

describe('closing-soon email', () => {
  it('lists only rows open for claims once the guides apply', async () => {
    // A week before the Deere guide's deadline, after the Kia one.
    const TODAY = plus(official(DEERE), -7);
    expect(official(KIA) < TODAY).toBe(true);
    today(TODAY);
    vi.stubEnv('CLOSING_SOON_EMAIL_ENABLED', '1');
    vi.stubEnv('NEXT_PUBLIC_POSTAL_ADDRESS', '1 Main St, City, ST 00000');
    vi.stubEnv('RESEND_FROM', 'Lawsuit AI <hello@lawsuitai.org>');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    m.tables.lawsuits = [
      verified(lawsuit('open-settlement', { deadline: plus(TODAY, 5) })),
      verified(lawsuit('closed-settlement', { status: 'closed', deadline: plus(TODAY, 5) })),
      // The feed's deadline has passed; the official one is a week away.
      verified(lawsuit(DEERE, { deadline: plus(TODAY, -3) })),
      // The feed's deadline is days away; the official one has passed.
      verified(lawsuit(KIA, { deadline: plus(TODAY, 3) })),
    ];

    const { status, body } = await runCron();

    expect(status).toBe(200);
    expect(body.steps.closingSoonEmail).toMatchObject({ status: 'ran', result: { emailed: 1, listed: 2 } });
    expect(m.sendClosingSoonEmail).toHaveBeenCalledOnce();
    const { items } = m.sendClosingSoonEmail.mock.calls[0][1] as { items: { slug: string; deadline: string }[] };
    expect(items.map((item) => [item.slug, item.deadline])).toEqual([
      ['open-settlement', plus(TODAY, 5)],
      [DEERE, official(DEERE)],
    ]);
  });
});
