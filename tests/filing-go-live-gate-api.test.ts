import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Go-live gate (issue #52) on the staff API: the desk challenge rule
// (legal_reviewer only, audited) and the channel checks a policy approval
// must pass (checklist item 12). Same harness as filing-jobs-staff-api.test.ts.
type Op = { table: string; op: string; row?: unknown; filters: Array<[string, ...unknown[]]> };
const h = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  admin: false,
  roles: [] as string[],
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  ops: [] as Op[],
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcAnswer: (() => ({ data: null, error: null })) as (fn: string) => { data: unknown; error: unknown },
  auditFails: false,
  rateOk: true,
}));

vi.mock('@/lib/supabase/server', () => {
  const from = (table: string) => {
    const op: Op = { table, op: 'select', filters: [] };
    const answer = () => {
      h.ops.push(op);
      if (table === 'staff_roles' && op.op === 'select') {
        const forUser = op.filters.find(([o, c]) => o === 'eq' && c === 'user_id');
        if (forUser && op.filters.some(([o, c]) => o === 'is' && c === 'revoked_at') && !op.filters.some(([o, c]) => o === 'eq' && c === 'role')) {
          return { data: h.user && forUser[2] === h.user.id ? h.roles.map((role) => ({ role })) : [], error: null };
        }
      }
      if (table === 'filing_audit_log' && op.op === 'insert') return { data: null, error: h.auditFails ? { code: '42501' } : null };
      if (op.op === 'insert' || op.op === 'upsert' || op.op === 'update') {
        return { data: [{ id: '00000000-0000-4000-8000-0000000009ff', ...(op.row as object) }], error: null };
      }
      return { data: h.tables[table] ?? [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const name of ['eq', 'in', 'is', 'not', 'lt', 'lte', 'order', 'limit', 'range', 'ilike']) {
      chain[name] = (...args: unknown[]) => {
        op.filters.push([name, ...args]);
        return chain;
      };
    }
    chain.select = () => chain;
    for (const name of ['insert', 'upsert', 'update']) {
      chain[name] = (row: unknown) => {
        op.op = name;
        op.row = row;
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      const { data, error } = answer();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error };
    };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject);
    return chain;
  };
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
    createServiceClient: () => ({
      from,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        return h.rpcAnswer(fn);
      },
      storage: { from: () => ({}) },
    }),
  };
});
vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => (h.admin && h.user ? { id: h.user.id, email: h.user.email } : null),
  adminDeniedPath: () => '/login',
}));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => (h.rateOk ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: 30 }) }));
vi.mock('@/lib/jev', () => ({ validateJevRules: () => ({ ok: true, rules: [] }), runJev: vi.fn(), JEV_ENGINE_VERSION: 'jev-1' }));
vi.mock('@/lib/filing/channels/member-notices', () => ({ notifyMember: async () => true }));

import { POST as deskChallenge } from '@/app/api/admin/filing/controls/desk-challenge/route';
import { POST as approvePolicy } from '@/app/api/admin/filing/policies/[policyId]/approve/route';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = { id: ID(40), email: 'staff@claimmatch.test' };
const BASE = 'https://lawsuitai.org/api/admin/filing';
const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = (value: string) => ({ params: Promise.resolve({ policyId: value }) });
const as = (who: 'nobody' | 'admin' | 'filing_agent' | 'legal_reviewer') => {
  h.user = who === 'nobody' ? null : ME;
  h.admin = who === 'admin';
  h.roles = who === 'filing_agent' ? ['filing_agent'] : who === 'legal_reviewer' ? ['legal_reviewer'] : [];
};
const audits = () => h.ops.filter((o) => o.table === 'filing_audit_log' && o.op === 'insert').map((o) => o.row as Record<string, unknown>);
const upserts = () => h.ops.filter((o) => o.table === 'filing_controls' && o.op === 'upsert').map((o) => o.row as Record<string, unknown>);

const LOOSEN = { lawsuit_id: ID(2), mode: 'staff_completes_captcha', notes: 'Reviewed the site terms and the administrator letter.' };

beforeEach(() => {
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  as('nobody');
  h.tables = { lawsuits: [{ id: ID(2) }] };
  h.ops = [];
  h.rpcCalls = [];
  h.rpcAnswer = () => ({ data: null, error: null });
  h.auditFails = false;
  h.rateOk = true;
});
afterEach(() => vi.unstubAllEnvs());

