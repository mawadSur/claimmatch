import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The admin queue's triage suggestion (listHeldClosureQueue) reads a guided
// settlement's official deadline, as the ingest's auto-close does
// (partitionHeldPastDeadline), and still shows the stored one. Supabase is
// fake: every query on a table answers with that table's rows.

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));

vi.mock('@/lib/supabase/server', () => {
  const client = {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'in', 'order', 'limit']) q[name] = () => q;
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(resolve, reject);
      return q;
    },
  };
  return { createServiceClient: () => client, createPublicClient: () => client };
});

import { addCalendarDays } from '@/lib/claim-deadlines';
import { listHeldClosureQueue } from '@/lib/held-closures';
import { getSettlementGuide } from '@/lib/settlement-guides';

const KIA = 'kia-optima-sportage-window-regulator-settlement';
const DEERE = 'john-deere-repair-services-antitrust-settlement';
const official = (slug: string) => getSettlementGuide(slug)?.deadline as string;
const plus = (date: string, days: number) => addCalendarDays(date, days) as string;
// The day after the Kia guide's deadline, before the Deere one.
const TODAY = plus(official(KIA), 1);

const held = (slug: string) => ({ source: 'settlesignal', slug, changes: ['status open -> closed'] });
const lawsuit = (slug: string, deadline: string) => ({
  id: `id-${slug}`,
  slug,
  title: `Settlement ${slug}`,
  status: 'open',
  deadline,
  claim_url: null,
  source_url: null,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T17:00:00Z`));
  vi.stubEnv('ADMIN_HELD_CLOSURES_ENABLED', '1');
  vi.stubEnv('HELD_CLOSURE_TRIAGE_ENABLED', '1');
  expect(official(KIA) < TODAY && TODAY < official(DEERE)).toBe(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('held closure triage in the admin queue', () => {
  it('suggests by a guided settlement’s official deadline and shows the stored one', async () => {
    db.tables = {
      jobs: [{ created_at: `${TODAY}T06:00:00Z`, result: { heldClosures: [KIA, DEERE, 'plain-settlement'].map(held) } }],
      lawsuits: [
        // The official deadline has passed; the feed's is still ahead.
        lawsuit(KIA, plus(official(KIA), 60)),
        // The feed's deadline has passed; the official one is still ahead.
        lawsuit(DEERE, plus(TODAY, -10)),
        lawsuit('plain-settlement', plus(TODAY, -1)),
      ],
    };

    const queue = new Map((await listHeldClosureQueue()).map((item) => [item.slug, item]));

    expect(queue.get(KIA)).toMatchObject({ deadline: plus(official(KIA), 60), suggestion: 'safe_to_close' });
    expect(queue.get(KIA)?.suggestionEvidence?.join(' ')).toContain(official(KIA));
    expect(queue.get(DEERE)).toMatchObject({ deadline: plus(TODAY, -10), suggestion: 'likely_keep' });
    expect(queue.get(DEERE)?.suggestionEvidence?.join(' ')).toContain(official(DEERE));
    // Without a guide, the stored deadline decides.
    expect(queue.get('plain-settlement')?.suggestion).toBe('safe_to_close');
  });
});
