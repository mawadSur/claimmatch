import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeMissingFeedPatch,
  keepMissingFeedPatch,
  missingFeedCloseThreshold,
  shouldProposeMissingClose,
} from '@/lib/missing-feed-queue';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('missing-feed close queue helpers', () => {
  it('proposes close at the configured miss threshold and never invents a status patch for keep', () => {
    expect(shouldProposeMissingClose({ missed_feed_count: 2 }, 3)).toBe(false);
    expect(shouldProposeMissingClose({ missed_feed_count: 3 }, 3)).toBe(true);
    expect(closeMissingFeedPatch()).toEqual({ status: 'closed' });
    expect(keepMissingFeedPatch()).toEqual({ missed_feed_count: 0 });
    expect(keepMissingFeedPatch()).not.toHaveProperty('status');
  });

  it('reads INGEST_MISSING_FEED_CLOSE_AFTER the same way the ingest does', () => {
    expect(missingFeedCloseThreshold()).toBe(3);
    vi.stubEnv('INGEST_MISSING_FEED_CLOSE_AFTER', '5');
    expect(missingFeedCloseThreshold()).toBe(5);
  });
});

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  lastUpdate: null as Record<string, unknown> | null,
  updated: { id: '00000000-0000-4000-8000-000000000001' } as Record<string, unknown> | null,
}));

vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => h.admin,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: (updates: Record<string, unknown>) => {
        h.lastUpdate = updates;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: h.updated, error: null }),
            }),
          }),
        };
      },
    }),
  }),
}));

import { PATCH } from '@/app/api/admin/lawsuits/route';

function patch(body: unknown) {
  return PATCH(
    new Request('http://localhost/api/admin/lawsuits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('PATCH /api/admin/lawsuits missing-feed actions', () => {
  const id = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.lastUpdate = null;
    h.updated = { id };
    vi.stubEnv('INGEST_MISSING_CLOSE_QUEUE_ENABLED', '1');
  });

  it('closes or keeps a queued row when the flag is on', async () => {
    const closed = await patch({ id, action: 'close_missing' });
    expect(closed.status).toBe(200);
    expect(h.lastUpdate).toEqual({ status: 'closed' });

    const kept = await patch({ id, action: 'keep_missing' });
    expect(kept.status).toBe(200);
    expect(h.lastUpdate).toEqual({ missed_feed_count: 0 });
  });

  it('refuses the actions when the flag is off', async () => {
    vi.stubEnv('INGEST_MISSING_CLOSE_QUEUE_ENABLED', '');
    const res = await patch({ id, action: 'close_missing' });
    expect(res.status).toBe(400);
    expect(h.lastUpdate).toBeNull();
  });
});
