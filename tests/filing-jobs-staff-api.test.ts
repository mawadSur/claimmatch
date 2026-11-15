import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The staff and law-firm API: who may do what (legal_reviewer vs admin vs
// filing_agent vs member), the flag, the guards and the audit-first rule.
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

import { POST as approvePolicy } from '@/app/api/admin/filing/policies/[policyId]/approve/route';
import { POST as approveSpec } from '@/app/api/admin/filing/specs/[specId]/approve/route';
import { POST as killSwitch } from '@/app/api/admin/filing/controls/kill-switch/route';
import { POST as objection } from '@/app/api/admin/filing/controls/objection/route';
import { POST as deskNext } from '@/app/api/admin/filing/desk/next/route';
import { POST as grantRole } from '@/app/api/admin/filing/roles/route';
import { POST as bulkExport } from '@/app/api/admin/filing/bulk/exports/route';
import { GET as listJobs } from '@/app/api/admin/filing/jobs/route';
import { GET as viewJob } from '@/app/api/admin/filing/jobs/[jobId]/route';
import { GET as settlements } from '@/app/api/admin/filing/settlements/route';
import { POST as createSpec } from '@/app/api/admin/filing/specs/route';
import { POST as validateSpec } from '@/app/api/admin/filing/specs/[specId]/validate/route';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = { id: ID(40), email: 'staff@claimmatch.test' };
const BASE = 'https://lawsuitai.org/api/admin/filing';

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const get = (path: string) => new Request(`${BASE}${path}`);
const params = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });
const as = (who: 'nobody' | 'member' | 'admin' | 'filing_agent' | 'legal_reviewer' | 'admin_agent') => {
  h.user = who === 'nobody' ? null : ME;
  h.admin = who === 'admin' || who === 'admin_agent';
  h.roles = who === 'filing_agent' || who === 'admin_agent' ? ['filing_agent'] : who === 'legal_reviewer' ? ['legal_reviewer'] : [];
};
const audits = () => h.ops.filter((o) => o.table === 'filing_audit_log' && o.op === 'insert').map((o) => (o.row as { action: string }).action);

/** The draft's updated_at as the database stores it (microseconds) and as the console sends it back. */
const READ_AT = '2026-11-12T09:30:00.123456+00:00';
const APPROVAL = {
  notes: 'Read the agreement and the claim form.',
  documents_reviewed: [{ kind: 'claim_form', title: 'Claim form', reviewed_on: '2026-11-10' }],
  confirm: true,
  expected_updated_at: READ_AT,
};
const TARGET = { lawsuit_id: ID(2) };

beforeEach(() => {
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  as('nobody');
  h.tables = {};
  h.ops = [];
  h.rpcCalls = [];
  h.rpcAnswer = () => ({ data: null, error: null });
  h.auditFails = false;
  h.rateOk = true;
});
afterEach(() => vi.unstubAllEnvs());

describe('the flag', () => {
  it('answers 404 on every new staff route while ONE_CLICK_FILING_ENABLED is off, before auth', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '');
    as('legal_reviewer');
    const responses = await Promise.all([
      settlements(get('/settlements')),
      approvePolicy(post(`/policies/${ID(6)}/approve`, APPROVAL), params('policyId', ID(6))),
      killSwitch(post('/controls/kill-switch', { target: TARGET, active: true, reason: 'x' })),
      deskNext(post('/desk/next', {})),
      grantRole(post('/roles', { email: 'a@b.test', role: 'filing_agent' })),
      bulkExport(post('/bulk/exports', { lawsuit_id: ID(2), confirm: true })),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: 'not_found' });
    }
    expect(h.ops).toEqual([]);
    expect(h.rpcCalls).toEqual([]);
  });
});

