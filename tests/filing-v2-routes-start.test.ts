import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDb } from './filing-v2-fake';
import type { JevKnobs, JobKnobs } from './filing-v2-fixtures';

// Member filing API (B2): flag, sign-in (cookie and bearer), limits, start
// and resume, the claim view, other members' claims, the list and the preview.
const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  cookieUser: null as { id: string } | null,
  bearerUser: null as { id: string } | null,
  authDown: false,
  claims: null as Record<string, unknown> | null,
  rateOk: true,
  jev: { runs: [] } as JevKnobs,
  jobs: null as unknown as JobKnobs,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...h.db.client('cookie', h.cookieUser?.id ?? null),
    auth: {
      getUser: async () => ({ data: { user: h.cookieUser } }),
      getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null, error: null }),
    },
  }),
  createServiceClient: () => h.db.client('service', null),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    ...h.db.client('bearer', h.bearerUser?.id ?? null),
    auth: {
      getUser: async () =>
        h.bearerUser
          ? { data: { user: h.bearerUser }, error: null }
          : { data: { user: null }, error: h.authDown ? { name: 'AuthRetryableFetchError', status: 0 } : { name: 'AuthApiError', status: 403 } },
      getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null, error: null }),
    },
  }),
}));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => (h.rateOk ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: 42 }) }));
vi.mock('@/lib/admin', () => ({ getAdminUser: async () => null, adminDeniedPath: () => '/login' }));
vi.mock('@/lib/jev/index', async () => {
  const f = await import('./filing-v2-fixtures');
  return { JEV_ENGINE_VERSION: 'jev-1', runJev: (i: never) => f.fakeRunJev(h.jev, i), validateJevRules: () => ({ ok: true, rules: [] }) };
});
vi.mock('@/lib/filing/channels/index', async () => {
  const f = await import('./filing-v2-fixtures');
  return { chooseLane: f.fakeChooseLane, toLaneView: f.fakeToLaneView, resolveEffectivePolicy: f.fakeResolvePolicy, getChannelAdapter: vi.fn() };
});
vi.mock('@/lib/filing/v2/jobs', async () => {
  const f = await import('./filing-v2-fixtures');
  return { FILING_OUTCOMES: [], enqueueFiling: (i: never) => f.fakeEnqueue(h.jobs, i), withdrawFiling: (i: never) => f.fakeWithdraw(h.jobs, i) };
});

import { GET as LIST, POST as START } from '@/app/api/filing/claims/route';
import { GET as PREVIEW } from '@/app/api/filing/claims/preview/route';
import { GET as VIEW } from '@/app/api/filing/claims/[claimId]/route';
import { PATCH } from '@/app/api/filing/claims/[claimId]/packet/route';
import { POST as SIGN } from '@/app/api/filing/claims/[claimId]/sign/route';
import { POST as DOCS } from '@/app/api/filing/claims/[claimId]/documents/route';
import { POST as CONSENT } from '@/app/api/filing/claims/[claimId]/esign-consent/route';
import { POST as WITHDRAW } from '@/app/api/filing/claims/[claimId]/withdraw/route';
import { ClaimFilingListResponseSchema, ClaimFilingResponseSchema, LanePreviewResponseSchema } from '@/lib/filing/v2/contract';
import { previewLanes } from '@/lib/filing/v2/view';
import { FakeDb as Db } from './filing-v2-fake';
import { BEARER, LAWSUIT, NOW, SPEC_ID, USER_A, USER_B, getRequest, jsonRequest, seedSettlement, signInClaims } from './filing-v2-fixtures';

const params = (claimId: string) => ({ params: Promise.resolve({ claimId }) });

async function body(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(res.headers.get('vary')).toBe('Authorization, Cookie');
  return (await res.json()) as Record<string, any>;
}

