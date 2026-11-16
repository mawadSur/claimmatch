import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One-click test mode: outbound side effects are sandboxed
// (src/lib/filing/channels/test-mode.ts). Resend and Supabase are faked.
const m = vi.hoisted(() => ({
  mail: [] as Array<Record<string, unknown>>,
  claimNextJob: vi.fn(),
  recordFilingResult: vi.fn(),
  loadJobContext: vi.fn(),
  preSendCheck: vi.fn(),
  loadSettlementFiling: vi.fn(),
  submit: vi.fn(),
  service: null as unknown,
}));
vi.mock('@/lib/email-transactional', () => ({
  sendTransactionalEmail: async (msg: Record<string, unknown>) => {
    m.mail.push(msg);
    return { status: 'sent', id: 'msg_1' };
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: () => m.service }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/filing/v2/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/v2/jobs')>()),
  claimNextJob: m.claimNextJob,
  recordFilingResult: m.recordFilingResult,
}));
vi.mock('@/lib/filing/channels/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/channels/context')>()),
  loadJobContext: m.loadJobContext,
  preSendCheck: m.preSendCheck,
  loadSettlementFiling: m.loadSettlementFiling,
}));

import { exportBulk } from '@/app/api/admin/filing/_lib/bulk';
import { submitAdministratorApi } from '@/lib/filing/channels/administrator-api';
import { submitAdministratorEmail } from '@/lib/filing/channels/administrator-email';
import { processWorkerChannels, testModePreflight } from '@/lib/filing/channels/cron';
import { notifyMember } from '@/lib/filing/channels/member-notices';
import { sandboxFor, testInbox } from '@/lib/filing/channels/test-mode';
import type { ChannelSubmitInput, FilingJobRecord } from '@/lib/filing/channels/types';
import { AdministratorEmailConfigSchema, FilingSpecContentSchema } from '@/lib/filing/v2/contract-spec';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const INBOX = 'qa-inbox@lawsuitai.example';
const TESTER = 'tester@lawsuitai.example';
const ADMIN_TO = 'claims@administrator.example';
const ADMIN_CC = 'records@administrator.example';

const SPEC = FilingSpecContentSchema.parse({
  official_form: { url: 'https://claims.example.test/form' },
  class_definition: { text: 'Testers.', source_url: 'https://claims.example.test/notice' },
  attestation: { text: 'TEST ONLY.' },
  member_fields: [{ field: 'legal_name', official_label: 'Name', required: true }],
});

const JOB = {
  id: ID(20),
  claim_id: ID(1),
  user_id: ID(30),
  lawsuit_id: ID(2),
  channel: 'administrator_email',
  status: 'in_progress',
  idempotency_key: `sig:${ID(5)}`,
  attempt: 1,
} as unknown as FilingJobRecord;

function emailInput(memberEmail: string, over: Partial<ChannelSubmitInput<'administrator_email'>> = {}): ChannelSubmitInput<'administrator_email'> {
  return {
    job: JOB,
    config: AdministratorEmailConfigSchema.parse({
      type: 'administrator_email',
      enabled: true,
      to: ADMIN_TO,
      cc: [ADMIN_CC],
      published_at_url: 'https://administrator.example/contact',
    }),
    spec: { id: ID(3), version: 1, content: SPEC },
    packet: {
      format: 'claimmatch.packet.v1',
      claim_id: ID(1),
      lawsuit_id: ID(2),
      spec: { id: ID(3), version: 1 },
      member: { legal_name: 'Test Member', first_name: null, last_name: null, email: memberEmail, phone: null, address: { line1: null, line2: null, city: null, state: 'CA', zip: null } },
      answers: {},
      benefit_tier: null,
      payout_method: null,
      documents: [],
      confirmations: { class_definition: true, health_data_consent: null },
      class_definition_sha256: 'a'.repeat(64),
      attestation_sha256: 'b'.repeat(64),
    } as never,
    signature: { signature_id: ID(5), typed_name: 'Test Member', signed_at: '2026-11-12T15:00:00Z', packet_hash: 'c'.repeat(64), statement_text: 'TEST ONLY.', authorization_text_version: 'v1', lane: 'administrator_email' },
    documents: [],
    settlement: { id: ID(2), title: 'TEST settlement', deadline: null },
    now: new Date('2026-11-13T12:00:00Z'),
    ...over,
  };
}

