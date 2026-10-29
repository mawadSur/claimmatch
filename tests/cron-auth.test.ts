import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeCron,
  cronRequestIsDryRun,
  isCronApiPath,
  vercelCronAuthorizationHeader,
} from '@/lib/cron-auth';

const SECRET = 'vercel-cron-secret';

function req(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://lawsuitai.org${path}`, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Vercel Cron authorization', () => {
  it('accepts the exact Authorization header Vercel Cron sends', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'production');
    const header = vercelCronAuthorizationHeader(SECRET);
    expect(header).toBe(`Bearer ${SECRET}`);
    expect(
      authorizeCron(
        req('/api/cron/daily', {
          authorization: header,
          'x-vercel-cron': '1',
        }),
      ),
    ).toBe(true);
  });

  it('rejects a request with only x-vercel-cron and no Bearer secret', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'production');
    expect(authorizeCron(req('/api/cron/daily', { 'x-vercel-cron': '1' }))).toBe(false);
  });

  it('rejects a wrong or missing Bearer token in production', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'production');
    expect(authorizeCron(req('/api/cron/daily'))).toBe(false);
    expect(authorizeCron(req('/api/cron/daily', { authorization: 'Bearer other' }))).toBe(false);
  });
});

describe('cron path and dry-run', () => {
  it('recognizes /api/cron/* and no other routes', () => {
    expect(isCronApiPath('/api/cron/daily')).toBe(true);
    expect(isCronApiPath('/api/cron/digest')).toBe(true);
    expect(isCronApiPath('/api/cron')).toBe(true);
    expect(isCronApiPath('/api/health/schema')).toBe(false);
    expect(isCronApiPath('/admin')).toBe(false);
  });

  it('honors INGEST_DRY_RUN and a secret-gated query param', () => {
    expect(cronRequestIsDryRun(req('/api/cron/daily'))).toBe(false);
    expect(cronRequestIsDryRun(req('/api/cron/daily?dryRun=1'))).toBe(true);
    expect(cronRequestIsDryRun(req('/api/cron/daily?dry_run=true'))).toBe(true);
    vi.stubEnv('INGEST_DRY_RUN', '1');
    expect(cronRequestIsDryRun(req('/api/cron/daily'))).toBe(true);
  });
});
