import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/admin/filing/desk/next: a job Lawsuit AI may no longer file (a
// kill switch, an objection, a policy change, the cutoff) goes straight back
// to the member instead of to the desk. Jobs, the desk screen and the staff
// session are faked: nothing reaches Supabase.
const m = vi.hoisted(() => ({
  claimNextDeskJob: vi.fn(),
  recordFilingResult: vi.fn(),
  deskView: vi.fn(),
  recordStaffAccess: vi.fn(),
  loadJobContext: vi.fn(),
}));
const STAFF = { id: '00000000-0000-4000-8000-000000000040', email: 'agent@claimmatch.test', isAdmin: false, roles: ['filing_agent'] };

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: () => ({}) }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/filing/v2/jobs', () => ({
  claimNextDeskJob: m.claimNextDeskJob,
  recordFilingResult: m.recordFilingResult,
  claimNextJob: vi.fn(),
  enqueueFiling: vi.fn(),
  withdrawFiling: vi.fn(),
  DESK_LOCK_MINUTES: 30,
}));
vi.mock('@/lib/staff-roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staff-roles')>()),
  recordStaffAccess: m.recordStaffAccess,
}));
vi.mock('@/app/api/admin/filing/_lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/admin/filing/_lib/http')>()),
  guard: async () => ({ ok: true, staff: STAFF }),
}));
vi.mock('@/lib/filing/channels/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/channels/context')>()),
  loadJobContext: m.loadJobContext,
}));
vi.mock('@/app/api/admin/filing/_lib/desk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/admin/filing/_lib/desk')>()),
  deskView: m.deskView,
}));

import { POST as deskNext } from '@/app/api/admin/filing/desk/next/route';
import { deskHandBackReason } from '@/app/api/admin/filing/_lib/desk';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const job = (n: number) => ({ id: ID(n), claim_id: ID(n + 100), user_id: ID(30), lawsuit_id: ID(2), status: 'in_progress', lock_owner: `staff:${STAFF.id}` });
const issue = (rule_id: string, code: string, severity: 'block' | 'warn' = 'block', audience: 'member' | 'staff' = 'member') => ({
  rule_id,
  source: 'global',
  severity,
  code,
  message: 'x',
  field: null,
  audience,
});
const KILL_SWITCH = { outcome: 'block', issues: [issue('global.lane_allowed', 'not_offered_for_settlement'), issue('global.lane_allowed', 'kill_switch', 'block', 'staff')] };
const CUTOFF = { outcome: 'block', issues: [issue('global.deadline_cutoff', 'deadline_too_close')] };
const MEMBER_FIXABLE = { outcome: 'block', issues: [issue('global.required_answers', 'required_missing')] };
const ENGINE_DOWN = { outcome: 'block', issues: [issue('global.engine', 'engine_unavailable', 'block', 'staff')] };
const CLEAN = { outcome: 'pass', issues: [] };
const view = (n: number, checks: unknown) => ({ ok: true, view: { job: { id: ID(n) }, checks } });

