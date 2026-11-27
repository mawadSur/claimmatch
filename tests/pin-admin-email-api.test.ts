import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  unavailable: false,
  record: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/supabase/request-user', () => ({
  AUTH_UNAVAILABLE: {
    error: 'We couldn’t confirm you’re logged in right now. Please try again in a minute.',
    code: 'auth_unavailable',
  },
  getRequestUser: async () =>
    h.user
      ? { user: h.user, supabase: {}, via: 'cookie' }
      : { user: null, supabase: null, via: 'cookie', unavailable: h.unavailable },
}));

vi.mock('@/lib/pin-admin-email-send', () => ({
  recordPinAdminEmailRequest: (...args: unknown[]) => h.record(...args),
  sendPinAdminEmailForClaim: (...args: unknown[]) => h.send(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '10000000-0000-4000-8000-000000000001',
              slug: 'blue-ridge',
              title: 'Blue Ridge',
              administrator: 'CBIZ claims@cbiz.com',
              claim_url: 'https://example.test/claim',
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { POST } from '@/app/api/claims/pin-admin-email/route';

const LAWSUIT = '10000000-0000-4000-8000-000000000001';
const CLAIM = {
  id: 'c0000000-0000-4000-8000-00000000000a',
  lawsuit_id: LAWSUIT,
  lawsuit_title: 'Blue Ridge',
  status: 'self_file',
  confirmation_number: null,
  reported_filed_at: null,
  user_filed_on: null,
  corrective_notice_answered_at: null,
  corrective_notice_required: false,
  created_at: '2026-11-27T12:00:00Z',
  pin_admin_email_requested_at: '2026-11-27T12:00:00Z',
  pin_admin_email_sent_at: null,
};

function json(body: unknown) {
  return new Request('http://localhost/api/claims/pin-admin-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let n = 0;

beforeEach(() => {
  n += 1;
  h.user = { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, email: 'ada@example.com' };
  h.unavailable = false;
  h.record.mockReset();
  h.send.mockReset();
  h.record.mockResolvedValue(CLAIM);
  h.send.mockResolvedValue({ status: 'queued', claim: CLAIM });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/claims/pin-admin-email', () => {
  it('requires a signed-in user', async () => {
    h.user = null;
    expect((await POST(json({ lawsuit_id: LAWSUIT }))).status).toBe(401);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('answers 503, not 401, when auth cannot be checked', async () => {
    h.user = null;
    h.unavailable = true;
    expect((await POST(json({ lawsuit_id: LAWSUIT }))).status).toBe(503);
  });

  it('records the request and returns queued when sending is off', async () => {
    const res = await POST(json({ lawsuit_id: LAWSUIT }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.send).toBe('queued');
    expect(body.claim.pin_admin_email_requested_at).toBe(CLAIM.pin_admin_email_requested_at);
    expect(h.record).toHaveBeenCalledWith(h.user!.id, LAWSUIT);
    expect(h.send).toHaveBeenCalled();
  });

  it('returns sent when the send helper succeeds', async () => {
    h.send.mockResolvedValue({
      status: 'sent',
      claim: { ...CLAIM, pin_admin_email_sent_at: '2026-11-27T12:01:00Z' },
    });
    const body = await (await POST(json({ lawsuit_id: LAWSUIT }))).json();
    expect(body.send).toBe('sent');
    expect(body.claim.pin_admin_email_sent_at).toBe('2026-11-27T12:01:00Z');
  });
});
