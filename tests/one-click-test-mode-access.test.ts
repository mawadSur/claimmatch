import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One-click test mode: who gets one-click (src/lib/filing/one-click-access.ts)
// and that every gate asks that one helper. Nothing reaches Supabase.
const m = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  staffForRequest: vi.fn(),
  runFilingCron: vi.fn(),
  rpc: vi.fn(),
  notifyMember: vi.fn(),
  /** claim_packets.is_test of the signed packet (0047); null: unreadable. */
  packetIsTest: { value: false as boolean | null },
}));
vi.mock('@/lib/supabase/request-user', () => ({ getRequestUser: m.getRequestUser }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: () => ({
    rpc: m.rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'eq']) chain[op] = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'claim_signatures') return { data: { packet_id: '00000000-0000-4000-8000-000000000007' }, error: null };
        if (table === 'claim_packets') {
          return { data: m.packetIsTest.value === null ? null : { is_test: m.packetIsTest.value }, error: null };
        }
        return { data: null, error: null };
      };
      return chain;
    },
  }),
}));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/staff-roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staff-roles')>()),
  staffForRequest: m.staffForRequest,
}));
vi.mock('@/lib/filing/channels/cron', () => ({ runFilingCron: m.runFilingCron }));
vi.mock('@/lib/filing/channels/member-notices', () => ({ notifyMember: m.notifyMember }));

import { GET as cronGet } from '@/app/api/cron/filing/route';
import { GET as configGet } from '@/app/api/mobile/config/route';
import { guard } from '@/app/api/admin/filing/_lib/http';
import { loadOneClickClaimPage } from '@/components/filing/claim-page-data';
import { loadOneClickDashboard } from '@/components/filing/dashboard-data';
import { oneClickEnabledFor, oneClickMayBeOn, oneClickMode } from '@/lib/filing/one-click-access';
import { beginFilingRoute } from '@/lib/filing/v2/http';
import { enqueueFiling } from '@/lib/filing/v2/jobs';

const TESTER = 'tester@lawsuitai.example';
const MEMBER = 'someone@example.com';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setMode(mode: 'off' | 'test' | 'live' | 'both') {
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', mode === 'live' || mode === 'both' ? '1' : '');
  vi.stubEnv('ONE_CLICK_FILING_TEST_MODE', mode === 'test' || mode === 'both' ? '1' : '');
}

function signedIn(email: string | null) {
  m.getRequestUser.mockResolvedValue(
    email ? { user: { id: ID(1), email }, supabase: {}, via: 'bearer' } : { user: null, supabase: null, via: 'bearer' },
  );
}

beforeEach(() => {
  for (const fn of [m.getRequestUser, m.staffForRequest, m.runFilingCron, m.rpc, m.notifyMember]) fn.mockReset();
  m.packetIsTest.value = false;
  vi.stubEnv('INTERNAL_EMAILS', `${TESTER}, qa@lawsuitai.example`);
});
afterEach(() => vi.unstubAllEnvs());

describe('oneClickEnabledFor (the one gate)', () => {
  it('off: nobody, not even testers, staff or the cron', () => {
    setMode('off');
    expect(oneClickMode()).toBe('off');
    expect(oneClickMayBeOn()).toBe(false);
    expect(oneClickEnabledFor({ kind: 'member', email: TESTER })).toBe(false);
    expect(oneClickEnabledFor({ kind: 'staff', isStaff: true })).toBe(false);
    expect(oneClickEnabledFor({ kind: 'system' })).toBe(false);
  });

  it('test mode: INTERNAL_EMAILS testers (any case), staff and the cron; never other members or visitors', () => {
    setMode('test');
    expect(oneClickMode()).toBe('test');
    expect(oneClickEnabledFor({ kind: 'member', email: ' Tester@LawsuitAI.example ' })).toBe(true);
    expect(oneClickEnabledFor({ kind: 'member', email: MEMBER })).toBe(false);
    expect(oneClickEnabledFor({ kind: 'member', email: null })).toBe(false);
    expect(oneClickEnabledFor(null)).toBe(false);
    expect(oneClickEnabledFor({ kind: 'staff', isStaff: false })).toBe(false);
    expect(oneClickEnabledFor({ kind: 'staff', isStaff: true })).toBe(true);
    expect(oneClickEnabledFor({ kind: 'system' })).toBe(true);
  });

  it('test mode with no INTERNAL_EMAILS: no member at all', () => {
    setMode('test');
    vi.stubEnv('INTERNAL_EMAILS', '');
    expect(oneClickEnabledFor({ kind: 'member', email: TESTER })).toBe(false);
  });

  it('live, and both flags on: everyone, as before', () => {
    for (const mode of ['live', 'both'] as const) {
      setMode(mode);
      expect(oneClickMode()).toBe('live');
      expect(oneClickEnabledFor({ kind: 'member', email: MEMBER })).toBe(true);
      expect(oneClickEnabledFor(null)).toBe(true);
    }
  });
});