describe('who may enter', () => {
  it('401 signed out, 403 for a member who is neither admin nor staff', async () => {
    expect((await settlements(get('/settlements'))).status).toBe(401);
    as('member');
    const res = await settlements(get('/settlements'));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'forbidden' });
  });

  it('refuses a write from another site and anything but JSON, and rate-limits', async () => {
    as('admin');
    expect((await killSwitch(post('/controls/kill-switch', { target: TARGET, active: true, reason: 'x' }, { origin: 'https://evil.example' }))).status).toBe(403);
    const plain = new Request(`${BASE}/controls/kill-switch`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    expect((await killSwitch(plain)).status).toBe(415);
    h.rateOk = false;
    const limited = await killSwitch(post('/controls/kill-switch', { target: TARGET, active: true, reason: 'x' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
  });
});

describe('law-firm decisions are a legal_reviewer’s alone', () => {
  const draft = { id: ID(6), lawsuit_id: ID(2), administrator_id: null, version: 2, status: 'draft', agent_filing: 'allowed', allowed_states: ['CA'], channels: [{ type: 'filing_desk', enabled: true }], updated_at: READ_AT };

  it.each(['admin', 'filing_agent'] as const)('a %s cannot approve a policy', async (who) => {
    as(who);
    h.tables.filing_policies = [draft];
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, APPROVAL), params('policyId', ID(6)));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'role_required' });
    expect(h.rpcCalls).toEqual([]);
  });

  it('a legal_reviewer approves, recorded as the reviewer with the documents reviewed', async () => {
    as('legal_reviewer');
    h.tables.filing_policies = [draft];
    h.rpcAnswer = () => ({ data: { ...draft, status: 'approved', approved_by: ME.id, approved_at: '2026-11-12T00:00:00Z' }, error: null });
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, APPROVAL), params('policyId', ID(6)));
    expect(res.status).toBe(200);
    expect(h.rpcCalls).toEqual([
      { fn: 'filing_approve_policy', args: { p_policy_id: ID(6), p_reviewer_id: ME.id, p_notes: APPROVAL.notes, p_documents_reviewed: [{ ...APPROVAL.documents_reviewed[0], url: null, document_ref: null, notes: null }] } },
    ]);
    expect(audits()).toEqual(['approve_policy']);
    expect((await res.json()).policy).toMatchObject({ status: 'approved', approved_by: ME.id });
  });

  it('refuses to approve a policy draft that changed after the reviewer read it (nothing is approved)', async () => {
    as('legal_reviewer');
    h.tables.filing_policies = [{ ...draft, agent_filing: 'allowed', updated_at: '2026-11-12T09:41:07.004211+00:00' }];
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, APPROVAL), params('policyId', ID(6)));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'revision_conflict', fields: [{ path: 'expected_updated_at' }] });
    expect(h.rpcCalls).toEqual([]);
    expect(audits()).toEqual([]);
    // The version the reviewer read, sent back with millisecond precision, still matches.
    h.tables.filing_policies = [draft];
    h.rpcAnswer = () => ({ data: { ...draft, status: 'approved', approved_by: ME.id, approved_at: '2026-11-12T10:00:00Z' }, error: null });
    const ok = await approvePolicy(post(`/policies/${ID(6)}/approve`, { ...APPROVAL, expected_updated_at: '2026-11-12T09:30:00.123Z' }), params('policyId', ID(6)));
    expect(ok.status).toBe(200);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(['filing_approve_policy']);
  });

  it('an approval must say which version was read', async () => {
    as('legal_reviewer');
    h.tables.filing_policies = [draft];
    const { expected_updated_at: _omitted, ...withoutVersion } = APPROVAL;
    const res = await approvePolicy(post(`/policies/${ID(6)}/approve`, withoutVersion), params('policyId', ID(6)));
    expect(res.status).toBe(400);
    expect(h.rpcCalls).toEqual([]);
  });

  it('refuses to approve a spec draft that changed after the reviewer read it', async () => {
    as('legal_reviewer');
    h.tables.filing_specs = [{ id: ID(8), lawsuit_id: ID(2), status: 'draft', content: {}, updated_at: '2026-11-12T11:00:00Z' }];
    const res = await approveSpec(post(`/specs/${ID(8)}/approve`, APPROVAL), params('specId', ID(8)));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'revision_conflict' });
    expect(h.rpcCalls).toEqual([]);
  });

  it('only a draft can be approved; the database’s own refusal is role_required', async () => {
    as('legal_reviewer');
    h.tables.filing_policies = [{ ...draft, status: 'approved' }];
    expect(await (await approvePolicy(post(`/policies/${ID(6)}/approve`, APPROVAL), params('policyId', ID(6)))).json()).toMatchObject({ code: 'not_draft' });
    h.tables.filing_policies = [draft];
    h.rpcAnswer = () => ({ data: null, error: { code: 'CM006' } });
    expect(await (await approvePolicy(post(`/policies/${ID(6)}/approve`, APPROVAL), params('policyId', ID(6)))).json()).toMatchObject({ code: 'role_required' });
  });

  it('anyone in the console turns a kill switch on; only a legal_reviewer turns it off', async () => {
    h.tables.lawsuits = [{ id: ID(2) }];
    as('admin');
    const on = await killSwitch(post('/controls/kill-switch', { target: TARGET, active: true, reason: 'Administrator objected' }));
    expect(on.status).toBe(200);
    expect(h.ops.find((o) => o.op === 'upsert')?.row).toMatchObject({ lawsuit_id: ID(2), kill_switch: true, kill_switch_changed_by: ME.id });
    expect(audits()).toEqual(['kill_switch_on']);
    const off = await killSwitch(post('/controls/kill-switch', { target: TARGET, active: false, reason: 'Cleared' }));
    expect(await off.json()).toMatchObject({ code: 'role_required' });
    as('legal_reviewer');
    expect((await killSwitch(post('/controls/kill-switch', { target: TARGET, active: false, reason: 'Cleared by counsel' }))).status).toBe(200);
  });

  it('staff record an objection; only a legal_reviewer clears it', async () => {
    h.tables.lawsuits = [{ id: ID(2) }];
    as('filing_agent');
    expect((await objection(post('/controls/objection', { target: TARGET, received_at: '2026-11-12T10:00:00Z', notes: 'Letter' }))).status).toBe(200);
    expect(await (await objection(post('/controls/objection', { target: TARGET, received_at: null, notes: null }))).json()).toMatchObject({ code: 'role_required' });
    as('legal_reviewer');
    expect((await objection(post('/controls/objection', { target: TARGET, received_at: null, notes: null }))).status).toBe(200);
  });

  it('drafting a spec checks the official wording rules before anything is stored', async () => {
    as('admin');
    h.tables.lawsuits = [{ id: ID(2) }];
    const bad = {
      lawsuit_id: ID(2),
      content: {
        official_form: { url: 'https://official.example.test/claim' },
        class_definition: { text: 'All buyers.', source_url: 'https://official.example.test/notice' },
        attestation: { text: 'I declare it is true.' },
        member_fields: [{ field: 'legal_name', official_label: 'Name', required: true }],
        deadline: { date: '2026-12-31', time_zone: 'Mars/Olympus', type: 'postmark_by' },
      },
    };
    const res = await createSpec(post('/specs', bad));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'spec_invalid', fields: [{ path: 'deadline.time_zone' }] });
    expect(h.ops.some((o) => o.table === 'filing_specs' && o.op !== 'select')).toBe(false);
  });

  it('"Check the spec" checks the editor’s unsaved content when sent, else the stored spec, and stores nothing', async () => {
    as('admin');
    const stored = {
      official_form: { url: 'https://official.example.test/claim' },
      class_definition: { text: 'All buyers.', source_url: 'https://official.example.test/notice' },
      attestation: { text: 'I declare it is true.' },
      member_fields: [{ field: 'legal_name', official_label: 'Name', required: true }],
    };
    h.tables.filing_specs = [{ content: stored }];
    const path = `/specs/${ID(8)}/validate`;
    const draft = await validateSpec(post(path, { content: { ...stored, deadline: { date: '2026-12-31', time_zone: 'Mars/Olympus', type: 'postmark_by' } } }), params('specId', ID(8)));
    expect(draft.status).toBe(200);
    expect(await draft.json()).toMatchObject({ ok: false, errors: [{ path: 'deadline.time_zone' }] });
    const saved = await validateSpec(new Request(`${BASE}${path}`, { method: 'POST' }), params('specId', ID(8)));
    expect(await saved.json()).toEqual({ ok: true, errors: [] });
    expect((await validateSpec(post(path, { content: stored, extra: 1 }), params('specId', ID(8)))).status).toBe(400);
    expect(h.ops.some((o) => o.table === 'filing_specs' && o.op !== 'select')).toBe(false);
  });
});

