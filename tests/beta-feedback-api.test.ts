import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  upsertError: null as { code?: string } | null,
  upserted: [] as Record<string, unknown>[],
  existing: null as { id: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.existing, error: null }),
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        h.upserted.push(row);
        return Promise.resolve({ error: h.upsertError });
      },
    }),
  }),
}));

import { GET, POST } from '@/app/api/beta-feedback/route';

function post(body: unknown, userId = `beta-${++n}`) {
  h.user = { id: userId };
  return POST(
    new Request('http://localhost/api/beta-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

let n = 0;

beforeEach(() => {
  h.user = { id: 'user-1' };
  h.upsertError = null;
  h.upserted = [];
  h.existing = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/beta-feedback', () => {
  it('404s when the flag is off and never writes', async () => {
    expect((await post({ dismissed: true })).status).toBe(404);
    expect(h.upserted).toEqual([]);
  });

  it('requires a signed-in user', async () => {
    vi.stubEnv('BETA_FEEDBACK_ENABLED', '1');
    h.user = null;
    expect(
      (
        await POST(
          new Request('http://localhost/api/beta-feedback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dismissed: true }),
          }),
        )
      ).status,
    ).toBe(401);
  });

  it('stores a dismiss and an interview opt-in without emailing', async () => {
    vi.stubEnv('BETA_FEEDBACK_ENABLED', '1');
    const res = await post({ dismissed: true, trigger: 'matches' });
    expect(res.status).toBe(200);
    expect(h.upserted[0]).toMatchObject({
      user_id: expect.any(String),
      dismissed: true,
      interview_opt_in: false,
      almost_stopped: null,
    });
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/beta-feedback/route.ts', 'utf8'),
    );
    expect(source).not.toMatch(/resend|sendEmail|@\/lib\/email/i);
  });

  it('GET reports whether this user already answered', async () => {
    vi.stubEnv('BETA_FEEDBACK_ENABLED', '1');
    h.existing = { id: 'row-1' };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ submitted: true });
  });
});