async function start(lawsuitId = LAWSUIT, headers: Record<string, string> = {}) {
  return START(jsonRequest('/api/filing/claims', 'POST', { lawsuit_id: lawsuitId }, headers));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  h.db = new Db();
  seedSettlement(h.db);
  h.cookieUser = { id: USER_A };
  h.bearerUser = null;
  h.authDown = false;
  h.claims = signInClaims(USER_A);
  h.rateOk = true;
  h.jev = { runs: [] };
  h.jobs = { db: h.db, enqueueFails: false, enqueued: [], withdrawn: [] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('flag off', () => {
  it('answers 404 on every route before sign-in or any read', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '');
    h.cookieUser = null;
    const id = '00000000-0000-4000-8000-0000000000c1';
    const responses = [
      await LIST(getRequest('/api/filing/claims')),
      await start(),
      await PREVIEW(getRequest(`/api/filing/claims/preview?lawsuit_id=${LAWSUIT}`)),
      await VIEW(getRequest(`/api/filing/claims/${id}`), params(id)),
      await PATCH(jsonRequest(`/api/filing/claims/${id}/packet`, 'PATCH', { revision: 1 }), params(id)),
      await SIGN(jsonRequest(`/api/filing/claims/${id}/sign`, 'POST', {}), params(id)),
      await DOCS(jsonRequest(`/api/filing/claims/${id}/documents`, 'POST', {}), params(id)),
      await CONSENT(jsonRequest(`/api/filing/claims/${id}/esign-consent`, 'POST', {}), params(id)),
      await WITHDRAW(jsonRequest(`/api/filing/claims/${id}/withdraw`, 'POST', {}), params(id)),
    ];
    for (const res of responses) expect(await body(res, 404)).toEqual({ error: 'We couldn’t find that.', code: 'not_found' });
    expect(h.db.writes).toEqual([]);
    expect(h.db.rpcCalls).toEqual([]);
  });
});

describe('sign-in and limits', () => {
  it('answers 401 without a session and 503 when Auth cannot check a token', async () => {
    h.cookieUser = null;
    expect(await body(await start(), 401)).toMatchObject({ code: 'unauthorized' });
    h.authDown = true;
    expect(await body(await start(LAWSUIT, { authorization: BEARER }), 503)).toMatchObject({ code: 'auth_unavailable' });
    h.authDown = false;
    expect(await body(await start(LAWSUIT, { authorization: 'Bearer not-a-jwt' }), 401)).toMatchObject({ code: 'unauthorized' });
    expect(h.db.rows('claims')).toHaveLength(0);
  });

  it('serves the app’s bearer token as its own user, never the cookie’s', async () => {
    h.bearerUser = { id: USER_B };
    h.claims = signInClaims(USER_B);
    const res = await body(await start(LAWSUIT, { authorization: BEARER }), 201);
    expect(res.filing.claim.status).toBe('preparing');
    expect(h.db.rows('claims').map((c) => c.user_id)).toEqual([USER_B]);
    const list = await body(await LIST(getRequest('/api/filing/claims', { authorization: BEARER })), 200);
    expect(list.items).toHaveLength(1);
    expect((await body(await LIST(getRequest('/api/filing/claims')), 200)).items).toEqual([]);
  });

  it('rate limits with Retry-After', async () => {
    h.rateOk = false;
    const res = await start();
    expect(res.headers.get('retry-after')).toBe('42');
    expect(await body(res, 429)).toMatchObject({ code: 'rate_limited', retry_after: 42 });
  });

  it('takes JSON only and checks the body', async () => {
    expect(await body(await START(jsonRequest('/api/filing/claims', 'POST', { lawsuit_id: LAWSUIT }, { 'content-type': 'text/plain' })), 415)).toMatchObject({ code: 'unsupported_media_type' });
    const bad = await body(await START(jsonRequest('/api/filing/claims', 'POST', { lawsuit_id: 'nope', extra: 1 })), 400);
    expect(bad.code).toBe('invalid_request');
    expect(bad.fields.length).toBeGreaterThan(0);
    expect(await body(await START(jsonRequest('/api/filing/claims', 'POST', '{not json')), 400)).toMatchObject({ code: 'invalid_request' });
  });
});