describe('roles', () => {
  it('a legal_reviewer is added only by a legal_reviewer; an admin adds filing agents', async () => {
    as('admin');
    h.tables.profiles = [{ id: ID(41), email: 'new@claimmatch.test' }];
    expect(await (await grantRole(post('/roles', { email: 'new@claimmatch.test', role: 'legal_reviewer' }))).json()).toMatchObject({ code: 'role_required' });
    h.tables.staff_roles = [];
    const res = await grantRole(post('/roles', { email: 'NEW@claimmatch.test', role: 'filing_agent' }));
    expect(res.status).toBe(201);
    expect(h.ops.find((o) => o.table === 'staff_roles' && o.op === 'insert')?.row).toEqual({ user_id: ID(41), role: 'filing_agent', granted_by: ME.id, notes: null });
    expect(audits()).toEqual(['grant_role']);
  });

  it('nobody grants themself, and an unknown email is not found', async () => {
    as('legal_reviewer');
    h.tables.profiles = [{ id: ME.id, email: ME.email }];
    expect(await (await grantRole(post('/roles', { email: ME.email, role: 'legal_reviewer' }))).json()).toMatchObject({ code: 'forbidden' });
    h.tables.profiles = [];
    expect((await grantRole(post('/roles', { email: 'ghost@claimmatch.test', role: 'filing_agent' }))).status).toBe(404);
  });
});

