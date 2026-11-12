import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  sendMatchAlerts: vi.fn(),
}));

vi.mock('@/lib/match-alert-job', () => ({ sendMatchAlerts: m.sendMatchAlerts }));

import { GET, POST } from '@/app/api/cron/match-alerts/route';

const SECRET = 'test-cron-secret';

function cronRequest(path: string, auth = true): Request {
  return new Request(`https://claimmatch.test${path}`, {
    headers: auth ? { authorization: `Bearer ${SECRET}` } : {},
  });
}

async function call(handler: (req: Request) => Promise<Response>, path: string, auth = true) {
  const res = await handler(cronRequest(path, auth));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.sendMatchAlerts.mockResolvedValue({
    considered: 2,
    planned: 1,
    emailed: 0,
    skipped: null,
    dryRun: true,
    plans: [
      {
        emailMasked: 'a•••@example.com',
        source: 'profile',
        claimCount: 1,
        slugs: ['verified-open'],
      },
    ],
  });
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/match-alerts', () => {
  it('skips without sending when the flag is off', async () => {
    const { status, body } = await call(GET, '/api/cron/match-alerts');
    expect(status).toBe(200);
    expect(m.sendMatchAlerts).not.toHaveBeenCalled();
    expect(body.skippedSteps).toEqual(['matchAlerts']);
    expect(body.steps.matchAlerts.reason).toBe('paused (match alerts)');
  });

  it('dry-run plans who would get what without sending, even if the flag is off', async () => {
    const { status, body } = await call(GET, '/api/cron/match-alerts?dryRun=1');
    expect(status).toBe(200);
    expect(m.sendMatchAlerts).toHaveBeenCalledWith({ dryRun: true, planWhenOff: true });
    expect(body.dryRun).toBe(true);
    expect(body.ranSteps).toEqual(['matchAlerts']);
    expect(body.steps.matchAlerts.result.emailed).toBe(0);
    expect(body.steps.matchAlerts.result.plans[0].slugs).toEqual(['verified-open']);
  });

  it('sends only when MATCH_ALERT_EMAILS_ENABLED=1', async () => {
    vi.stubEnv('MATCH_ALERT_EMAILS_ENABLED', '1');
    m.sendMatchAlerts.mockResolvedValue({
      considered: 1,
      planned: 1,
      emailed: 1,
      skipped: null,
      dryRun: false,
      plans: [],
    });
    const { status, body } = await call(POST, '/api/cron/match-alerts');
    expect(status).toBe(200);
    expect(m.sendMatchAlerts).toHaveBeenCalledWith({ dryRun: false, planWhenOff: false });
    expect(body.steps.matchAlerts.result.emailed).toBe(1);
  });

  it('rejects requests without the cron secret', async () => {
    const { status } = await call(GET, '/api/cron/match-alerts?dryRun=1', false);
    expect(status).toBe(401);
    expect(m.sendMatchAlerts).not.toHaveBeenCalled();
  });
});