describe('POST /api/filing/claims', () => {
  it('starts a claim on the agent lane with its packet on the approved spec', async () => {
    const res = await body(await start(), 201);
    expect(ClaimFilingResponseSchema.safeParse(res).success).toBe(true);
    const view = res.filing;
    expect(view.claim.status).toBe('preparing');
    expect(view.lane).toMatchObject({ lane: 'filing_desk', agent: true, reasons: [] });
    expect(view.packet).toMatchObject({ status: 'open', revision: 1, complete: false, spec: { id: SPEC_ID, version: 1 } });
    expect(view.authorization.text_version).toBe('agent-auth-v1');
    expect(view.actions).toMatchObject({ can_edit: true, can_sign: false, needs_esign_consent: true, needs_fresh_sign_in: false });
    expect(view.timeline).toEqual([expect.objectContaining({ status: 'preparing', actor: 'you', action: 'start_one_click' })]);
    expect(h.db.rows('jev_runs')).toHaveLength(1);
    // Member writes only through the service role and the server functions.
    expect(h.db.writes.filter((w) => w.client !== 'service')).toEqual([]);
  });

  it('returns the same claim on a repeat (200) and creates no second packet', async () => {
    const first = await body(await start(), 201);
    const again = await body(await start(), 200);
    expect(again.filing.claim.id).toBe(first.filing.claim.id);
    expect(h.db.rows('claim_packets')).toHaveLength(1);
  });

  it('starts on the self-file lane when the settlement has no agent policy, with the copy data ready', async () => {
    h.db = new Db();
    seedSettlement(h.db, { policy: null });
    h.jobs.db = h.db;
    const view = (await body(await start(), 201)).filing;
    expect(view.claim.status).toBe('self_file');
    expect(view.lane).toEqual({ lane: 'self_file', agent: false, reasons: ['not_offered_for_settlement'], last_day_for_agent: null, deadline: '2026-12-31' });
    expect(view.authorization).toBeNull();
    expect(view.packet.items.map((i: { path: string }) => i.path)).toContain('member.legal_name');
    expect(view.actions.can_sign).toBe(false);
  });

  it('keeps possible (state-only) matches and uncovered states on the self-file lane', async () => {
    h.db = new Db();
    seedSettlement(h.db, { settlement: { eligibility: { states: ['CA'] } } });
    h.jobs.db = h.db;
    expect((await body(await start(), 201)).filing.lane).toMatchObject({ lane: 'self_file', reasons: ['not_offered_for_settlement'] });

    h.db = new Db();
    seedSettlement(h.db);
    h.jobs.db = h.db;
    h.db.find('profiles', (p) => p.id === USER_A)!.state = 'TX';
    const view = (await body(await start(), 201)).filing;
    expect(view.claim.status).toBe('self_file');
    expect(view.lane.reasons).toEqual(['state_not_covered']);
  });

  it('refuses closed, unpublished and missing settlements, and claims already filed', async () => {
    h.db.find('lawsuits', () => true)!.deadline = '2026-11-01';
    expect(await body(await start(), 409)).toMatchObject({ code: 'settlement_closed' });
    h.db.find('lawsuits', () => true)!.review_status = 'pending_review';
    expect(await body(await start(), 404)).toMatchObject({ code: 'not_found' });
    expect(await body(await start('00000000-0000-4000-8000-000000000999'), 404)).toMatchObject({ code: 'not_found' });
    h.db.find('lawsuits', () => true)!.review_status = 'published';
    h.db.find('lawsuits', () => true)!.deadline = '2026-12-31';
    h.db.insertRow('claims', { user_id: USER_A, lawsuit_id: LAWSUIT, lawsuit_title: 'x', status: 'reported_filed' });
    expect(await body(await start(), 409)).toMatchObject({ code: 'already_filed' });
    expect(h.db.rows('claim_packets')).toHaveLength(0);
  });

  it('asks for the corrective notice first on a claim the old flow showed as filed', async () => {
    h.db.insertRow('claims', { user_id: USER_A, lawsuit_id: LAWSUIT, lawsuit_title: 'x', status: 'self_file', corrective_notice_required: true });
    expect(await body(await start(), 409)).toMatchObject({ code: 'invalid_transition' });
    expect(h.db.rows('claim_packets')).toHaveLength(0);
  });

  it('moves a self-file claim to the agent lane once the settlement has one', async () => {
    h.db.rows('filing_policies').length = 0;
    const first = (await body(await start(), 201)).filing;
    expect(first.claim.status).toBe('self_file');
    seedPolicyAgain(h.db);
    const again = (await body(await start(), 200)).filing;
    expect(again.claim.status).toBe('preparing');
    expect(again.lane.agent).toBe(true);
    expect(again.packet.revision).toBe(2);
  });
});

