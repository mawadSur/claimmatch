import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANONYMIZED_FIELDS,
  DEFAULT_LEGAL_RECORD_RETENTION_DAYS,
  archiveLegalRecords,
  archiveRowFor,
  canonicalJson,
  legalRecordRetentionDays,
  legalRecordsMode,
  retentionDaysFromEnv,
} from '@/lib/filing/legal-records';
import {
  archiveRetentionSweep,
  jevPartialRunRetentionDays,
  pruneJevPartialRuns,
  retentionSchedule,
} from '@/lib/filing/retention';

// Checklist items 8 and 14: one setting for legal records on account
// deletion (default delete = today), and the retention periods with defaults.

const NOW = new Date('2026-11-14T12:00:00Z');
const USER = '00000000-0000-4000-8000-0000000000a1';
const SIGNATURE = {
  id: '00000000-0000-4000-8000-0000000000s1',
  claim_id: '00000000-0000-4000-8000-0000000000c1',
  user_id: USER,
  lawsuit_id: '00000000-0000-4000-8000-0000000000l1',
  packet_id: '00000000-0000-4000-8000-0000000000p1',
  spec_id: '00000000-0000-4000-8000-0000000000f1',
  spec_version: 2,
  packet_hash: 'a'.repeat(64),
  packet_canonical: '{"member":{"legal_name":"Jordan Q. Member","address":{"line1":"1 Main St"}}}',
  statement_text: 'I declare under penalty of perjury that the above is true.',
  statement_sha256: 'b'.repeat(64),
  authorization_text_version: 'agent-auth-v1',
  authorization_text: 'I authorize Lawsuit AI to file this claim.',
  typed_name: 'Jordan Q. Member',
  lane: 'filing_desk',
  esign_consent_id: '00000000-0000-4000-8000-0000000000e1',
  auth_method: 'password',
  auth_time: '2026-11-12T09:00:00Z',
  session_id: 'sess-1',
  ip: '203.0.113.9',
  user_agent: 'Mozilla/5.0',
  idempotency_key: 'idem-12345678',
  jev_run_id: null,
  signed_at: '2026-11-12T09:01:00Z',
};

afterEach(() => vi.unstubAllEnvs());

describe('the setting', () => {
  it('defaults to delete (today) and reads only the three exact values', () => {
    expect(legalRecordsMode({})).toBe('delete');
    expect(legalRecordsMode({ LEGAL_RECORDS_ON_ACCOUNT_DELETION: 'anonymize_and_retain' })).toBe('anonymize_and_retain');
    expect(legalRecordsMode({ LEGAL_RECORDS_ON_ACCOUNT_DELETION: ' retain ' })).toBe('retain');
    for (const v of ['keep', 'RETAIN', '1', 'anonymize']) expect(legalRecordsMode({ LEGAL_RECORDS_ON_ACCOUNT_DELETION: v })).toBe('delete');
  });
  it('retention days: whole numbers in range, else the default', () => {
    expect(legalRecordRetentionDays({})).toBe(DEFAULT_LEGAL_RECORD_RETENTION_DAYS);
    expect(legalRecordRetentionDays({ LEGAL_RECORD_RETENTION_DAYS: '3650' })).toBe(3650);
    for (const v of ['0', '-5', '1.5', 'ten', '99999999']) expect(retentionDaysFromEnv(v, 7)).toBe(7);
  });
});