const allAddresses = (msg: Record<string, unknown>) => [msg.to, ...((msg.cc as string[]) ?? []), ...((msg.bcc as string[]) ?? [])];

beforeEach(() => {
  m.mail = [];
  for (const fn of [m.claimNextJob, m.recordFilingResult, m.loadJobContext, m.preSendCheck, m.loadSettlementFiling, m.submit]) fn.mockReset();
  vi.stubEnv('INTERNAL_EMAILS', TESTER);
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '');
  vi.stubEnv('ONE_CLICK_FILING_TEST_MODE', '1');
  vi.stubEnv('ONE_CLICK_TEST_INBOX', INBOX);
});
afterEach(() => vi.unstubAllEnvs());

describe('sandboxFor', () => {
  it('needs a valid ONE_CLICK_TEST_INBOX: unset or not one address blocks the send for a person', () => {
    for (const bad of ['', 'not-an-address', 'a@b.example, c@d.example']) {
      vi.stubEnv('ONE_CLICK_TEST_INBOX', bad);
      expect(testInbox()).toBeNull();
      expect(sandboxFor({ is_test: true }, 'administrator_email', () => TESTER)).toEqual({
        kind: 'refused',
        result: { status: 'needs_attention', reason_code: 'test_inbox_missing', detail: null },
      });
    }
  });

  it('a test job: the test inbox, the member copy only for a tester; the API lane never', () => {
    expect(sandboxFor({ is_test: true }, 'administrator_email', () => TESTER)).toEqual({ kind: 'sandboxed', sandbox: { inbox: INBOX, memberCopy: true } });
    expect(sandboxFor({ is_test: true }, 'administrator_email', () => 'someone@example.com')).toEqual({ kind: 'sandboxed', sandbox: { inbox: INBOX, memberCopy: false } });
    expect(sandboxFor({ is_test: true }, 'administrator_api', () => TESTER)).toMatchObject({ kind: 'refused', result: { reason_code: 'test_mode_no_api' } });
  });

  it('test mode never sends a real job anywhere (back to the queue, nothing left)', () => {
    expect(sandboxFor({ is_test: false }, 'administrator_email', () => TESTER)).toEqual({
      kind: 'refused',
      result: { status: 'not_sent', reason_code: 'test_mode_real_job_held', retry_safe: true },
    });
  });

  it('normal mode: a real job is sent for real; a leftover test job stays sandboxed', () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    expect(sandboxFor({ is_test: false }, 'administrator_email', () => TESTER)).toEqual({ kind: 'real' });
    expect(sandboxFor({}, 'administrator_api', () => TESTER)).toEqual({ kind: 'real' });
    expect(sandboxFor({ is_test: true }, 'administrator_email', () => TESTER).kind).toBe('sandboxed');
  });
});

describe('administrator_email in test mode', () => {
  it('goes only to the test inbox with [TEST], never to the administrator address or CC', async () => {
    const res = await submitAdministratorEmail(emailInput('someone@example.com', { job: { ...JOB, is_test: true }, sandbox: { inbox: INBOX, memberCopy: false } }));
    expect(res.status).toBe('filed');
    expect(m.mail).toHaveLength(1);
    expect(allAddresses(m.mail[0])).toEqual([INBOX]);
    expect(String(m.mail[0].subject)).toMatch(/^\[TEST\] Claim form: TEST settlement/);
    if (res.status === 'filed') expect(res.evidence[0]).toMatchObject({ kind: 'email', to: INBOX });
  });

  it('copies an internal tester, and nobody else', async () => {
    await submitAdministratorEmail(emailInput(TESTER, { job: { ...JOB, is_test: true }, sandbox: { inbox: INBOX, memberCopy: true } }));
    expect(allAddresses(m.mail[0]).sort()).toEqual([INBOX, TESTER].sort());
    expect(allAddresses(m.mail[0])).not.toContain(ADMIN_TO);
    expect(allAddresses(m.mail[0])).not.toContain(ADMIN_CC);
  });

  it('a test job without a sandbox is never sent', async () => {
    const res = await submitAdministratorEmail(emailInput(TESTER, { job: { ...JOB, is_test: true } }));
    expect(res).toMatchObject({ status: 'needs_attention', reason_code: 'test_inbox_missing' });
    expect(m.mail).toHaveLength(0);
  });

  it('normal mode is unchanged: the administrator, its CC and the member', async () => {
    await submitAdministratorEmail(emailInput('someone@example.com'));
    expect(m.mail[0].to).toBe(ADMIN_TO);
    expect((m.mail[0].cc as string[]).sort()).toEqual(['someone@example.com', ADMIN_CC].sort());
    expect(String(m.mail[0].subject)).not.toContain('[TEST]');
  });
});