describe('member API (beginFilingRoute)', () => {
  const req = () => new Request('https://lawsuitai.org/api/filing/claims', { headers: { authorization: 'Bearer t' } });

  it('off: 404 before reading who is calling', async () => {
    setMode('off');
    const begin = await beginFilingRoute(req(), 'read');
    expect(begin.ok).toBe(false);
    if (!begin.ok) expect(begin.response.status).toBe(404);
    expect(m.getRequestUser).not.toHaveBeenCalled();
  });

  it('test mode: a member outside INTERNAL_EMAILS gets the same 404; a tester gets in', async () => {
    setMode('test');
    signedIn(MEMBER);
    const real = await beginFilingRoute(req(), 'read');
    expect(real.ok).toBe(false);
    if (!real.ok) expect(real.response.status).toBe(404);
    signedIn(TESTER);
    expect((await beginFilingRoute(req(), 'read')).ok).toBe(true);
    signedIn(null);
    const out = await beginFilingRoute(req(), 'read');
    if (!out.ok) expect(out.response.status).toBe(401);
  });

  it('live: any signed-in member, as before', async () => {
    setMode('live');
    signedIn(MEMBER);
    expect((await beginFilingRoute(req(), 'read')).ok).toBe(true);
  });
});

describe('staff API (guard)', () => {
  const req = () => new Request('https://lawsuitai.org/api/admin/filing/jobs');
  const staff = { id: ID(7), email: 'agent@firm.example', isAdmin: false, roles: ['filing_agent'] };

  it('off: 404 before the staff check', async () => {
    setMode('off');
    const res = await guard(req(), () => true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.res.status).toBe(404);
    expect(m.staffForRequest).not.toHaveBeenCalled();
  });

  it('test mode: staff with a role get the console; non-staff still 403', async () => {
    setMode('test');
    m.staffForRequest.mockResolvedValueOnce({ ok: true, staff });
    expect((await guard(req(), () => true)).ok).toBe(true);
    m.staffForRequest.mockResolvedValueOnce({ ok: false, status: 403 });
    const denied = await guard(req(), () => true);
    if (!denied.ok) expect(denied.res.status).toBe(403);
  });
});

