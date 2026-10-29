import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  updateSession: vi.fn(),
}));

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: m.updateSession,
}));

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

describe('middleware vs /api/cron/*', () => {
  it('does not refresh the session or redirect a Vercel Cron request', async () => {
    const res = await middleware(request('/api/cron/daily'));
    expect(m.updateSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not intercept /api/cron/digest either', async () => {
    await middleware(request('/api/cron/digest'));
    expect(m.updateSession).not.toHaveBeenCalled();
  });

  it('still refreshes the session on other routes', async () => {
    await middleware(request('/lawsuits'));
    expect(m.updateSession).toHaveBeenCalledOnce();
  });
});