describe('administrator_api in test mode', () => {
  it('never calls an adapter for a test job', async () => {
    const input = { ...emailInput(TESTER), job: { ...JOB, channel: 'administrator_api', is_test: true }, config: { type: 'administrator_api', enabled: true, adapter: 'test-ok', min_days_before_deadline: 3 } };
    expect(await submitAdministratorApi(input as never)).toEqual({ status: 'needs_attention', reason_code: 'test_mode_no_api', detail: null });
  });
});

describe('the worker in test mode', () => {
  const ctx = {
    job: JOB,
    claim: { id: ID(1), status: 'filing' },
    signature: { signature_id: ID(5) },
    packet: { documents: [], member: { email: TESTER } },
    packetRow: { id: ID(4), status: 'signed', health_consent_text_sha256: null, is_test: false },
    spec: { id: ID(3), version: 1, content: { deadline: null } },
    settlement: { lawsuit: { id: ID(2), title: 'TEST', deadline: null }, policy: { channels: [{ type: 'administrator_email', enabled: true }] } },
    documents: [],
  };
  const run = () => processWorkerChannels({} as never, { now: new Date(), runId: 'run-1', maxSends: 5, budgetMs: 60_000, startedAt: Date.now() }, new Map());

  beforeEach(() => {
    m.recordFilingResult.mockResolvedValue({ ok: true, job: {}, claimStatus: 'x' });
    m.loadJobContext.mockResolvedValue({ ok: true, ctx });
    m.preSendCheck.mockResolvedValue({ result: { outcome: 'pass', issues: [] }, runId: ID(90) });
  });

  it('hands the adapter the sandbox for a test job, and needs a person without an inbox', async () => {
    vi.stubEnv('ONE_CLICK_TEST_INBOX', '');
    m.claimNextJob.mockResolvedValueOnce({ ok: true, job: { ...JOB, is_test: true } }).mockResolvedValue({ ok: true, job: null });
    await run();
    expect(m.recordFilingResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'needs_attention', reasonCode: 'test_inbox_missing' }));
    expect(m.mail).toHaveLength(0);
  });

  it('sends a test job to the inbox only, and holds a real job without sending', async () => {
    m.claimNextJob
      .mockResolvedValueOnce({ ok: true, job: { ...JOB, is_test: true } })
      .mockResolvedValueOnce({ ok: true, job: { ...JOB, id: ID(21), is_test: false } })
      .mockResolvedValue({ ok: true, job: null });
    m.loadJobContext.mockImplementation(async (_svc: unknown, job: FilingJobRecord) => ({
      ok: true,
      ctx: {
        ...ctx,
        job,
        packet: emailInput(TESTER).packet,
        signature: emailInput(TESTER).signature,
        spec: { id: ID(3), version: 1, content: SPEC },
        settlement: { ...ctx.settlement, policy: { channels: [emailInput(TESTER).config] } },
      },
    }));
    await run();
    expect(m.mail).toHaveLength(1);
    expect(allAddresses(m.mail[0]).every((a) => a === INBOX || a === TESTER)).toBe(true);
    expect(m.recordFilingResult).toHaveBeenCalledWith(expect.objectContaining({ jobId: ID(21), outcome: 'not_submitted', result: { not_sent: 'test_mode_real_job_held' } }));
  });
});

