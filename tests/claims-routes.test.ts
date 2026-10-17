import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shared state for the mocks (vi.hoisted runs before the mocked modules load).
const h = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  claimRow: null as Record<string, unknown> | null,
  claimError: null as { code: string; message: string } | null,
  settlement: null as Record<string, unknown> | null,
  settlementReadFails: false,
  serviceRole: true,
  rateOk: true,
  applied: [] as Record<string, unknown>[],
  started: [] as Record<string, unknown>[],
  writeResult: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: h.claimRow, error: h.claimError }),
      };
      return chain;
    },
  }),
  createServiceClient: () => {
    throw new Error('routes must use the claims-server helpers');
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: () => (h.rateOk ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: 30 }),
}));

vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return {
    ...actual,
    serviceRoleConfigured: () => h.serviceRole,
    loadSettlementById: async () =>
      h.settlementReadFails ? { ok: false } : { ok: true, settlement: h.settlement },
    logClaimsError: () => undefined,
    applyClaimPlan: async (args: Record<string, unknown>) => {
      h.applied.push(args);
      return h.writeResult ?? { ok: true, claim: { id: 'claim-1', status: 'changed' }, created: false };
    },
    startTrackingClaim: async (args: Record<string, unknown>) => {
      h.started.push(args);
      return { ok: true, claim: { id: 'claim-new', status: 'self_file' }, created: true };
    },
  };
});

import { PATCH } from '@/app/api/claims/[id]/route';
import { POST } from '@/app/api/claims/route';
import { POST as FILE_ALL } from '@/app/api/claims/file-all/route';

