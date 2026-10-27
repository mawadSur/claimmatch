import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatProofFeedbackCounts,
  isProofFeedbackAnswer,
  tallyProofFeedback,
} from '@/lib/proof-feedback';

afterEach(() => {
  vi.unstubAllEnvs();
});

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  insertError: null as { code?: string } | null,
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return Promise.resolve({ error: h.insertError });
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import { POST } from '@/app/api/proof-feedback/route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/proof-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  h.user = { id: 'user-1' };
  h.insertError = null;
  h.inserted = [];
});

describe('proof feedback helpers', () => {
  it('accepts only yes / no / not_sure and tallies per lawsuit', () => {
    expect(isProofFeedbackAnswer('yes')).toBe(true);
    expect(isProofFeedbackAnswer('maybe')).toBe(false);
    const counts = tallyProofFeedback([
      { lawsuit_id: 'a', answer: 'yes' },
      { lawsuit_id: 'a', answer: 'no' },
      { lawsuit_id: 'a', answer: 'not_sure' },
      { lawsuit_id: 'b', answer: 'yes' },
    ]);
    expect(counts.get('a')).toEqual({ yes: 1, no: 1, not_sure: 1, total: 3 });
    expect(formatProofFeedbackCounts(counts.get('a')!)).toContain('unverified crowd signal');
  });
});

describe('POST /api/proof-feedback', () => {
  it('404s when the flag is off and never writes', async () => {
    expect((await post({ lawsuit_id: '11111111-1111-4111-8111-111111111111', answer: 'yes' })).status).toBe(404);
    expect(h.inserted).toEqual([]);
  });

  it('requires a signed-in user', async () => {
    vi.stubEnv('PROOF_FEEDBACK_ENABLED', '1');
    h.user = null;
    expect((await post({ lawsuit_id: '11111111-1111-4111-8111-111111111111', answer: 'yes' })).status).toBe(401);
  });

  it('stores one answer and rejects a duplicate', async () => {
    vi.stubEnv('PROOF_FEEDBACK_ENABLED', '1');
    const ok = await post({ lawsuit_id: '11111111-1111-4111-8111-111111111111', answer: 'no' });
    expect(ok.status).toBe(200);
    expect(h.inserted[0]).toMatchObject({ user_id: 'user-1', answer: 'no' });

    h.insertError = { code: '23505' };
    expect((await post({ lawsuit_id: '11111111-1111-4111-8111-111111111111', answer: 'yes' })).status).toBe(409);
  });
});
