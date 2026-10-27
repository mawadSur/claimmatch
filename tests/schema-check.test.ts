import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRequiredSchema, type SchemaProbeClient } from '@/lib/schema-check';

const svc = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => svc,
  createClient: vi.fn(),
  isSupabaseConfigured: () => true,
}));

import { GET as schemaGet } from '@/app/api/health/schema/route';

function client(opts: {
  tables?: Record<string, { error: { message: string; code?: string } | null }>;
  rpcError?: { message: string; code?: string } | null;
}): SchemaProbeClient {
  return {
    from: (table: string) => ({
      select: () => ({
        limit: async () => opts.tables?.[table] ?? { error: null },
      }),
    }),
    rpc: async () => ({ error: opts.rpcError ?? null }),
  };
}

describe('checkRequiredSchema', () => {
  it('is ok when every probe succeeds', async () => {
    const result = await checkRequiredSchema(client({}));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toContain('lawsuits.last_seen_at');
    expect(result.present).toContain('persist_first_attribution');
  });

  it('lists missing tables and columns', async () => {
    const result = await checkRequiredSchema(
      client({
        tables: {
          lawsuits: { error: { message: 'Could not find the table public.lawsuits', code: 'PGRST205' } },
          profiles: { error: { message: 'column first_ref does not exist', code: '42703' } },
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('lawsuits');
    expect(result.missing).toContain('lawsuits.last_seen_at');
    expect(result.missing).toContain('profiles.first_ref');
  });

  it('treats "not signed in" as the function existing', async () => {
    const result = await checkRequiredSchema(
      client({ rpcError: { message: 'not signed in', code: 'P0001' } }),
    );
    expect(result.ok).toBe(true);
    expect(result.present).toContain('persist_first_attribution');
  });

  it('flags a missing function', async () => {
    const result = await checkRequiredSchema(
      client({ rpcError: { message: 'Could not find the function public.persist_first_attribution', code: 'PGRST202' } }),
    );
    expect(result.missing).toContain('persist_first_attribution');
    expect(result.ok).toBe(false);
  });
});

describe('/api/health/schema', () => {
  const SECRET = 'schema-secret';

  function req(auth = true) {
    return new Request('https://claimmatch.test/api/health/schema', {
      headers: auth ? { authorization: `Bearer ${SECRET}` } : {},
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without the cron secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await schemaGet(req(false));
    expect(res.status).toBe(401);
  });

  it('returns 200 when probes succeed', async () => {
    const ok = { error: null };
    svc.from.mockImplementation(() => ({
      select: () => ({ limit: async () => ok }),
    }));
    svc.rpc.mockResolvedValue(ok);
    const res = await schemaGet(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.present).toContain('share_links');
    expect(JSON.stringify(body)).not.toMatch(/service.role|secret|eyJ/);
  });

  it('returns 503 listing missing items', async () => {
    svc.from.mockImplementation((table: string) => ({
      select: () => ({
        limit: async () =>
          table === 'lawsuits'
            ? { error: { message: 'column last_seen_at does not exist', code: '42703' } }
            : { error: null },
      }),
    }));
    svc.rpc.mockResolvedValue({ error: null });
    const res = await schemaGet(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.missing.some((m: string) => m.includes('last_seen_at'))).toBe(true);
  });
});