/** A chainable Supabase stub: every filter is recorded; `rows` answers by table. */
function stubDb(rows: Record<string, unknown[]>) {
  const calls: Array<[string, string, ...unknown[]]> = [];
  const db = {
    calls,
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'neq', 'in', 'lte', 'order', 'limit']) {
        q[name] = (...args: unknown[]) => {
          calls.push([table, name, ...args]);
          return q;
        };
      }
      q.maybeSingle = async () => ({ data: rows[table]?.[0] ?? null, error: null });
      q.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null });
      return q;
    },
  };
  return db;
}

describe('member notices in test mode', () => {
  it('go only to INTERNAL_EMAILS testers, with [TEST] in the subject', async () => {
    const event = { kind: 'queued' as const, claimId: ID(1), userId: ID(30), lawsuitId: ID(2), eventId: ID(20) };
    m.service = stubDb({ profiles: [{ email: 'someone@example.com' }], lawsuits: [{ title: 'TEST', slug: 'x', deadline: null }] });
    expect(await notifyMember(event)).toBe(false);
    expect(m.mail).toHaveLength(0);
    m.service = stubDb({ profiles: [{ email: TESTER }], lawsuits: [{ title: 'TEST', slug: 'x', deadline: null }] });
    expect(await notifyMember(event)).toBe(true);
    expect(m.mail[0].to).toBe(TESTER);
    expect(String(m.mail[0].subject)).toMatch(/^\[TEST\] /);
  });
});

describe('bulk exports', () => {
  const settlement = {
    lawsuit: { id: ID(2), slug: 'x', title: 'X' },
    policy: {
      agent_filing: 'allowed',
      kill_switch: false,
      objection_received_at: null,
      settlement_policy_id: ID(6),
      channels: [{ type: 'administrator_bulk', enabled: true, columns: [{ header: 'Name', source: { constant: 'x' } }] }],
    },
  };
  const staff = { id: ID(7), email: null, isAdmin: false, roles: ['filing_agent' as const] };
  const go = (db: ReturnType<typeof stubDb>) => exportBulk(db as never, staff, { lawsuitId: ID(2) }, new Request('https://lawsuitai.org'), new Date());

  it('a real export never includes a test job', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    m.loadSettlementFiling.mockResolvedValue(settlement);
    const db = stubDb({ claim_filing_jobs: [] });
    await go(db);
    expect(db.calls).toContainEqual(['claim_filing_jobs', 'neq', 'is_test', true]);
    expect(db.calls).not.toContainEqual(['claim_filing_jobs', 'eq', 'is_test', true]);
  });

  it('test mode: test jobs only, and no export without the test inbox', async () => {
    m.loadSettlementFiling.mockResolvedValue(settlement);
    const db = stubDb({ claim_filing_jobs: [] });
    await go(db);
    expect(db.calls).toContainEqual(['claim_filing_jobs', 'eq', 'is_test', true]);
    vi.stubEnv('ONE_CLICK_TEST_INBOX', '');
    expect(await go(stubDb({ claim_filing_jobs: [] }))).toEqual({ ok: false, code: 'lane_unavailable' });
  });
});

describe('testModePreflight (the cron touches test data only)', () => {
  it('passes with only test jobs and testers’ packets', async () => {
    expect(await testModePreflight(stubDb({ claim_filing_jobs: [], claim_packets: [{ user_id: ID(30) }], profiles: [{ id: ID(30), email: TESTER }] }) as never)).toBeNull();
  });

  it('refuses with a real job, or a packet of anyone outside INTERNAL_EMAILS', async () => {
    expect(await testModePreflight(stubDb({ claim_filing_jobs: [{ id: ID(20) }] }) as never)).toBe('real_filing_jobs_present');
    expect(
      await testModePreflight(stubDb({ claim_filing_jobs: [], claim_packets: [{ user_id: ID(31) }], profiles: [{ id: ID(31), email: 'someone@example.com' }] }) as never),
    ).toBe('real_packets_present');
  });
});
