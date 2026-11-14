import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every job change is one database function call (0039, 0040); the fake
// service client records the call and answers what the test sets.
const db = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcAnswer: (() => ({ data: null, error: null })) as (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown },
  rows: {} as Record<string, unknown>,
  notices: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args });
      return db.rpcAnswer(fn, args);
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'in', 'is', 'order', 'limit']) chain[name] = () => chain;
      chain.maybeSingle = async () => ({ data: db.rows[table] ?? null, error: null });
      return chain;
    },
  }),
}));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/filing/channels/member-notices', () => ({
  notifyMember: async (event: Record<string, unknown>) => {
    db.notices.push(event);
    return true;
  },
}));

import type { LaneDecision } from '@/lib/filing/channels/index';
import { claimNextDeskJob, enqueueFiling, planFinish, recordFilingResult, withdrawFiling, FILING_OUTCOMES } from '@/lib/filing/v2/jobs';
import { memberSafeReason } from '@/lib/filing/channels/reasons';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = new Date('2026-11-12T15:00:00Z');
const JOB = { id: ID(20), claim_id: ID(1), user_id: ID(30), lawsuit_id: ID(2), signature_id: ID(5), status: 'queued' };
const DESK: LaneDecision = {
  lane: 'filing_desk',
  agent: true,
  channel: { type: 'filing_desk', enabled: true, daily_capacity: 10, sla_business_days: 2, min_days_before_deadline: 5, accepts_documents: true, instructions: null },
  policyId: ID(6),
  reasons: [],
  lastDayForAgent: '2026-12-26',
  dueBy: '2026-11-16T15:00:00.000Z',
};
const agent = { id: ID(40), email: null, isAdmin: false, roles: ['filing_agent' as const] };

beforeEach(() => {
  db.rpcCalls = [];
  db.rows = {};
  db.notices = [];
  db.rpcAnswer = () => ({ data: null, error: null });
});

describe('enqueueFiling (filing_enqueue)', () => {
  it('queues the signed lane with the decision’s policy and due date, and sends the queued notice once', async () => {
    db.rpcAnswer = () => ({ data: { created: true, job: JOB, claim: { status: 'queued' } }, error: null });
    const out = await enqueueFiling({ signatureId: ID(5), decision: DESK, actor: 'user', now: NOW });
    expect(out).toMatchObject({ ok: true, created: true, claimStatus: 'queued' });
    expect(db.rpcCalls).toEqual([
      {
        fn: 'filing_enqueue',
        args: { p_signature_id: ID(5), p_channel: 'filing_desk', p_policy_id: ID(6), p_due_by: DESK.dueBy, p_run_after: null, p_actor: 'user', p_detail: {} },
      },
    ]);
    expect(db.notices).toEqual([expect.objectContaining({ kind: 'queued', claimId: ID(1), signatureId: ID(5), eventId: ID(20) })]);
  });

  it('answers the existing job on a repeat (created false) and sends nothing again', async () => {
    db.rpcAnswer = () => ({ data: { created: false, job: JOB, claim: { status: 'queued' } }, error: null });
    expect(await enqueueFiling({ signatureId: ID(5), decision: DESK, actor: 'system', now: NOW })).toMatchObject({ ok: true, created: false });
    expect(db.notices).toEqual([]);
  });

  it('maps a concurrent insert (23505) to the job that won', async () => {
    db.rpcAnswer = () => ({ data: null, error: { code: '23505', message: 'duplicate key' } });
    db.rows = { claim_filing_jobs: JOB, claims: { status: 'queued' } };
    expect(await enqueueFiling({ signatureId: ID(5), decision: DESK, actor: 'system', now: NOW })).toMatchObject({ ok: true, created: false, job: JOB });
  });

  it('refuses a self_file decision without calling the database, and maps CM012 / CM001', async () => {
    const selfFile: LaneDecision = { ...DESK, lane: 'self_file', agent: false, channel: null };
    expect(await enqueueFiling({ signatureId: ID(5), decision: selfFile, actor: 'user', now: NOW })).toMatchObject({ ok: false, code: 'lane_unavailable' });
    expect(db.rpcCalls).toEqual([]);
    db.rpcAnswer = () => ({ data: null, error: { code: 'CM012' } });
    expect(await enqueueFiling({ signatureId: ID(5), decision: DESK, actor: 'user', now: NOW })).toMatchObject({ code: 'lane_unavailable' });
    db.rpcAnswer = () => ({ data: null, error: { code: 'CM001' } });
    expect(await enqueueFiling({ signatureId: ID(5), decision: DESK, actor: 'user', now: NOW })).toMatchObject({ code: 'invalid_transition' });
  });
});

