import { beforeEach, describe, expect, it, vi } from 'vitest';

// The account data export includes the member's one-click records (issue #53,
// design section 12), member-safe fields only. Supabase is faked: each fake
// client records what was asked and answers rows that also carry staff-only
// columns, which must never reach the export.
type Asked = { client: 'member' | 'service'; table: string; columns: string; filters: Array<[string, unknown]> };
const m = vi.hoisted(() => ({
  asked: [] as Asked[],
  failTable: null as string | null,
  user: { id: '00000000-0000-4000-8000-000000000030', email: 'ada@example.com' } as { id: string; email: string } | null,
}));

const USER = '00000000-0000-4000-8000-000000000030';
const STAFF_ONLY = {
  lock_owner: 'staff:00000000-0000-4000-8000-000000000040',
  needs_attention_reason: 'kill_switch',
  closed_reason: 'objection_received',
  result: { staff_reason_code: 'administrator_prohibits' },
  evidence: [{ kind: 'screenshot' }],
  jev_result: { issues: [{ audience: 'staff', code: 'staff_check_required' }] },
  jev_outcome: 'block',
  session_id: 'session-secret',
  storage_path: `${USER}/claim/file.pdf`,
  uploaded_by: '00000000-0000-4000-8000-000000000040',
  detail: { staff: 'note' },
  is_test: true,
};
const ROWS: Record<string, Record<string, unknown>> = {
  claim_packets: { id: 'p1', claim_id: 'c1', status: 'signed', answers: { q1: 'yes' }, member_snapshot: { legal_name: 'Ada' } },
  claim_documents: { id: 'd1', claim_id: 'c1', kind: 'receipt', mime: 'application/pdf', size_bytes: 1200, status: 'stored' },
  claim_signatures: { id: 's1', claim_id: 'c1', typed_name: 'Ada Lovelace', lane: 'filing_desk', signed_at: '2026-11-10T00:00:00Z' },
  claim_signature_voids: { id: 'v1', signature_id: 's1', claim_id: 'c1', reason: 'member_edit', actor: 'user' },
  esign_consents: { id: 'e1', text_version: 'esign-v1', full_text: 'I agree.', consented_at: '2026-11-09T00:00:00Z' },
  claim_filing_jobs: { id: 'j1', claim_id: 'c1', channel: 'filing_desk', status: 'needs_attention', confirmation_number: null },
  self_filed_reports: {
    confirmation_number: 'ABC-1',
    confirmation_storage_path: `${USER}/r1/confirmation.png`,
    confirmation_mime: 'image/png',
    confirmation_bytes: 2048,
    created_at: '2026-11-17T00:00:00Z',
    lawsuit: { title: 'Example', slug: 'example' },
  },
};

function fakeClient(client: 'member' | 'service') {
  return {
    from: (table: string) => {
      const asked: Asked = { client, table, columns: '', filters: [] };
      m.asked.push(asked);
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string) => ((asked.columns = columns), chain);
      chain.eq = (column: string, value: unknown) => (asked.filters.push([column, value]), chain);
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(
          m.failTable === table
            ? { data: null, error: { code: '42501' } }
            : { data: ROWS[table] ? [{ ...ROWS[table], ...STAFF_ONLY }] : [], error: null },
        ).then(resolve, reject);
      return chain;
    },
    auth: { getUser: async () => ({ data: { user: m.user } }) },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => fakeClient('member'),
  createServiceClient: () => fakeClient('service'),
}));

import { GET } from '@/app/api/account/export/route';
import { EXPORT_COLUMNS, loadOneClickExport } from '@/lib/account-export-filing';

beforeEach(() => {
  m.asked = [];
  m.failTable = null;
});

describe('loadOneClickExport', () => {
  it('reads the member’s own rows (member uploads only) and filing jobs through the service role for this user only', async () => {
    const out = await loadOneClickExport({ member: fakeClient('member') as never, service: fakeClient('service') as never, userId: USER });
    expect(out.ok).toBe(true);
    const byTable = Object.fromEntries(m.asked.map((a) => [a.table, a]));
    for (const table of ['claim_packets', 'claim_documents', 'claim_signatures', 'claim_signature_voids', 'esign_consents']) {
      expect(byTable[table]).toMatchObject({ client: 'member', columns: EXPORT_COLUMNS[table as keyof typeof EXPORT_COLUMNS] });
      expect(byTable[table].filters).toContainEqual(['user_id', USER]);
    }
    expect(byTable.claim_documents.filters).toContainEqual(['source', 'member']);
    expect(byTable.claim_filing_jobs).toMatchObject({ client: 'service', filters: [['user_id', USER]] });
  });

  it('never exports staff identities, notes, reason codes, Jev results, storage paths, session ids or the test mark', async () => {
    const out = await loadOneClickExport({ member: fakeClient('member') as never, service: fakeClient('service') as never, userId: USER });
    if (!out.ok) throw new Error('expected ok');
    const text = JSON.stringify(out.data);
    for (const key of Object.keys(STAFF_ONLY)) expect(text).not.toContain(`"${key}"`);
    for (const value of ['kill_switch', 'objection_received', 'administrator_prohibits', 'session-secret', 'staff_check_required']) {
      expect(text).not.toContain(value);
    }
    for (const columns of Object.values(EXPORT_COLUMNS)) {
      for (const key of Object.keys(STAFF_ONLY)) expect(columns.split(', ')).not.toContain(key);
    }
    expect(out.data.packets[0]).toMatchObject({ id: 'p1', answers: { q1: 'yes' } });
    expect(out.data.documents[0]).toMatchObject({ id: 'd1', kind: 'receipt', size_bytes: 1200 });
    expect(out.data.signatures[0]).toMatchObject({ id: 's1', typed_name: 'Ada Lovelace' });
    expect(out.data.signature_voids[0]).toMatchObject({ id: 'v1', reason: 'member_edit' });
    expect(out.data.esign_consents[0]).toMatchObject({ id: 'e1', full_text: 'I agree.' });
    expect(out.data.filing_jobs[0]).toMatchObject({ id: 'j1', status: 'needs_attention', channel: 'filing_desk' });
  });

  it('fails as a whole when any one-click read fails', async () => {
    m.failTable = 'claim_signatures';
    expect(await loadOneClickExport({ member: fakeClient('member') as never, service: fakeClient('service') as never, userId: USER })).toEqual({ ok: false });
  });
});

describe('GET /api/account/export', () => {
  it('includes the one-click records', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.one_click_filing).sort()).toEqual(
      ['documents', 'esign_consents', 'filing_jobs', 'packets', 'signature_voids', 'signatures'].sort(),
    );
    expect(body.one_click_filing.filing_jobs[0]).toMatchObject({ id: 'j1' });
    expect(body.self_filed_reports[0]).toMatchObject({
      lawsuit_slug: 'example',
      confirmation_number: 'ABC-1',
      has_screenshot: true,
    });
    expect(JSON.stringify(body)).not.toContain('lock_owner');
    expect(JSON.stringify(body)).not.toContain(`${USER}/r1/confirmation.png`);
  });

  it('answers 503 instead of a silently partial export', async () => {
    m.failTable = 'claim_filing_jobs';
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