describe('member pages', () => {
  it('test mode: the dashboard reads nothing one-click for a member outside INTERNAL_EMAILS', async () => {
    setMode('test');
    const supabase = { from: vi.fn() };
    const out = await loadOneClickDashboard({ supabase: supabase as never, userId: ID(1), email: MEMBER, now: new Date(), strongMatchIds: [ID(2)] });
    expect(out).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('GET /api/mobile/config', () => {
  const get = (auth?: string) => configGet(new Request('https://lawsuitai.org/api/mobile/config', { headers: auth ? { authorization: auth } : {} }));
  const flagOf = async (res: Response) => ((await res.json()) as { flags: Record<string, boolean> }).flags.ONE_CLICK_FILING_ENABLED;

  it('off and test mode without a token: one-click off, and no sign-in read', async () => {
    setMode('off');
    expect(await flagOf(await get('Bearer t'))).toBe(false);
    setMode('test');
    expect(await flagOf(await get())).toBe(false);
    expect(m.getRequestUser).not.toHaveBeenCalled();
  });

  it('test mode: on only for a tester token', async () => {
    setMode('test');
    signedIn(MEMBER);
    expect(await flagOf(await get('Bearer t'))).toBe(false);
    signedIn(TESTER);
    expect(await flagOf(await get('Bearer t'))).toBe(true);
  });

  it('live: on for everyone without reading the token', async () => {
    setMode('live');
    expect(await flagOf(await get())).toBe(true);
    expect(await flagOf(await get('Bearer t'))).toBe(true);
    expect(m.getRequestUser).not.toHaveBeenCalled();
  });

  it('test mode: a rejected, malformed or uncheckable token still gets the public config (200, one-click off)', async () => {
    setMode('test');
    const answers = [
      { user: null, supabase: null, via: 'bearer' },
      { user: null, supabase: null, via: 'bearer', unavailable: true },
    ];
    for (const answer of answers) {
      m.getRequestUser.mockResolvedValueOnce(answer);
      const res = await get('Bearer t');
      expect(res.status).toBe(200);
      expect(await flagOf(res)).toBe(false);
    }
    m.getRequestUser.mockRejectedValueOnce(new Error('auth exploded'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const thrown = await get('Bearer');
    expect(thrown.status).toBe(200);
    expect(await flagOf(thrown)).toBe(false);
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/exploded/);
    errorLog.mockRestore();
  });

  it('gives the same answer as the claim screen gate for the same account', async () => {
    for (const mode of ['off', 'test', 'live'] as const) {
      setMode(mode);
      for (const email of [TESTER, MEMBER]) {
        signedIn(email);
        expect(await flagOf(await get('Bearer t')), `${mode} ${email}`).toBe(oneClickEnabledFor({ kind: 'member', email }));
      }
    }
  });
});

describe('GET /api/mobile/claim/[slug] (the app claim screen) uses the same gate', () => {
  const args = (email: string) => ({
    supabase: { from: vi.fn() } as never,
    userId: ID(1),
    accountEmail: email,
    slug: 'lawsuit-ai-one-click-test-settlement',
    lawsuitId: ID(2),
    claim: null,
    context: { openForClaims: true, deadlinePassed: false, fictional: true } as never,
    now: new Date(),
  });

  it('test mode: no one-click for a member outside INTERNAL_EMAILS, before reading anything; a tester gets it', async () => {
    setMode('test');
    const member = args(MEMBER);
    expect(await loadOneClickClaimPage(member)).toBeNull();
    expect((member.supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    // A tester gets the one-click state (no "Start my claim" on a fictional settlement).
    expect(await loadOneClickClaimPage(args(TESTER))).toMatchObject({ canStart: false, accountEmail: TESTER });
  });

  it('off: nobody; live: everyone', async () => {
    setMode('off');
    expect(await loadOneClickClaimPage(args(TESTER))).toBeNull();
    setMode('live');
    expect(await loadOneClickClaimPage(args(MEMBER))).toMatchObject({ accountEmail: MEMBER });
  });
});

describe('GET /api/cron/filing', () => {
  const req = () => new Request('https://lawsuitai.org/api/cron/filing', { headers: { authorization: 'Bearer s' } });

  it('404 with both flags off; runs (sandboxed) in test mode', async () => {
    vi.stubEnv('CRON_SECRET', 's');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    setMode('off');
    expect((await cronGet(req())).status).toBe(404);
    setMode('test');
    m.runFilingCron.mockResolvedValue({ ok: true, runId: 'r', steps: {} });
    expect((await cronGet(req())).status).toBe(200);
    expect(m.runFilingCron).toHaveBeenCalledTimes(1);
  });
});

describe('enqueueFiling', () => {
  const decision = {
    lane: 'administrator_email',
    agent: true,
    channel: { type: 'administrator_email', enabled: true },
    policyId: null,
    reasons: [],
    lastDayForAgent: null,
    dueBy: null,
  } as never;
  const job = { id: ID(20), claim_id: ID(21), user_id: ID(1), lawsuit_id: ID(2), signature_id: ID(5) };

  it('test mode marks the job through filing_enqueue_test; live keeps filing_enqueue', async () => {
    m.rpc.mockResolvedValue({ data: { created: true, job: { ...job, is_test: true }, claim: { status: 'queued' } }, error: null });
    setMode('test');
    await enqueueFiling({ signatureId: ID(5), decision, actor: 'user', now: new Date() });
    expect(m.rpc.mock.calls[0][0]).toBe('filing_enqueue_test');
    setMode('both');
    await enqueueFiling({ signatureId: ID(5), decision, actor: 'user', now: new Date() });
    expect(m.rpc.mock.calls[1][0]).toBe('filing_enqueue');
  });

  it('once live, a leftover test-mode packet is never queued for real (issue #53)', async () => {
    m.rpc.mockResolvedValue({ data: { created: true, job, claim: { status: 'queued' } }, error: null });
    for (const mode of ['live', 'both'] as const) {
      setMode(mode);
      m.packetIsTest.value = true;
      expect(await enqueueFiling({ signatureId: ID(5), decision, actor: 'system', now: new Date() })).toMatchObject({ ok: false, code: 'lane_unavailable' });
      m.packetIsTest.value = null;
      expect(await enqueueFiling({ signatureId: ID(5), decision, actor: 'system', now: new Date() })).toMatchObject({ ok: false, code: 'lane_unavailable' });
    }
    expect(m.rpc).not.toHaveBeenCalled();
    // In test mode the same packet still goes through filing_enqueue_test.
    setMode('test');
    m.packetIsTest.value = true;
    await enqueueFiling({ signatureId: ID(5), decision, actor: 'system', now: new Date() });
    expect(m.rpc.mock.calls.map((c) => c[0])).toEqual(['filing_enqueue_test']);
  });
});