describe('claimNextDeskJob (filing_job_claim_next)', () => {
  it('locks the next desk job to staff:<id> for 30 minutes; null when nothing is due', async () => {
    db.rpcAnswer = () => ({ data: { job: { ...JOB, status: 'in_progress' }, claim: { status: 'filing' } }, error: null });
    expect(await claimNextDeskJob({ staff: agent, now: NOW })).toMatchObject({ ok: true, job: { id: ID(20) } });
    expect(db.rpcCalls[0]).toEqual({
      fn: 'filing_job_claim_next',
      args: { p_channel: 'filing_desk', p_lock_owner: `staff:${ID(40)}`, p_actor: 'staff', p_job_id: null, p_lock_minutes: 30 },
    });
    db.rpcAnswer = () => ({ data: null, error: null });
    expect(await claimNextDeskJob({ staff: agent, jobId: ID(21), now: NOW })).toEqual({ ok: true, job: null });
    expect(db.rpcCalls[1].args.p_job_id).toBe(ID(21));
  });

  it('is for filing agents only', async () => {
    for (const roles of [[], ['legal_reviewer']] as const) {
      expect(await claimNextDeskJob({ staff: { ...agent, isAdmin: true, roles: [...roles] }, now: NOW })).toMatchObject({ ok: false, code: 'role_required' });
    }
    expect(db.rpcCalls).toEqual([]);
  });
});

describe('recordFilingResult (filing_job_finish)', () => {
  const finished = (claimStatus: string) => () => ({ data: { job: { ...JOB, status: 'x' }, claim: { status: claimStatus } }, error: null });

  it.each([
    ['filed', 'ABC-1', 'filed', 'submitted', null],
    ['filed', null, 'filed', 'filed_by_claimmatch', null],
    ['rejected', null, 'rejected', 'filing_rejected', 'not_accepted'],
    ['not_submitted', null, 'queued', 'queued', 'not_submitted'],
    ['needs_member', null, 'cancelled', 'needs_you', 'proof_needed'],
    ['stopped_at_challenge', null, 'cancelled', 'self_file', 'stopped_at_challenge'],
    ['hand_back_to_member', null, 'cancelled', 'self_file', 'deadline_too_close'],
    ['needs_attention', null, 'needs_attention', null, 'unsure_if_submitted'],
    ['exported', null, 'exported', null, null],
  ] as const)('%s (number %s) -> job %s, claim %s, reason %s', async (outcome, number, job, claim, reason) => {
    db.rpcAnswer = finished(claim ?? 'filing');
    const reasonCode = { rejected: 'not_accepted', needs_member: 'proof_needed', hand_back_to_member: 'deadline_too_close', needs_attention: 'unsure_if_submitted' }[outcome as string] ?? null;
    const out = await recordFilingResult({ jobId: ID(20), lockOwner: 'staff:x', outcome, confirmationNumber: number, reasonCode, actor: 'staff', now: NOW });
    expect(out.ok).toBe(true);
    expect(db.rpcCalls[0].fn).toBe('filing_job_finish');
    expect(db.rpcCalls[0].args).toMatchObject({ p_job_id: ID(20), p_lock_owner: 'staff:x', p_job_status: job, p_claim_status: claim, p_confirmation_number: number, p_reason: reason });
  });

  it('covers every outcome of the contract', () => {
    for (const outcome of FILING_OUTCOMES) expect(planFinish({ outcome, reasonCode: 'some_code' })).not.toBeNull();
  });

  it('never puts a staff member’s own code where the member can read it', async () => {
    db.rpcAnswer = finished('filing_rejected');
    await recordFilingResult({ jobId: ID(20), lockOwner: 'staff:x', outcome: 'rejected', reasonCode: 'administrator_called_it_fraud', actor: 'staff', now: NOW });
    expect(db.rpcCalls[0].args).toMatchObject({ p_reason: 'not_accepted', p_result: { staff_reason_code: 'administrator_called_it_fraud' } });
    db.rpcCalls = [];
    await recordFilingResult({ jobId: ID(20), lockOwner: 'staff:x', outcome: 'hand_back_to_member', reasonCode: 'kill_switch', actor: 'system', now: NOW });
    expect(db.rpcCalls[0].args.p_reason).toBe('not_offered_for_settlement');
    expect(memberSafeReason('objection_received', 'not_accepted')).toBe('not_offered_for_settlement');
    expect(memberSafeReason('Robert said no', 'not_accepted')).toBe('not_accepted');
  });

  it('requires a reason where the contract does, before touching the database', async () => {
    for (const outcome of ['rejected', 'needs_member', 'hand_back_to_member', 'needs_attention'] as const) {
      expect(await recordFilingResult({ jobId: ID(20), lockOwner: 'staff:x', outcome, actor: 'staff', now: NOW })).toMatchObject({ ok: false, code: 'invalid_request' });
    }
    expect(db.rpcCalls).toEqual([]);
  });

  it('loses the race cleanly: another lock holder (CM005) or a job already closed (CM013)', async () => {
    db.rpcAnswer = () => ({ data: null, error: { code: 'CM005' } });
    expect(await recordFilingResult({ jobId: ID(20), lockOwner: 'staff:me', outcome: 'filed', actor: 'staff', now: NOW })).toMatchObject({ ok: false, code: 'lock_lost' });
    db.rpcAnswer = () => ({ data: null, error: { code: 'CM013' } });
    expect(await recordFilingResult({ jobId: ID(20), lockOwner: null, outcome: 'not_submitted', actor: 'staff', now: NOW })).toMatchObject({ ok: false, code: 'invalid_transition' });
    expect(db.notices).toEqual([]);
  });

  it('tells the member when it went out, needs them, was refused or is handed back; not for staff-only steps', async () => {
    const send = async (outcome: (typeof FILING_OUTCOMES)[number], reasonCode: string | null = 'some_code') => {
      db.rpcAnswer = finished('x');
      await recordFilingResult({ jobId: ID(20), lockOwner: null, outcome, reasonCode, actor: 'staff', now: NOW });
    };
    for (const o of FILING_OUTCOMES) await send(o);
    expect(db.notices.map((n) => n.kind)).toEqual(['filed', 'not_accepted', 'needs_you', 'handed_back', 'handed_back']);
  });
});

