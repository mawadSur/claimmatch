import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  unavailable: false,
  save: vi.fn(),
  slot: vi.fn(),
  del: vi.fn(),
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

vi.mock('@/lib/self-filed-report-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/self-filed-report-server')>();
  return {
    ...actual,
    saveSelfFiledReport: (...args: unknown[]) => h.save(...args),
    createSelfFiledScreenshotSlot: (...args: unknown[]) => h.slot(...args),
    deleteSelfFiledScreenshot: (...args: unknown[]) => h.del(...args),
  };
});

import { POST as SAVE } from '@/app/api/self-filed-reports/route';
import { DELETE as REMOVE, POST as SLOT } from '@/app/api/self-filed-reports/[id]/screenshot/route';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';

const LAWSUIT = '00000000-0000-4000-8000-0000000000a1';
const REPORT = '00000000-0000-4000-8000-0000000000b1';
const OWNER = '00000000-0000-4000-8000-0000000000c1';

function json(url: string, method: string, body?: unknown, contentType = 'application/json') {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': contentType },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let n = 0;

beforeEach(() => {
  n += 1;
  h.user = { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` };
  h.unavailable = false;
  h.save.mockReset();
  h.slot.mockReset();
  h.del.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/self-filed-reports', () => {
  it('404s when the flag is off and never writes', async () => {
    expect((await SAVE(json('/api/self-filed-reports', 'POST', { lawsuit_id: LAWSUIT }))).status).toBe(404);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.user = null;
    expect((await SAVE(json('/api/self-filed-reports', 'POST', { lawsuit_id: LAWSUIT }))).status).toBe(401);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('answers 503, not 401, when auth cannot be checked', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.user = null;
    h.unavailable = true;
    const res = await SAVE(json('/api/self-filed-reports', 'POST', { lawsuit_id: LAWSUIT }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(AUTH_UNAVAILABLE);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    expect(
      (await SAVE(json('/api/self-filed-reports', 'POST', 'lawsuit_id=x', 'text/plain'))).status,
    ).toBe(415);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('refuses a missing or malformed settlement id', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    expect((await SAVE(json('/api/self-filed-reports', 'POST', { lawsuit_id: 'nope' }))).status).toBe(400);
    expect(h.save).not.toHaveBeenCalled();
  });

  it('saves as the signed-in user only', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.save.mockResolvedValue({
      ok: true,
      created: true,
      claim: { id: 'c1', status: 'reported_filed' },
      report: { id: REPORT, lawsuitId: LAWSUIT, claimId: 'c1', hasScreenshot: false },
    });
    const res = await SAVE(json('/api/self-filed-reports', 'POST', { lawsuit_id: LAWSUIT }));
    expect(res.status).toBe(201);
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: h.user?.id, lawsuitId: LAWSUIT }),
    );
  });
});

describe('POST /api/self-filed-reports/[id]/screenshot', () => {
  it('404s when the flag is off', async () => {
    expect(
      (await SLOT(json(`/api/self-filed-reports/${REPORT}/screenshot`, 'POST', { mime: 'image/png', bytes: 12 }), params(REPORT)))
        .status,
    ).toBe(404);
    expect(h.slot).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.user = null;
    expect(
      (await SLOT(json(`/api/self-filed-reports/${REPORT}/screenshot`, 'POST', { mime: 'image/png', bytes: 12 }), params(REPORT)))
        .status,
    ).toBe(401);
  });

  it('passes the signed-in user to the owner check', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.slot.mockResolvedValue({
      ok: true,
      report: { id: REPORT, hasScreenshot: true },
      upload: { signed_url: 'https://upload.example/x', path: `${OWNER}/${REPORT}/confirmation.png` },
    });
    const res = await SLOT(
      json(`/api/self-filed-reports/${REPORT}/screenshot`, 'POST', { mime: 'image/png', bytes: 12 }),
      params(REPORT),
    );
    expect(res.status).toBe(200);
    expect(h.slot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: h.user?.id, reportId: REPORT, mime: 'image/png', bytes: 12 }),
    );
  });
});

describe('DELETE /api/self-filed-reports/[id]/screenshot', () => {
  it('requires auth and the flag', async () => {
    expect((await REMOVE(json(`/api/self-filed-reports/${REPORT}/screenshot`, 'DELETE'), params(REPORT))).status).toBe(
      404,
    );
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.user = null;
    expect((await REMOVE(json(`/api/self-filed-reports/${REPORT}/screenshot`, 'DELETE'), params(REPORT))).status).toBe(
      401,
    );
    expect(h.del).not.toHaveBeenCalled();
  });
});
