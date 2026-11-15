import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/account/delete with LEGAL_RECORDS_ON_ACCOUNT_DELETION (checklist
// item 8): delete (default) archives nothing; the keeping modes archive the
// legal records first, and nothing is deleted if that fails.

type Op =
  | { op: 'insert' | 'upsert'; table: string; row: unknown }
  | { op: 'delete'; table: string }
  | { op: 'removeFiles'; paths: string[] }
  | { op: 'deleteUser'; id: string };

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  ops: [] as Op[],
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  upsertFails: false,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};
      const rows = () => (h.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      chain.select = () => chain;
      chain.eq = (c: string, v: unknown) => {
        filters.push([c, v]);
        return chain;
      };
      chain.limit = async () => ({ data: rows(), error: null });
      chain.insert = async (row: unknown) => {
        h.ops.push({ op: 'insert', table, row });
        return { error: null };
      };
      chain.upsert = async (row: unknown) => {
        h.ops.push({ op: 'upsert', table, row });
        return { error: h.upsertFails ? { code: '42P01' } : null };
      };
      chain.delete = () => {
        h.ops.push({ op: 'delete', table });
        return { eq: async () => ({ error: null }) };
      };
      return chain;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          h.ops.push({ op: 'removeFiles', paths });
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          h.ops.push({ op: 'deleteUser', id });
          return { error: null };
        },
      },
    },
  }),
}));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));

import { POST } from '@/app/api/account/delete/route';

const USER = '00000000-0000-4000-8000-0000000000a1';
const EVIDENCE = `${USER}/c1/evidence/shot.png`;
const UPLOAD = `${USER}/c1/receipt.png`;

const remove = () =>
  POST(
    new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    }),
  );
const removedPaths = () => h.ops.flatMap((o) => (o.op === 'removeFiles' ? o.paths : []));
const archiveWrites = () => h.ops.filter((o) => o.op === 'upsert' && o.table === 'filing_legal_record_archive');

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.user = { id: USER };
  h.ops = [];
  h.upsertFails = false;
  h.tables = {
    claim_signatures: [{ id: 's1', user_id: USER, lawsuit_id: 'l1', typed_name: 'Jordan Q. Member', packet_hash: 'a'.repeat(64) }],
    claim_documents: [
      { id: 'd1', user_id: USER, source: 'staff_evidence', status: 'stored', storage_path: EVIDENCE },
      { id: 'd2', user_id: USER, source: 'member', status: 'stored', storage_path: UPLOAD },
    ],
  };
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('legal records on account deletion', () => {
  it('delete (the default): nothing is archived, every file goes', async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(archiveWrites()).toEqual([]);
    expect(removedPaths().sort()).toEqual([EVIDENCE, UPLOAD].sort());
  });

  it('anonymize_and_retain: archives first, without the name, then deletes everything', async () => {
    vi.stubEnv('LEGAL_RECORDS_ON_ACCOUNT_DELETION', 'anonymize_and_retain');
    const res = await remove();
    expect(res.status).toBe(200);
    const first = h.ops.findIndex((o) => o.op === 'upsert');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(h.ops.findIndex((o) => o.op === 'delete'));
    expect(JSON.stringify(archiveWrites())).not.toContain('Jordan');
    expect(removedPaths().sort()).toEqual([EVIDENCE, UPLOAD].sort());
    expect(h.ops.at(-1)).toEqual({ op: 'deleteUser', id: USER });
  });

  it('retain: the evidence file stays for the archive; member uploads still go', async () => {
    vi.stubEnv('LEGAL_RECORDS_ON_ACCOUNT_DELETION', 'retain');
    const res = await remove();
    expect(res.status).toBe(200);
    expect(removedPaths()).toEqual([UPLOAD]);
    expect(JSON.stringify(archiveWrites())).toContain(EVIDENCE);
  });

  it('a failed archive stops the deletion: nothing is deleted', async () => {
    vi.stubEnv('LEGAL_RECORDS_ON_ACCOUNT_DELETION', 'retain');
    h.upsertFails = true;
    const res = await remove();
    expect(res.status).toBe(500);
    expect(h.ops.filter((o) => o.op !== 'upsert')).toEqual([]);
  });
});