describe('withdrawFiling (filing_move_claim)', () => {
  const moved = (changed = true) => () => ({
    data: { changed, claim: { status: 'self_file', lawsuit_id: ID(2) }, job_cancelled: ID(20), signature_voided: ID(5) },
    error: null,
  });

  it('moves the claim, cancels the queued job and voids the signature in one call', async () => {
    db.rpcAnswer = moved();
    const out = await withdrawFiling({ claimId: ID(1), userId: ID(30), to: 'self_file', reasonCode: 'member_choice', actor: 'user', now: NOW });
    expect(out).toEqual({ ok: true, changed: true, claimStatus: 'self_file', jobCancelled: ID(20), signatureVoided: ID(5) });
    expect(db.rpcCalls[0]).toEqual({
      fn: 'filing_move_claim',
      args: { p_claim_id: ID(1), p_user_id: ID(30), p_to_status: 'self_file', p_reason: 'member_choice', p_actor: 'user', p_detail: {} },
    });
    expect(db.notices).toEqual([]);
  });

  it('refuses while a submission may have happened (CM005 -> filing_in_progress)', async () => {
    db.rpcAnswer = () => ({ data: null, error: { code: 'CM005' } });
    expect(await withdrawFiling({ claimId: ID(1), userId: ID(30), to: 'withdrawn', reasonCode: 'changed_mind', actor: 'user', now: NOW })).toMatchObject({
      ok: false,
      code: 'filing_in_progress',
    });
  });

  it('keeps internal causes out of member-readable rows and notifies on system hand-backs', async () => {
    db.rpcAnswer = moved();
    await withdrawFiling({ claimId: ID(1), userId: ID(30), to: 'self_file', reasonCode: 'kill_switch', actor: 'system', now: NOW });
    expect(db.rpcCalls[0].args.p_reason).toBe('not_offered_for_settlement');
    expect(db.notices).toEqual([expect.objectContaining({ kind: 'handed_back', reason: 'not_offered_for_settlement' })]);
    db.rpcAnswer = moved(false);
    await withdrawFiling({ claimId: ID(1), userId: ID(30), to: 'self_file', reasonCode: 'deadline_too_close', actor: 'system', now: NOW });
    expect(db.notices).toHaveLength(1);
  });

  it('validates ids before the database sees them', async () => {
    expect(await withdrawFiling({ claimId: 'nope', userId: ID(30), to: 'withdrawn', reasonCode: 'x', actor: 'user', now: NOW })).toMatchObject({ code: 'invalid_request' });
    expect(db.rpcCalls).toEqual([]);
  });
});