function seedPolicyAgain(db: FakeDb) {
  const fresh = new Db();
  seedSettlement(fresh);
  db.rows('filing_policies').push(...fresh.rows('filing_policies'));
}

describe('GET /api/filing/claims/{claimId}', () => {
  it('shows a claim to its owner only', async () => {
    const id = (await body(await start(), 201)).filing.claim.id as string;
    const mine = await body(await VIEW(getRequest(`/api/filing/claims/${id}`), params(id)), 200);
    expect(ClaimFilingResponseSchema.safeParse(mine).success).toBe(true);
    h.cookieUser = { id: USER_B };
    h.claims = signInClaims(USER_B);
    expect(await body(await VIEW(getRequest(`/api/filing/claims/${id}`), params(id)), 404)).toMatchObject({ code: 'not_found' });
    expect(await body(await VIEW(getRequest('/api/filing/claims/not-a-uuid'), params('not-a-uuid')), 404)).toMatchObject({ code: 'not_found' });
  });

  it('asks for a fresh sign-in when the session came from an email link', async () => {
    const id = (await body(await start(), 201)).filing.claim.id as string;
    h.claims = signInClaims(USER_A, 30, 'magiclink');
    const view = (await body(await VIEW(getRequest(`/api/filing/claims/${id}`), params(id)), 200)).filing;
    expect(view.actions.needs_fresh_sign_in).toBe(true);
  });
});

describe('GET /api/filing/claims and the preview', () => {
  it('lists one-click claims only, with their lane', async () => {
    await body(await start(), 201);
    h.db.rows('lawsuits').push({ ...h.db.rows('lawsuits')[0], id: '00000000-0000-4000-8000-0000000000d2', slug: 'other' });
    h.db.insertRow('claims', { user_id: USER_A, lawsuit_id: '00000000-0000-4000-8000-0000000000d2', status: 'self_file', lawsuit_title: 'Other' });
    const list = await body(await LIST(getRequest('/api/filing/claims')), 200);
    expect(ClaimFilingListResponseSchema.safeParse(list).success).toBe(true);
    expect(list.items).toEqual([expect.objectContaining({ lawsuit_id: LAWSUIT, status: 'preparing', lane: 'filing_desk', agent: true, needs_action: true })]);
  });

  it('previews lanes for match cards, leaving out settlements it cannot read', async () => {
    const lanes = await previewLanes({ userId: USER_A, lawsuitIds: [LAWSUIT, '00000000-0000-4000-8000-000000000999'], now: NOW });
    expect([...lanes.keys()]).toEqual([LAWSUIT]);
    expect(lanes.get(LAWSUIT)).toMatchObject({ lane: 'filing_desk', agent: true });
    h.db.failNext('filing_policies', 'select', { code: '08006' });
    expect((await previewLanes({ userId: USER_A, lawsuitIds: [LAWSUIT], now: NOW })).size).toBe(0);
  });

  it('previews the lane without writing anything', async () => {
    const preview = await body(await PREVIEW(getRequest(`/api/filing/claims/preview?lawsuit_id=${LAWSUIT}`)), 200);
    expect(LanePreviewResponseSchema.safeParse(preview).success).toBe(true);
    expect(preview.preview).toMatchObject({ lawsuit_id: LAWSUIT, claim_id: null, can_start: true, lane: { lane: 'filing_desk', agent: true } });
    expect(h.db.writes).toEqual([]);
    expect(await body(await PREVIEW(getRequest('/api/filing/claims/preview')), 400)).toMatchObject({ code: 'invalid_request' });
  });
});