describe('the desk challenge rule (0045)', () => {
  it('404s with the flag off, before auth', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '');
    as('legal_reviewer');
    expect((await deskChallenge(post('/controls/desk-challenge', LOOSEN))).status).toBe(404);
    expect(h.ops).toEqual([]);
  });

  it.each(['admin', 'filing_agent'] as const)('a %s cannot change it, either way', async (who) => {
    as(who);
    for (const body of [LOOSEN, { lawsuit_id: ID(2), mode: 'stop', notes: null }]) {
      const res = await deskChallenge(post('/controls/desk-challenge', body));
      expect(res.status).toBe(403);
    }
    expect(upserts()).toEqual([]);
  });

  it('a legal_reviewer loosens it with notes; it is recorded as theirs and audited', async () => {
    as('legal_reviewer');
    const res = await deskChallenge(post('/controls/desk-challenge', LOOSEN));
    expect(res.status).toBe(200);
    expect(upserts()).toEqual([
      expect.objectContaining({
        lawsuit_id: ID(2),
        desk_challenge_mode: 'staff_completes_captcha',
        desk_challenge_notes: LOOSEN.notes,
        desk_challenge_changed_by: ME.id,
      }),
    ]);
    expect(audits()).toEqual([expect.objectContaining({ action: 'desk_challenge_rule_set', detail: { mode: 'staff_completes_captcha' } })]);
    expect((await res.json()).controls).toMatchObject({ desk_challenge_mode: 'staff_completes_captcha' });
  });

  it('refuses to loosen it without notes, and any mode but the two', async () => {
    as('legal_reviewer');
    const noNotes = await deskChallenge(post('/controls/desk-challenge', { ...LOOSEN, notes: null }));
    expect(noNotes.status).toBe(400);
    expect(await noNotes.json()).toMatchObject({ fields: [{ path: 'notes' }] });
    const odd = await deskChallenge(post('/controls/desk-challenge', { ...LOOSEN, mode: 'solve_all' }));
    expect(odd.status).toBe(400);
    // Administrators have no challenge rule: the body names a settlement only.
    const admin = await deskChallenge(post('/controls/desk-challenge', { administrator_id: ID(3), mode: 'stop', notes: null }));
    expect(admin.status).toBe(400);
    expect(upserts()).toEqual([]);
  });

  it('back to stop needs no notes', async () => {
    as('legal_reviewer');
    const res = await deskChallenge(post('/controls/desk-challenge', { lawsuit_id: ID(2), mode: 'stop', notes: null }));
    expect(res.status).toBe(200);
    expect(upserts()[0]).toMatchObject({ desk_challenge_mode: 'stop' });
  });
});

describe('policy approval checks (checklist item 12)', () => {
  const READ_AT = '2026-11-12T09:30:00.123456+00:00';
  const EMAIL = {
    type: 'administrator_email',
    enabled: true,
    to: 'claims@admin.example',
    published_at_url: 'https://admin.example/contact',
  };
  const draft = (channels: unknown[], sources: unknown[] = []) => ({
    id: ID(6), lawsuit_id: ID(2), administrator_id: null, version: 1, status: 'draft', agent_filing: 'allowed',
    allowed_states: ['CA'], channels, sources_reviewed: sources, updated_at: READ_AT,
  });
  const approval = (docs: unknown[]) => ({ notes: 'Reviewed.', documents_reviewed: docs, confirm: true, expected_updated_at: READ_AT });
  const claimForm = { kind: 'claim_form', title: 'Claim form', reviewed_on: '2026-11-10' };

  it('refuses an email channel whose claims address source was not reviewed', async () => {
    as('legal_reviewer');
    h.tables.filing_policies = [draft([EMAIL])];
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, approval([claimForm])), params(ID(6)));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'spec_invalid', fields: [{ path: 'channels.0.published_at_url' }] });
    expect(h.rpcCalls).toEqual([]);
  });

  it('approves once the page that publishes the address is among the documents reviewed', async () => {
    as('legal_reviewer');
    h.tables.filing_policies = [draft([EMAIL])];
    h.rpcAnswer = () => ({ data: { ...draft([EMAIL]), status: 'approved' }, error: null });
    const page = { kind: 'administrator_terms', title: 'Contact page', url: 'https://admin.example/contact/', reviewed_on: '2026-11-10' };
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, approval([page])), params(ID(6)));
    expect(res.status).toBe(200);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(['filing_approve_policy']);
  });

  it('refuses bulk filing without a written agreement; a disabled channel is not checked', async () => {
    as('legal_reviewer');
    const bulk = { type: 'administrator_bulk', enabled: true, max_rows: 100, columns: [{ header: 'Name', source: { path: 'member.legal_name' } }] };
    h.tables.filing_policies = [draft([bulk, { ...EMAIL, enabled: false }])];
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, approval([claimForm])), params(ID(6)));
    expect(res.status).toBe(422);
    expect((await res.json()).fields).toEqual([expect.objectContaining({ path: 'channels.0' })]);
  });
});