describe('the desk', () => {
  it('is for filing agents: a legal_reviewer or an admin alone cannot take a job or export', async () => {
    for (const who of ['legal_reviewer', 'admin'] as const) {
      as(who);
      expect(await (await deskNext(post('/desk/next', {}))).json()).toMatchObject({ code: 'role_required' });
      expect(await (await bulkExport(post('/bulk/exports', { lawsuit_id: ID(2), confirm: true }))).json()).toMatchObject({ code: 'role_required' });
    }
    expect(h.rpcCalls).toEqual([]);
  });

  it('answers job null when nothing is due', async () => {
    as('filing_agent');
    const res = await deskNext(new Request(`${BASE}/desk/next`, { method: 'POST' }));
    expect(await res.json()).toEqual({ job: null });
    expect(h.rpcCalls[0]).toMatchObject({ fn: 'filing_job_claim_next', args: { p_channel: 'filing_desk', p_lock_owner: `staff:${ME.id}`, p_lock_minutes: 30 } });
  });

  it('shows nothing when the access log cannot be written, and puts the job back (nothing was sent)', async () => {
    as('admin_agent');
    h.auditFails = true;
    const job = { id: ID(20), claim_id: ID(1), user_id: ID(30), lawsuit_id: ID(2), signature_id: ID(5), status: 'in_progress', lock_owner: `staff:${ME.id}` };
    h.rpcAnswer = (fn) => (fn === 'filing_job_claim_next' ? { data: { job, claim: { status: 'filing' } }, error: null } : { data: { job: { ...job, status: 'queued' }, claim: { status: 'queued' } }, error: null });
    const res = await deskNext(post('/desk/next', {}));
    expect(res.status).toBe(503);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(['filing_job_claim_next', 'filing_job_finish']);
    expect(h.rpcCalls[1].args).toMatchObject({ p_job_id: ID(20), p_job_status: 'queued', p_claim_status: 'queued', p_reason: 'not_submitted' });
  });

  it('a job’s signed packet is for filing agents and the law firm, logged before it is shown', async () => {
    as('admin');
    expect(await (await viewJob(get(`/jobs/${ID(20)}`), params('jobId', ID(20)))).json()).toMatchObject({ code: 'role_required' });
    as('legal_reviewer');
    h.tables.claim_filing_jobs = [{ id: ID(20), claim_id: ID(1), user_id: ID(30), lawsuit_id: ID(2), signature_id: ID(5), status: 'queued' }];
    h.auditFails = true;
    expect((await viewJob(get(`/jobs/${ID(20)}`), params('jobId', ID(20)))).status).toBe(503);
    expect(h.ops.some((o) => o.table === 'claim_signatures')).toBe(false);
  });

  it('lists jobs for the console without member data', async () => {
    as('admin');
    h.tables.claim_filing_jobs = [
      { id: ID(20), claim_id: ID(1), user_id: ID(30), lawsuit_id: ID(2), channel: 'filing_desk', status: 'queued', attempt: 0, due_by: null, lock_owner: null, needs_attention_reason: null, created_at: '2026-11-12T00:00:00Z', result: { notes: 'secret' } },
    ];
    h.tables.lawsuits = [{ id: ID(2), title: 'Acme', deadline: '2026-12-31' }];
    const body = await (await listJobs(get('/jobs?status=queued'))).json();
    expect(body.items).toEqual([
      expect.objectContaining({ id: ID(20), settlement_title: 'Acme', deadline: '2026-12-31', locked: false, locked_by_me: false }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/secret|user_id/);
  });
});
