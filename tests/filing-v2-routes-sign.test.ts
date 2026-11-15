import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDb } from './filing-v2-fake';
import type { JevKnobs, JobKnobs } from './filing-v2-fixtures';

// Member filing API (B2): the one click (POST .../sign) and the member's moves
// (withdraw, reopen, self-file, confirmation number).
const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  cookieUser: null as { id: string } | null,
  bearerUser: null as { id: string } | null,
  claims: null as Record<string, unknown> | null,
  claimsJwt: [] as Array<string | undefined>,
  jev: { runs: [] } as JevKnobs,
  jobs: null as unknown as JobKnobs,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...h.db.client('cookie', h.cookieUser?.id ?? null),
    auth: {
      getUser: async () => ({ data: { user: h.cookieUser } }),
      getClaims: async (jwt?: string) => {
        h.claimsJwt.push(jwt);
        return { data: h.claims ? { claims: h.claims } : null, error: null };
      },
    },
  }),
  createServiceClient: () => h.db.client('service', null),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    ...h.db.client('bearer', h.bearerUser?.id ?? null),
    auth: {
      getUser: async () => (h.bearerUser ? { data: { user: h.bearerUser }, error: null } : { data: { user: null }, error: { name: 'AuthApiError', status: 403 } }),
      getClaims: async (jwt?: string) => {
        h.claimsJwt.push(jwt);
        return { data: h.claims ? { claims: h.claims } : null, error: null };
      },
    },
  }),
}));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));
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

import { POST as START } from '@/app/api/filing/claims/route';
import { PATCH } from '@/app/api/filing/claims/[claimId]/packet/route';
import { POST as CONSENT } from '@/app/api/filing/claims/[claimId]/esign-consent/route';
import { POST as SIGN } from '@/app/api/filing/claims/[claimId]/sign/route';
import { POST as WITHDRAW } from '@/app/api/filing/claims/[claimId]/withdraw/route';
import { POST as REOPEN } from '@/app/api/filing/claims/[claimId]/reopen/route';
import { POST as SELF_FILE } from '@/app/api/filing/claims/[claimId]/self-file/route';
import { POST as CONFIRM } from '@/app/api/filing/claims/[claimId]/confirmation/route';
import { agentAuthorizationText } from '@/lib/filing/v2/authorization-text';
import { ClaimFilingResponseSchema } from '@/lib/filing/v2/contract';
import { FakeDb as Db, sha } from './filing-v2-fake';
import { BEARER, LAWSUIT, NOW, SPEC_CONTENT, SPEC_ID, USER_A, USER_B, jsonRequest, seedSettlement, signInClaims } from './filing-v2-fixtures';