function take(body: unknown = {}) {
  return deskNext(
    new Request('https://lawsuitai.org/api/admin/filing/desk/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  for (const fn of Object.values(m)) fn.mockReset();
  m.recordStaffAccess.mockResolvedValue(true);
  m.recordFilingResult.mockResolvedValue({ ok: true, job: {}, claimStatus: 'self_file' });
});

describe('deskHandBackReason', () => {
  it('hands back only blocks nobody can fix by editing the claim', () => {
    expect(deskHandBackReason(KILL_SWITCH as never)).toBe('not_offered_for_settlement');
    expect(deskHandBackReason(CUTOFF as never)).toBe('deadline_too_close');
    expect(deskHandBackReason(MEMBER_FIXABLE as never)).toBeNull();
    expect(deskHandBackReason(ENGINE_DOWN as never)).toBeNull();
    expect(deskHandBackReason(CLEAN as never)).toBeNull();
    expect(deskHandBackReason({ outcome: 'warn', issues: [issue('global.duplicate_identity', 'duplicate_identity', 'warn', 'staff')] } as never)).toBeNull();
  });
});

describe('POST /api/admin/filing/desk/next', () => {
  it('a kill-switched job goes back to the member, never to the desk, and the next due job is taken', async () => {
    m.claimNextDeskJob
      .mockResolvedValueOnce({ ok: true, job: job(20) })
      .mockResolvedValueOnce({ ok: true, job: job(21) })
      .mockResolvedValue({ ok: true, job: null });
    m.deskView.mockResolvedValueOnce(view(20, KILL_SWITCH)).mockResolvedValueOnce(view(21, CLEAN));
    const res = await take();
    expect(res.status).toBe(200);
    expect((await res.json()).job).toMatchObject({ job: { id: ID(21) } });
    expect(m.recordFilingResult).toHaveBeenCalledTimes(1);
    expect(m.recordFilingResult.mock.calls[0][0]).toMatchObject({
      jobId: ID(20),
      lockOwner: `staff:${STAFF.id}`,
      outcome: 'hand_back_to_member',
      reasonCode: 'not_offered_for_settlement',
      actor: 'staff',
      result: { handed_back_on_take: true, blocked_rules: ['global.lane_allowed', 'global.lane_allowed'] },
    });
    expect(m.recordStaffAccess.mock.calls.map(([e]) => [e.action, e.jobId])).toEqual([
      ['take_job', ID(20)],
      ['take_job', ID(21)],
    ]);
  });

  it('past the cutoff the member is told the deadline is too close; nothing left answers job null', async () => {
    m.claimNextDeskJob.mockResolvedValueOnce({ ok: true, job: job(20) }).mockResolvedValue({ ok: true, job: null });
    m.deskView.mockResolvedValueOnce(view(20, CUTOFF));
    expect(await (await take()).json()).toEqual({ job: null });
    expect(m.recordFilingResult.mock.calls[0][0]).toMatchObject({ outcome: 'hand_back_to_member', reasonCode: 'deadline_too_close' });
  });

  it('shows a block the member can fix, or checks that could not run, to the desk (it records the outcome)', async () => {
    for (const checks of [MEMBER_FIXABLE, ENGINE_DOWN]) {
      m.claimNextDeskJob.mockReset().mockResolvedValueOnce({ ok: true, job: job(20) });
      m.deskView.mockReset().mockResolvedValueOnce(view(20, checks));
      expect((await (await take()).json()).job).toMatchObject({ job: { id: ID(20) }, checks });
    }
    expect(m.recordFilingResult).not.toHaveBeenCalled();
  });

  it('a job asked for by id that is handed back answers job null without taking another', async () => {
    m.claimNextDeskJob.mockResolvedValueOnce({ ok: true, job: job(20) }).mockResolvedValue({ ok: true, job: job(21) });
    m.deskView.mockResolvedValueOnce(view(20, KILL_SWITCH));
    expect(await (await take({ job_id: ID(20) })).json()).toEqual({ job: null });
    expect(m.claimNextDeskJob).toHaveBeenCalledTimes(1);
    expect(m.claimNextDeskJob.mock.calls[0][0]).toMatchObject({ jobId: ID(20) });
  });

  it('shows the blocked job when it cannot be handed back (the screen refuses "filed")', async () => {
    m.claimNextDeskJob.mockResolvedValueOnce({ ok: true, job: job(20) });
    m.deskView.mockResolvedValueOnce(view(20, KILL_SWITCH));
    m.recordFilingResult.mockResolvedValueOnce({ ok: false, code: 'service_unavailable', message: 'x' });
    expect((await (await take()).json()).job).toMatchObject({ job: { id: ID(20) }, checks: { outcome: 'block' } });
  });
});

describe('the desk screen when the settlement cannot be read', () => {
  it('puts a job taken this instant back in the queue (nothing was shown); an open job goes to a person', async () => {
    const actual = await vi.importActual<typeof import('@/app/api/admin/filing/_lib/desk')>('@/app/api/admin/filing/_lib/desk');
    m.loadJobContext.mockResolvedValue({ ok: false, reason: 'settlement_unreadable' });
    const now = new Date('2026-11-12T15:00:00Z');
    expect(await actual.deskView({} as never, job(20) as never, STAFF as never, now, { justTaken: true })).toEqual({
      ok: false,
      code: 'service_unavailable',
    });
    expect(m.recordFilingResult.mock.calls[0][0]).toMatchObject({ jobId: ID(20), lockOwner: `staff:${STAFF.id}`, outcome: 'not_submitted' });
    await actual.deskView({} as never, job(20) as never, STAFF as never, now);
    expect(m.recordFilingResult.mock.calls[1][0]).toMatchObject({ outcome: 'needs_attention', reasonCode: 'settlement_unreadable' });
  });
});