describe('archiveRowFor', () => {
  const opts = { deletionRef: '00000000-0000-4000-8000-0000000000d1', now: NOW, retentionDays: 10 };
  it('anonymize_and_retain keeps what was agreed and when, never who', () => {
    const row = archiveRowFor('claim_signature', SIGNATURE, { ...opts, mode: 'anonymize_and_retain' });
    expect(Object.keys(row.record).sort()).toEqual([...ANONYMIZED_FIELDS.claim_signature].filter((k) => k in SIGNATURE).sort());
    const text = JSON.stringify(row.record);
    for (const secret of ['Jordan', '1 Main St', '203.0.113.9', 'Mozilla', 'sess-1', USER, SIGNATURE.claim_id, 'idem-']) {
      expect(text).not.toContain(secret);
    }
    expect(row).toMatchObject({ mode: 'anonymize_and_retain', record_kind: 'claim_signature', source_id: SIGNATURE.id, storage_path: null });
    expect(row.record).toMatchObject({ packet_hash: SIGNATURE.packet_hash, statement_text: SIGNATURE.statement_text, signed_at: SIGNATURE.signed_at });
    expect(row.retain_until).toBe('2026-11-24T12:00:00.000Z');
    expect(row.record_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('retain keeps the full row; evidence keeps its file only in retain', () => {
    expect(archiveRowFor('claim_signature', SIGNATURE, { ...opts, mode: 'retain' }).record).toEqual(SIGNATURE);
    const evidence = { id: 'ev1', job_id: 'j1', kind: 'confirmation_screenshot', storage_path: `${USER}/c/evidence/x.png`, sha256: 'c'.repeat(64) };
    expect(archiveRowFor('filing_evidence', evidence, { ...opts, mode: 'retain' }).storage_path).toBe(evidence.storage_path);
    const anon = archiveRowFor('filing_evidence', evidence, { ...opts, mode: 'anonymize_and_retain' });
    expect(anon.storage_path).toBeNull();
    expect(anon.record).not.toHaveProperty('storage_path');
  });
  it('hashes the same record the same, whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"e":0,"f":1}]},"b":1}');
  });
});

/** A service client fake: rows per table for selects, records every write. */
function fakeSvc(tables: Record<string, Array<Record<string, unknown>>>, fail: { table?: string; upsert?: boolean; remove?: boolean } = {}) {
  const writes: Array<{ table: string; op: string; rows?: unknown; ids?: unknown }> = [];
  const removed: string[][] = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown, unknown]> = [];
    let op = 'select';
    let payload: unknown;
    const chain: Record<string, unknown> = {};
    const answer = () => {
      if (fail.table === table && op === 'select') return { data: null, error: { code: 'XX000' } };
      if (op === 'upsert') {
        writes.push({ table, op, rows: payload });
        return { data: null, error: fail.upsert ? { code: '42501' } : null };
      }
      let rows = tables[table] ?? [];
      for (const [kind, col, value] of filters) {
        if (kind === 'eq') rows = rows.filter((r) => r[col as string] === value);
        if (kind === 'in') rows = rows.filter((r) => (value as unknown[]).includes(r[col as string]));
        if (kind === 'lt') rows = rows.filter((r) => String(r[col as string]) < String(value));
      }
      if (op === 'delete') {
        writes.push({ table, op, ids: rows.map((r) => r.id) });
        tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r));
      }
      return { data: rows, error: null };
    };
    for (const name of ['eq', 'in', 'lt']) {
      chain[name] = (col: string, value: unknown) => {
        filters.push([name, col, value]);
        return chain;
      };
    }
    chain.select = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.delete = () => {
      op = 'delete';
      return chain;
    };
    chain.upsert = (rows: unknown) => {
      op = 'upsert';
      payload = rows;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject);
    return chain;
  };
  const svc = {
    from,
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: fail.remove ? { name: 'StorageError' } : null };
        },
      }),
    },
  };
  return { svc: svc as never, writes, removed };
}

describe('archiveLegalRecords', () => {
  const tables = () => ({
    claim_signatures: [SIGNATURE],
    claim_signature_voids: [{ id: 'v1', signature_id: SIGNATURE.id, user_id: USER, reason: 'member_edit', actor: 'user', created_at: NOW.toISOString() }],
    esign_consents: [{ id: 'e1', user_id: USER, text_version: 'esign-v1', full_text: 'I agree', text_sha256: 'd'.repeat(64), ip: '203.0.113.9', consented_at: NOW.toISOString() }],
    claim_filing_jobs: [{ id: 'j1', user_id: USER, lawsuit_id: SIGNATURE.lawsuit_id, channel: 'filing_desk', status: 'filed', confirmation_number: 'ABC123' }],
    claim_documents: [
      { id: 'd1', user_id: USER, source: 'staff_evidence', status: 'stored', storage_path: `${USER}/c/evidence/1.png` },
      { id: 'd2', user_id: USER, source: 'member', status: 'stored', storage_path: `${USER}/c/receipt.png` },
    ],
  });

  it('copies every legal record of the account, anonymized, and keeps no file', async () => {
    const { svc, writes } = fakeSvc(tables());
    const out = await archiveLegalRecords(svc, USER, 'anonymize_and_retain', NOW, 30);
    expect(out).toEqual({ ok: true, archived: 5, keptPaths: [] });
    const rows = writes[0]?.rows as Array<{ record_kind: string; record: Record<string, unknown> }>;
    expect(rows.map((r) => r.record_kind)).toEqual(['claim_signature', 'claim_signature_void', 'esign_consent', 'claim_filing_job', 'filing_evidence']);
    expect(JSON.stringify(rows)).not.toContain(USER);
    expect(JSON.stringify(rows)).not.toContain('ABC123');
    expect(JSON.stringify(rows)).not.toContain('203.0.113.9');
  });

  it('retain keeps the evidence files, never the member uploads', async () => {
    const { svc } = fakeSvc(tables());
    const out = await archiveLegalRecords(svc, USER, 'retain', NOW, 30);
    expect(out).toEqual({ ok: true, archived: 5, keptPaths: [`${USER}/c/evidence/1.png`] });
  });

  it('fails closed on a read or write error', async () => {
    expect(await archiveLegalRecords(fakeSvc(tables(), { table: 'esign_consents' }).svc, USER, 'retain', NOW)).toEqual({ ok: false, step: 'esign_consents' });
    expect(await archiveLegalRecords(fakeSvc(tables(), { upsert: true }).svc, USER, 'retain', NOW)).toEqual({ ok: false, step: 'filing_legal_record_archive' });
  });
});

