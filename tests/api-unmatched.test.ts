import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const m = vi.hoisted(() => ({
  updateSession: vi.fn(),
}));

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: m.updateSession,
}));

import { GET, HEAD } from '@/app/api/[...unmatched]/route';
import { middleware } from '@/middleware';

function request(path: string) {
  return new NextRequest(`https://lawsuitai.org${path}`);
}

beforeEach(() => {
  m.updateSession.mockReset();
  m.updateSession.mockImplementation(async (req: NextRequest) => NextResponse.next({ request: req }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('unmatched API paths', () => {
  it('returns JSON 404 instead of HTML for a catch-all API GET', async () => {
    const res = GET();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({ error: 'Not found.' });
  });

  it('returns 404 JSON content-type for HEAD', () => {
    const res = HEAD();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('quoted health probe middleware', () => {
  it('short-circuits /api/health/schema\' to JSON 404 without a session refresh', async () => {
    const res = await middleware(request("/api/health/schema'"));
    expect(m.updateSession).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({ error: 'Not found.' });
  });

  it('short-circuits the percent-encoded apostrophe the same way', async () => {
    const res = await middleware(request('/api/health/schema%27'));
    expect(m.updateSession).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it('still refreshes the session on the real health path so cron auth can run', async () => {
    await middleware(request('/api/health/schema'));
    expect(m.updateSession).toHaveBeenCalledOnce();
  });
});