const CLAIM_ID = '00000000-0000-4000-8000-0000000000c1';
const LAWSUIT_ID = '00000000-0000-4000-8000-0000000000d1';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CLAIM_ID,
    user_id: 'user-a',
    lawsuit_id: LAWSUIT_ID,
    lawsuit_title: 'Real settlement',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    ...overrides,
  };
}
function settlement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  return {
    id: LAWSUIT_ID,
    slug: 'real-settlement',
    title: 'Real settlement',
    status: 'open',
    review_status: 'published',
    deadline: future,
    claim_url: 'https://www.real-admin.com/file',
    ...overrides,
  };
}
function patch(body: unknown, opts: { id?: string; contentType?: string } = {}) {
  const req = new Request(`http://localhost/api/claims/${opts.id ?? CLAIM_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': opts.contentType ?? 'application/json', 'x-vercel-id': 'req-123' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: opts.id ?? CLAIM_ID }) });
}
function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  h.user = { id: 'user-a' };
  h.claimRow = row();
  h.claimError = null;
  h.settlement = settlement();
  h.settlementReadFails = false;
  h.serviceRole = true;
  h.rateOk = true;
  h.applied = [];
  h.started = [];
  h.writeResult = null;
});

describe('PATCH /api/claims/[id]', () => {
  it('needs a signed-in user', async () => {
    h.user = null;
    expect((await patch({ action: 'report_filed' })).status).toBe(401);
  });

  it('rate limits, rejects bad ids and non-JSON bodies', async () => {
    h.rateOk = false;
    expect((await patch({ action: 'report_filed' })).status).toBe(429);
    h.rateOk = true;
    expect((await patch({ action: 'report_filed' }, { id: 'not-a-uuid' })).status).toBe(404);
    expect((await patch('action=report_filed', { contentType: 'text/plain' })).status).toBe(415);
  });

  it('answers bad input with 400, never 500', async () => {
    expect((await patch('{not json')).status).toBe(400);
    const badDate = await patch({ action: 'report_filed', filed_on: 'garbage' });
    expect(badDate.status).toBe(400);
    expect((await badDate.json()).error).toMatch(/isn't valid/);
    expect((await patch({ action: 'report_filed', filed_on: '2999-01-01' })).status).toBe(400);
    expect((await patch({ action: 'add_confirmation', confirmation_number: 'x' })).status).toBe(400);
    expect((await patch({ action: 'file_for_me' })).status).toBe(400);
    expect(h.applied).toHaveLength(0);
  });

  it("hides other people's claims", async () => {
    h.claimRow = row({ user_id: 'user-b' });
    expect((await patch({ action: 'report_filed' })).status).toBe(404);
    h.claimRow = null;
    expect((await patch({ action: 'report_filed' })).status).toBe(404);
    expect(h.applied).toHaveLength(0);
  });

  it('fails loudly with 503 before migration 0006 or without the service role', async () => {
    h.claimRow = { id: CLAIM_ID, user_id: 'user-a', lawsuit_id: LAWSUIT_ID, status: 'submitted' };
    const before = await patch({ action: 'report_filed' });
    expect(before.status).toBe(503);
    expect((await before.json()).code).toBe('claims_unavailable');
    h.claimRow = row();
    h.serviceRole = false;
    expect((await patch({ action: 'report_filed' })).status).toBe(503);
    expect(h.applied).toHaveLength(0);
  });

  it('refuses impossible moves with 409 and treats repeats as no-ops', async () => {
    h.claimRow = row({ status: 'submitted', confirmation_number: 'AB-12' });
    const undo = await patch({ action: 'undo_report' });
    expect(undo.status).toBe(409);
    h.claimRow = row({ status: 'self_file' });
    const ack = await patch({ action: 'acknowledge_notice' });
    expect(ack.status).toBe(200);
    expect((await ack.json()).changed).toBe(false);
    expect(h.applied).toHaveLength(0);
  });

  it('turns a legacy "submitted" claim into a real report with the number', async () => {
    h.claimRow = row({ status: 'submitted', confirmation_number: null });
    const res = await patch({ action: 'report_filed', confirmation_number: '  CM-4471 ', filed_on: '2026-10-01' });
    expect(res.status).toBe(200);
    expect(h.applied).toHaveLength(1);
    const call = h.applied[0] as {
      claimId: string;
      userId: string;
      plan: { fromStatus: string; toStatus: string; changes: Record<string, unknown> };
      detail: Record<string, unknown>;
    };
    expect(call).toMatchObject({ claimId: CLAIM_ID, userId: 'user-a', detail: { request_id: 'req-123' } });
    expect(call.plan.fromStatus).toBe('submitted');
    expect(call.plan.toStatus).toBe('submitted');
    expect(call.plan.changes).toMatchObject({
      status: 'submitted',
      confirmation_number: 'CM-4471',
      user_filed_on: '2026-10-01',
    });
    expect(call.plan.changes.corrective_notice_answered_at).toEqual(expect.any(String));
  });

  it('reports without a number as reported_filed', async () => {
    const res = await patch({ action: 'report_filed' });
    expect(res.status).toBe(200);
    expect((h.applied[0] as { plan: { toStatus: string } }).plan.toStatus).toBe('reported_filed');
  });

  it('fails closed with 503 when the settlement cannot be read, never planning against an unknown one', async () => {
    // A legacy claim on a fictional settlement: with an unknown settlement the
    // plan would have accepted "I filed" as if it were real.
    h.claimRow = row({ status: 'submitted', confirmation_number: null });
    h.settlementReadFails = true;
    const failed = await patch({ action: 'report_filed', confirmation_number: 'ABC123' });
    expect(failed.status).toBe(503);
    expect((await failed.json()).code).toBe('settlement_unavailable');
    h.settlementReadFails = false;
    h.settlement = null; // the row is missing although the claim exists
    expect((await patch({ action: 'report_filed' })).status).toBe(503);
    expect(h.applied).toHaveLength(0);
  });

  it('passes database refusals through with the right status', async () => {
    h.writeResult = { ok: false, status: 409, code: 'claim_changed', error: 'This claim just changed.' };
    const res = await patch({ action: 'report_filed' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('claim_changed');
  });
});

describe('POST /api/claims', () => {
  it('refuses the retired e-sign payload with 410', async () => {
    const res = await post({ lawsuit_id: LAWSUIT_ID, signature_name: 'Jo Smith', form_data: {} });
    expect(res.status).toBe(410);
    expect(h.started).toHaveLength(0);
  });

  it('returns an existing claim unchanged', async () => {
    const res = await post({ lawsuit_id: LAWSUIT_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: false, claim: { id: CLAIM_ID, status: 'self_file' } });
    expect(h.started).toHaveLength(0);
  });

  it('starts tracking an open settlement as self_file', async () => {
    h.claimRow = null;
    const res = await post({ lawsuit_id: LAWSUIT_ID });
    expect(res.status).toBe(201);
    expect(h.started[0]).toMatchObject({ userId: 'user-a', lawsuitId: LAWSUIT_ID, lawsuitTitle: 'Real settlement' });
  });

  it('refuses closed, past-deadline and unpublished settlements', async () => {
    h.claimRow = null;
    h.settlement = settlement({ status: 'closed' });
    expect((await post({ lawsuit_id: LAWSUIT_ID })).status).toBe(409);
    h.settlement = settlement({ deadline: '2020-01-01' });
    expect((await post({ lawsuit_id: LAWSUIT_ID })).status).toBe(409);
    h.settlement = settlement({ review_status: 'rejected' });
    expect((await post({ lawsuit_id: LAWSUIT_ID })).status).toBe(404);
    h.settlement = null;
    expect((await post({ lawsuit_id: LAWSUIT_ID })).status).toBe(404);
    expect(h.started).toHaveLength(0);
  });

  describe('starting a claim to report filing (intent: report_filed)', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

    it('is accepted the day after the deadline, when saving is refused', async () => {
      h.claimRow = null;
      // Two days back in UTC is always past the Honolulu cutoff.
      h.settlement = settlement({ deadline: daysAgo(2) });
      const save = await post({ lawsuit_id: LAWSUIT_ID });
      expect(save.status).toBe(409);
      expect((await save.json()).code).toBe('settlement_closed');
      expect(h.started).toHaveLength(0);

      const res = await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' });
      expect(res.status).toBe(201);
      expect(h.started[0]).toMatchObject({
        userId: 'user-a',
        lawsuitId: LAWSUIT_ID,
        detail: { action: 'start_tracking', intent: 'report_filed' },
      });
    });

    it('is accepted on a listing our list marks closed (D41), but not saving', async () => {
      h.claimRow = null;
      h.settlement = settlement({ status: 'closed' });
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'track' })).status).toBe(409);
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' })).status).toBe(201);
      h.settlement = settlement({ status: 'closed', deadline: null });
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' })).status).toBe(201);
      expect(h.started).toHaveLength(2);
    });

    it('is refused more than 30 days after the deadline', async () => {
      h.claimRow = null;
      h.settlement = settlement({ deadline: daysAgo(32) });
      const res = await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('window_closed');
      expect(body.error).toMatch(/more than 30 days/);
      expect(h.started).toHaveLength(0);
    });

    it('is still accepted 30 days after the deadline', async () => {
      h.claimRow = null;
      // Today (UTC) is the 30th day: the window ends at 10:00 UTC tomorrow.
      h.settlement = settlement({ deadline: daysAgo(30) });
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' })).status).toBe(201);
    });

    it('never starts a claim on a fictional or unpublished settlement', async () => {
      h.claimRow = null;
      h.settlement = settlement({ slug: 'robocall-tcpa-settlement', deadline: daysAgo(2) });
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' })).status).toBe(404);
      h.settlement = settlement({ review_status: 'rejected', deadline: daysAgo(2) });
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' })).status).toBe(404);
      expect(h.started).toHaveLength(0);
    });

    it('returns an existing claim as it is', async () => {
      h.settlement = settlement({ deadline: daysAgo(40) });
      const res = await post({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' });
      expect(res.status).toBe(200);
      expect((await res.json()).created).toBe(false);
      expect(h.started).toHaveLength(0);
    });

    it('rejects an unknown intent', async () => {
      h.claimRow = null;
      expect((await post({ lawsuit_id: LAWSUIT_ID, intent: 'file_for_me' })).status).toBe(400);
      expect(h.started).toHaveLength(0);
    });
  });

  it('answers 503, not 404, when the settlement cannot be read', async () => {
    h.claimRow = null;
    h.settlementReadFails = true;
    const res = await post({ lawsuit_id: LAWSUIT_ID });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('settlement_unavailable');
    expect(h.started).toHaveLength(0);
  });

  it('validates the settlement id', async () => {
    expect((await post({ lawsuit_id: 'sample-databreach' })).status).toBe(400);
  });
});

describe('POST /api/claims/file-all', () => {
  it('is gone', async () => {
    const res = await FILE_ALL();
    expect(res.status).toBe(410);
  });
});