describe('retention (checklist item 14)', () => {
  it('Jev partial runs are kept unless a period of 30 days or more is set', () => {
    expect(jevPartialRunRetentionDays({})).toBeNull();
    expect(jevPartialRunRetentionDays({ JEV_PARTIAL_RUN_RETENTION_DAYS: '7' })).toBeNull();
    expect(jevPartialRunRetentionDays({ JEV_PARTIAL_RUN_RETENTION_DAYS: '90' })).toBe(90);
  });

  it('prunes only partial runs past the period, and nothing when off', async () => {
    const old = '2026-01-01T00:00:00Z';
    const rows = () => ({
      jev_runs: [
        { id: 'r1', mode: 'partial', created_at: old },
        { id: 'r2', mode: 'pre_sign', created_at: old },
        { id: 'r3', mode: 'pre_send', created_at: old },
        { id: 'r4', mode: 'partial', created_at: '2026-11-13T00:00:00Z' },
      ],
    });
    const off = fakeSvc(rows());
    expect(await pruneJevPartialRuns(off.svc, NOW, null)).toEqual({ deleted: 0, enabled: false });
    expect(off.writes).toEqual([]);
    const on = fakeSvc(rows());
    expect(await pruneJevPartialRuns(on.svc, NOW, 90)).toEqual({ deleted: 1, enabled: true });
    expect(on.writes).toEqual([{ table: 'jev_runs', op: 'delete', ids: ['r1'] }]);
  });

  it('deletes archived records past retain_until, file first; a file that will not go keeps its row', async () => {
    const archive = () => ({
      filing_legal_record_archive: [
        { id: 'a1', storage_path: null, retain_until: '2026-01-01T00:00:00Z' },
        { id: 'a2', storage_path: 'u/c/evidence/1.png', retain_until: '2026-01-01T00:00:00Z' },
        { id: 'a3', storage_path: null, retain_until: '2030-01-01T00:00:00Z' },
      ],
    });
    const ok = fakeSvc(archive());
    expect(await archiveRetentionSweep(ok.svc, NOW)).toEqual({ deleted: 2 });
    expect(ok.removed).toEqual([['u/c/evidence/1.png']]);
    const stuck = fakeSvc(archive(), { remove: true });
    expect(await archiveRetentionSweep(stuck.svc, NOW)).toEqual({ deleted: 1 });
    expect(stuck.writes).toEqual([{ table: 'filing_legal_record_archive', op: 'delete', ids: ['a1'] }]);
  });

  it('the schedule lists every record class with its setting and current value', () => {
    const schedule = retentionSchedule({ LEGAL_RECORDS_ON_ACCOUNT_DELETION: 'retain', JEV_PARTIAL_RUN_RETENTION_DAYS: '120' });
    expect(schedule.map((s) => s.setting)).toEqual([
      'DOCUMENT_RETENTION_DAYS (code constant)',
      null,
      'JEV_PARTIAL_RUN_RETENTION_DAYS',
      null,
      'LEGAL_RECORDS_ON_ACCOUNT_DELETION',
      'LEGAL_RECORD_RETENTION_DAYS',
      null,
    ]);
    expect(schedule[0]?.period).toContain('90 days');
    expect(schedule[2]?.period).toBe('120 days');
    expect(schedule[4]?.period).toContain('on deletion: retain');
    expect(retentionSchedule({})[2]?.period).toBe('kept with the claim');
  });
});