const params = (claimId: string) => ({ params: Promise.resolve({ claimId }) });
async function json(res: Response, status: number) {
  expect(res.status).toBe(status);
  return (await res.json()) as Record<string, any>;
}
const post = (route: typeof SIGN, id: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  route(jsonRequest(`/api/filing/claims/${id}/${path}`, 'POST', body, headers), params(id));

/** A claim that is ready to sign (complete, Jev passes, E-SIGN consent given). */
async function readyClaim(headers: Record<string, string> = {}) {
  const start = await json(await START(jsonRequest('/api/filing/claims', 'POST', { lawsuit_id: LAWSUIT }, headers)), 201);
  const id = start.filing.claim.id as string;
  const body = { revision: 1, answers: { purchase_count: 2 }, benefit_tier: 'basic', payout_method: 'check', class_definition_confirmed: true };
  const saved = await json(await PATCH(jsonRequest(`/api/filing/claims/${id}/packet`, 'PATCH', body, headers), params(id)), 200);
  await json(await post(CONSENT, id, 'esign-consent', { accepted: true, text_version: 'esign-v1' }, headers), 201);
  const packet = saved.filing.packet;
  const sign = {
    packet_hash: packet.packet_hash as string,
    revision: packet.revision as number,
    spec_id: SPEC_ID,
    spec_version: 1,
    typed_name: 'Ada Lovelace',
    attestation_accepted: true,
    authorization_accepted: true,
    authorization_text_version: 'agent-auth-v1',
  };
  return { id, sign };
}
const sign = (id: string, body: unknown, key: string | null = randomUUID(), headers: Record<string, string> = {}) =>
  post(SIGN, id, 'sign', body, key ? { 'idempotency-key': key, ...headers } : headers);
const claimRow = () => h.db.rows('claims')[0];

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
  h.claims = signInClaims(USER_A);
  h.claimsJwt = [];
  h.jev = { runs: [] };
  h.jobs = { db: h.db, enqueueFails: false, enqueued: [], withdrawn: [] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('POST .../sign: refusals', () => {
  it('needs an Idempotency-Key UUID and the member’s own ticks', async () => {
    const { id, sign: body } = await readyClaim();
    expect(await json(await sign(id, body, null), 400)).toMatchObject({ code: 'idempotency_key_required' });
    expect(await json(await sign(id, body, 'not-a-uuid'), 400)).toMatchObject({ code: 'idempotency_key_required' });
    expect(await json(await sign(id, { ...body, attestation_accepted: false }), 400)).toMatchObject({ code: 'invalid_request' });
    expect(h.db.rows('claim_signatures')).toHaveLength(0);
  });

  it('needs a real sign-in within 15 minutes (403, never 401); email links never count', async () => {
    const { id, sign: body } = await readyClaim();
    h.claims = signInClaims(USER_A, 30, 'magiclink');
    expect(await json(await sign(id, body), 403)).toMatchObject({ code: 'reauth_required' });
    h.claims = signInClaims(USER_A, 16 * 60);
    expect(await json(await sign(id, body), 403)).toMatchObject({ code: 'reauth_required' });
    expect(h.db.rpcCalls.filter((c) => c.name === 'filing_sign_packet')).toHaveLength(0);
  });

  it('needs E-SIGN consent of the current version', async () => {
    const { id, sign: body } = await readyClaim();
    h.db.rows('esign_consents')[0].withdrawn_at = NOW.toISOString();
    expect(await json(await sign(id, body), 409)).toMatchObject({ code: 'esign_consent_required' });
  });

  it('refuses a changed packet, a stale authorization text and a mismatched typed name', async () => {
    const { id, sign: body } = await readyClaim();
    expect(await json(await sign(id, { ...body, packet_hash: 'f'.repeat(64) }), 409)).toMatchObject({ code: 'packet_changed' });
    expect(await json(await sign(id, { ...body, revision: 1 }), 409)).toMatchObject({ code: 'packet_changed' });
    expect(await json(await sign(id, { ...body, authorization_text_version: 'agent-auth-v0' }), 409)).toMatchObject({ code: 'packet_changed' });
    expect(await json(await sign(id, { ...body, typed_name: 'Ada Byron' }), 422)).toMatchObject({ code: 'typed_name_mismatch' });
    // A profile change since the review changes the packet too.
    h.db.find('profiles', (p) => p.id === USER_A)!.address_line1 = '9 Elm St';
    expect(await json(await sign(id, body), 409)).toMatchObject({ code: 'packet_changed' });
  });

  it('stops on a Jev block, after logging the run, with member issues only', async () => {
    const { id, sign: body } = await readyClaim();
    h.jev.extra = (input) =>
      input.mode === 'pre_sign'
        ? [
            { rule_id: 'global.deadline_cutoff', source: 'global', severity: 'block', code: 'deadline_too_close', message: 'Too close to the deadline.', field: null, audience: 'member' },
            { rule_id: 'global.duplicate_identity', source: 'global', severity: 'warn', code: 'duplicate_identity', message: 'internal', field: null, audience: 'staff' },
          ]
        : [];
    const res = await json(await sign(id, body), 422);
    expect(res).toMatchObject({ code: 'jev_blocked', issues: [{ code: 'deadline_too_close' }] });
    expect(res.issues).toHaveLength(1);
    expect(h.db.rows('jev_runs').at(-1)).toMatchObject({ mode: 'pre_sign', triggered_by: 'member_sign', outcome: 'block' });
    expect(h.db.rows('claim_signatures')).toHaveLength(0);
  });

  it('signs only a ready claim on an agent lane', async () => {
    const { id, sign: body } = await readyClaim();
    h.db.insertRow('filing_controls', { lawsuit_id: LAWSUIT, kill_switch: true, kill_switch_reason: 'objection' });
    expect(await json(await sign(id, body), 409)).toMatchObject({ code: 'lane_unavailable' });
    h.db.rows('filing_controls').length = 0;
    claimRow().status = 'preparing';
    expect(await json(await sign(id, body), 409)).toMatchObject({ code: 'invalid_transition' });
    h.cookieUser = { id: USER_B };
    h.claims = signInClaims(USER_B);
    expect(await json(await sign(id, body), 404)).toMatchObject({ code: 'not_found' });
  });
});

describe('POST .../sign: the one click', () => {
  it('stores the signature for this exact packet, then queues it on the signed lane', async () => {
    const { id, sign: body } = await readyClaim();
    const key = randomUUID();
    const res = await json(await sign(id, { ...body, typed_name: '  ada   LOVELACE ' }, key, { 'user-agent': 'Lawsuit AI/1.0' }), 200);
    expect(ClaimFilingResponseSchema.safeParse(res).success).toBe(true);
    const sig = h.db.rows('claim_signatures')[0];
    expect(sha(String(sig.packet_canonical))).toBe(body.packet_hash);
    expect(sig).toMatchObject({
      packet_hash: body.packet_hash,
      statement_text: SPEC_CONTENT.attestation.text,
      authorization_text_version: 'agent-auth-v1',
      authorization_text: agentAuthorizationText('filing_desk'),
      typed_name: 'ada   LOVELACE',
      lane: 'filing_desk',
      auth_method: 'password',
      session_id: 'sess-1',
      ip: '203.0.113.7',
      user_agent: 'Lawsuit AI/1.0',
      idempotency_key: key,
      esign_consent_id: h.db.rows('esign_consents')[0].id,
      jev_run_id: h.db.rows('jev_runs').at(-1)?.id,
    });
    expect(h.jobs.enqueued).toEqual([expect.objectContaining({ signatureId: sig.id, actor: 'user', decision: expect.objectContaining({ lane: 'filing_desk' }) })]);
    const view = res.filing;
    expect(view.claim.status).toBe('queued');
    expect(view.signature).toMatchObject({ id: sig.id, lane: 'filing_desk', packet_hash: body.packet_hash });
    expect(view.packet).toMatchObject({ status: 'signed', packet_hash: body.packet_hash });
    expect(view.timeline.map((t: { status: string }) => t.status)).toEqual(['preparing', 'ready', 'signed', 'queued']);
    expect(view.actions).toMatchObject({ can_edit: false, can_sign: false, can_reopen: true, can_withdraw: true });
  });

  it('answers a retry with the same key with the first signature; another packet under it is a conflict', async () => {
    const { id, sign: body } = await readyClaim();
    const key = randomUUID();
    await json(await sign(id, body, key), 200);
    const again = await json(await sign(id, body, key), 200);
    expect(again.filing.claim.status).toBe('queued');
    expect(h.db.rows('claim_signatures')).toHaveLength(1);
    expect(await json(await sign(id, { ...body, packet_hash: 'e'.repeat(64) }, key), 409)).toMatchObject({ code: 'idempotency_conflict' });
  });

  it('still answers 200 with status signed when queueing fails; a retry queues it', async () => {
    const { id, sign: body } = await readyClaim();
    h.jobs.enqueueFails = true;
    const key = randomUUID();
    expect((await json(await sign(id, body, key), 200)).filing.claim.status).toBe('signed');
    h.jobs.enqueueFails = false;
    expect((await json(await sign(id, body, key), 200)).filing.claim.status).toBe('queued');
  });

  it('works the same for the app’s bearer token', async () => {
    h.cookieUser = null;
    h.bearerUser = { id: USER_A };
    const { id, sign: body } = await readyClaim({ authorization: BEARER });
    const res = await json(await sign(id, body, randomUUID(), { authorization: BEARER }), 200);
    expect(res.filing.claim.status).toBe('queued');
    expect(h.claimsJwt).toContain('app-header.app-payload.app-signature');
  });
});

describe('the member’s moves', () => {
  async function queuedClaim() {
    const ready = await readyClaim();
    await json(await sign(ready.id, ready.sign), 200);
    return ready;
  }

  it('withdraws before filing starts, never during it', async () => {
    const { id } = await queuedClaim();
    claimRow().status = 'filing';
    expect(await json(await post(WITHDRAW, id, 'withdraw', {}), 409)).toMatchObject({ code: 'filing_in_progress' });
    claimRow().status = 'queued';
    const res = (await json(await post(WITHDRAW, id, 'withdraw', { reason: 'filed_myself' }), 200)).filing;
    expect(res.claim.status).toBe('withdrawn');
    expect(h.jobs.withdrawn.at(-1)).toMatchObject({ to: 'withdrawn', reasonCode: 'filed_myself', actor: 'user' });
    expect(h.db.rows('claim_filing_jobs')[0].status).toBe('cancelled');
    expect(h.db.rows('claim_signature_voids')).toHaveLength(1);
    expect(res.lane).toMatchObject({ lane: 'self_file', agent: false });
    expect(res.actions).toMatchObject({ can_withdraw: false, can_edit: false });
    expect((await json(await post(WITHDRAW, id, 'withdraw', {}), 200)).filing.claim.status).toBe('withdrawn');
  });

  it('reopens a queued claim for changes; unchanged, it reads ready again and can be signed anew', async () => {
    const { id, sign: body } = await queuedClaim();
    const reopened = (await json(await post(REOPEN, id, 'reopen', {}), 200)).filing;
    expect(h.jobs.withdrawn.at(-1)).toMatchObject({ to: 'preparing', reasonCode: 'member_edit' });
    expect(reopened.claim.status).toBe('ready');
    expect(reopened.signature).toBeNull();
    expect(reopened.packet.status).toBe('open');
    const second = await json(await sign(id, { ...body, revision: reopened.packet.revision }), 200);
    expect(second.filing.claim.status).toBe('queued');
    expect(h.db.rows('claim_signatures')).toHaveLength(2);
  });

  it('hands a claim to the member to finish on the official site', async () => {
    const { id } = await readyClaim();
    const res = (await json(await post(SELF_FILE, id, 'self-file', {}), 200)).filing;
    expect(res.claim.status).toBe('self_file');
    expect(h.jobs.withdrawn.at(-1)).toMatchObject({ to: 'self_file', reasonCode: 'member_choice' });
    expect(res.actions.can_sign).toBe(false);
  });

  it('takes the administrator’s confirmation number for a claim Lawsuit AI filed', async () => {
    const { id } = await queuedClaim();
    expect(await json(await post(CONFIRM, id, 'confirmation', { confirmation_number: 'ABC-123' }), 409)).toMatchObject({ code: 'invalid_transition' });
    claimRow().status = 'filed_by_claimmatch';
    const res = (await json(await post(CONFIRM, id, 'confirmation', { confirmation_number: ' ABC-123 ' }), 200)).filing;
    expect(res.claim).toMatchObject({ status: 'submitted', confirmation_number: 'ABC-123' });
    expect(res.timeline.at(-1)).toMatchObject({ status: 'submitted', actor: 'you', confirmation_number: 'ABC-123' });
    expect((await json(await post(CONFIRM, id, 'confirmation', { confirmation_number: 'ABC-123' }), 200)).filing.claim.status).toBe('submitted');
  });
});
