import { describe, expect, it, vi } from 'vitest';
import {
  D50_PAUSED,
  buildReport,
  digestGate,
  errorMessage,
  matchSweepGate,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
} from '@/app/api/cron/_lib/report';
import { flags } from '@/lib/flags';

describe('D50 gates', () => {
  it('pause the match sweep unless match emails are on', () => {
    expect(matchSweepGate(false)).toEqual({
      run: false,
      step: {
        status: 'skipped',
        reason: D50_PAUSED,
        resume: expect.stringContaining('MATCH_EMAILS_ENABLED=1'),
      },
    });
    expect(matchSweepGate(true)).toEqual({ run: true });
  });

  it('pause the digest unless the digest is on', () => {
    expect(digestGate(false)).toEqual({
      run: false,
      step: {
        status: 'skipped',
        reason: 'paused (D50)',
        resume: expect.stringContaining('DIGEST_ENABLED=1'),
      },
    });
    expect(digestGate(true)).toEqual({ run: true });
  });

  it('stay paused unless the env var is exactly "1"', () => {
    for (const value of [undefined, '', '0', 'true', 'yes', ' 1', '1 ']) {
      vi.stubEnv('MATCH_EMAILS_ENABLED', value);
      vi.stubEnv('DIGEST_ENABLED', value);
      expect(matchSweepGate(flags.matchEmails()).run).toBe(false);
      expect(digestGate(flags.digest()).run).toBe(false);
    }
    vi.stubEnv('MATCH_EMAILS_ENABLED', '1');
    vi.stubEnv('DIGEST_ENABLED', '1');
    expect(matchSweepGate(flags.matchEmails()).run).toBe(true);
    expect(digestGate(flags.digest()).run).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe('buildReport and reportHttpStatus', () => {
  it('lists what ran, what was skipped and what failed', () => {
    const report = buildReport('daily', {
      ingest: { status: 'ran', result: { ingested: 3 } },
      matchSweep: { status: 'skipped', reason: D50_PAUSED },
    });
    expect(report).toEqual({
      job: 'daily',
      ok: true,
      ran: ['ingest'],
      skipped: ['matchSweep'],
      failed: [],
      steps: {
        ingest: { status: 'ran', result: { ingested: 3 } },
        matchSweep: { status: 'skipped', reason: D50_PAUSED },
      },
    });
    expect(reportHttpStatus(report)).toBe(200);
  });

  it('answers 500 when any step failed', () => {
    const report = buildReport('daily', {
      ingest: { status: 'failed', error: 'boom' },
      matchSweep: { status: 'skipped', reason: D50_PAUSED },
    });
    expect(report.ok).toBe(false);
    expect(report.failed).toEqual(['ingest']);
    expect(reportHttpStatus(report)).toBe(500);
  });

  it('treats an all-skipped run as a 200 that says so', () => {
    const report = buildReport('digest', { digest: { status: 'skipped', reason: D50_PAUSED } });
    expect(reportHttpStatus(report)).toBe(200);
    expect(report.skipped).toEqual(['digest']);
    expect(report.ran).toEqual([]);
  });
});

describe('runStep', () => {
  it('reports the result of a step that ran', async () => {
    await expect(runStep('x', async () => ({ n: 1 }))).resolves.toEqual({
      status: 'ran',
      result: { n: 1 },
    });
  });

  it('turns a throw into a failed step and logs it', async () => {
    const log = vi.fn();
    await expect(
      runStep('x', async () => {
        throw new Error('database down');
      }, log),
    ).resolves.toEqual({ status: 'failed', error: 'database down' });
    expect(log).toHaveBeenCalledOnce();
  });

  it('describes odd throw values', () => {
    expect(errorMessage(new Error('a'))).toBe('a');
    expect(errorMessage('b')).toBe('b');
    expect(errorMessage({})).toBe('Unknown error');
    expect(errorMessage(new Error(''))).toBe('Unknown error');
  });
});

describe('serviceConfigProblem and missingConfigStep', () => {
  const full = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  };

  it('accepts a complete config', () => {
    expect(serviceConfigProblem(full)).toBeNull();
  });

  it('names the first missing variable', () => {
    expect(serviceConfigProblem({ ...full, NEXT_PUBLIC_SUPABASE_URL: '' })).toBe(
      'NEXT_PUBLIC_SUPABASE_URL is not set',
    );
    expect(serviceConfigProblem({ ...full, SUPABASE_SERVICE_ROLE_KEY: undefined })).toBe(
      'SUPABASE_SERVICE_ROLE_KEY is not set',
    );
  });

  it('fails in production and skips elsewhere', () => {
    expect(missingConfigStep('X is not set', true)).toEqual({
      status: 'failed',
      error: 'X is not set',
    });
    expect(missingConfigStep('X is not set', false)).toEqual({
      status: 'skipped',
      reason: 'X is not set',
    });
  });
});
