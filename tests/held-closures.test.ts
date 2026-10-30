import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asHeldClosures,
  dedupeHeldClosures,
  heldClosuresFromJobs,
  shouldHideHeldClosure,
  toQueueItem,
} from '@/lib/held-closures';
import {
  heldChangeFingerprint,
  heldClosureApplyPatch,
  parseHeldClosurePatch,
} from '@/lib/scraper/plan';
import { makeLawsuit } from './helpers';

describe('held closure dedupe and fingerprint', () => {
  it('keeps the first slug (newest-first caller) and drops later duplicates', () => {
    const rows = asHeldClosures([
      { source: 'settlesignal', slug: 'acme', changes: ['status open -> closed'] },
      { source: 'deadline', slug: 'acme', changes: ['deadline 2027-01-01 -> 2026-01-01'] },
      { source: 'settlesignal', slug: 'beta', changes: ['status open -> closed'] },
      { slug: '', source: 'x', changes: [] },
    ]);
    expect(dedupeHeldClosures(rows).map((r) => r.slug)).toEqual(['acme', 'beta']);
    expect(dedupeHeldClosures(rows)[0].changes).toEqual(['status open -> closed']);
  });

  it('hides a decision only while the fingerprint matches', () => {
    const fingerprint = heldChangeFingerprint(['status open -> closed']);
    expect(shouldHideHeldClosure(fingerprint, { change_fingerprint: fingerprint })).toBe(true);
    expect(
      shouldHideHeldClosure(fingerprint, { change_fingerprint: 'deadline none -> 2026-01-01' }),
    ).toBe(false);
    expect(shouldHideHeldClosure(fingerprint, null)).toBe(false);
  });

  it('reads heldClosures from newest jobs first', () => {
    const held = heldClosuresFromJobs([
      {
        created_at: '2026-10-30T06:00:00Z',
        result: {
          heldClosures: [{ source: 'settlesignal', slug: 'acme', changes: ['status open -> closed'] }],
        },
      },
      {
        created_at: '2026-10-29T06:00:00Z',
        result: {
          heldClosures: [
            { source: 'settlesignal', slug: 'acme', changes: ['deadline none -> 2026-01-01'] },
            { source: 'settlesignal', slug: 'older', changes: ['status open -> closed'] },
          ],
        },
      },
    ]);
    expect(held.map((h) => h.slug)).toEqual(['acme', 'older']);
    expect(held[0].changes).toEqual(['status open -> closed']);
  });
});

describe('held closure apply patch', () => {
  it('prefers the stored planner patch and falls back to change lines', () => {
    expect(
      parseHeldClosurePatch(['status open -> closed'], { status: 'closed', title: 'ignore' }),
    ).toEqual({ status: 'closed' });
    expect(parseHeldClosurePatch(['deadline 2027-01-01 -> 2026-01-01'], null)).toEqual({
      deadline: '2026-01-01',
    });
    expect(heldClosureApplyPatch(['content refreshed (not yet reviewed)'], null)).toEqual({
      status: 'closed',
    });
  });

  it('never copies non-status, non-deadline fields from a stored patch', () => {
    expect(
      heldClosureApplyPatch(['status open -> closed'], {
        status: 'closed',
        eligibility_text: 'nope',
        title: 'nope',
      }),
    ).toEqual({ status: 'closed' });
  });
});

describe('queue item display', () => {
  it('shows current catalog fields and the official link', () => {
    const lawsuit = makeLawsuit(
      {},
      {
        id: 'id-1',
        slug: 'acme-breach',
        title: 'Acme Breach Settlement',
        status: 'open',
        deadline: '2026-12-01',
        claim_url: 'https://claims.acme-settlement.com/claim',
      },
    );
    const item = toQueueItem(
      { source: 'settlesignal', slug: 'acme-breach', changes: ['status open -> closed'] },
      lawsuit,
    );
    expect(item.title).toBe('Acme Breach Settlement');
    expect(item.status).toBe('open');
    expect(item.deadline).toBe('2026-12-01');
    expect(item.officialHref).toContain('claims.acme-settlement.com');
    expect(item.patch).toEqual({ status: 'closed' });
  });
});

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  lastUpdate: null as Record<string, unknown> | null,
  lastUpsert: null as Record<string, unknown> | null,
  lawsuit: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'acme-breach',
    status: 'open',
    deadline: '2026-12-01',
  } as Record<string, unknown> | null,
  queue: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => h.admin,
}));

vi.mock('@/lib/held-closures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/held-closures')>();
  return {
    ...actual,
    listHeldClosureQueue: async () => h.queue,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'held_closure_decisions') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            h.lastUpsert = row;
            return { error: null };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: h.lawsuit, error: h.lawsuit ? null : { message: 'missing' } }),
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          h.lastUpdate = updates;
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  }),
}));

import { GET, POST } from '@/app/api/admin/held-closures/route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/admin/held-closures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/admin/held-closures', () => {
  beforeEach(() => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.lastUpdate = null;
    h.lastUpsert = null;
    h.lawsuit = {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'acme-breach',
      status: 'open',
      deadline: '2026-12-01',
    };
    h.queue = [
      {
        slug: 'acme-breach',
        fingerprint: 'status open -> closed',
        changes: ['status open -> closed'],
        patch: { status: 'closed' },
      },
    ];
    vi.stubEnv('ADMIN_HELD_CLOSURES_ENABLED', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses non-admins', async () => {
    h.admin = null;
    const res = await post({ slug: 'acme-breach', action: 'approve' });
    expect(res.status).toBe(401);
    expect(h.lastUpdate).toBeNull();
  });

  it('is hidden when the flag is off', async () => {
    vi.stubEnv('ADMIN_HELD_CLOSURES_ENABLED', '');
    const res = await post({ slug: 'acme-breach', action: 'approve' });
    expect(res.status).toBe(404);
    expect(h.lastUpdate).toBeNull();
    const listed = await GET();
    expect(listed.status).toBe(404);
  });

  it('approves by applying only the close patch and storing who/when', async () => {
    const res = await post({
      slug: 'acme-breach',
      action: 'approve',
      changes: ['status open -> closed'],
      patch: { status: 'closed' },
    });
    expect(res.status).toBe(200);
    expect(h.lastUpdate).toEqual({ status: 'closed' });
    expect(h.lastUpsert).toMatchObject({
      slug: 'acme-breach',
      decision: 'approved',
      decided_by: 'admin-1',
    });
    expect(h.lastUpsert?.applied_patch).toEqual({ status: 'closed' });
  });

  it('dismisses without writing the lawsuit', async () => {
    const res = await post({
      slug: 'acme-breach',
      action: 'dismiss',
      fingerprint: 'status open -> closed',
    });
    expect(res.status).toBe(200);
    expect(h.lastUpdate).toBeNull();
    expect(h.lastUpsert).toMatchObject({
      slug: 'acme-breach',
      decision: 'dismissed',
      decided_by: 'admin-1',
      change_fingerprint: 'status open -> closed',
    });
  });

  it('bulk-approves selected slugs from the current queue', async () => {
    const res = await post({ slugs: ['acme-breach'], action: 'bulk_approve' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(h.lastUpdate).toEqual({ status: 'closed' });
  });
});
