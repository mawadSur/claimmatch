import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ingestAndExtract: vi.fn(),
  runMatchSweep: vi.fn(),
  startIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
  failStaleIngestRuns: vi.fn(),
  recordIngestRun: vi.fn(),
  maybeAlertCronFailure: vi.fn(),
  maybeRecordIngestAlert: vi.fn(),
  processFilingQueue: vi.fn(),
  persistEligibilityDrafts: vi.fn(),
  runOfficialLinkCheck: vi.fn(),
  order: [] as string[],
}));

vi.mock('@/lib/scraper/pipeline', () => ({
  ingestAndExtract: (...args: unknown[]) => {
    m.order.push('ingest');
    return m.ingestAndExtract(...args);
  },
}));
vi.mock('@/lib/match-sweep', () => ({ runMatchSweep: m.runMatchSweep }));
vi.mock('@/lib/jobs', () => ({
  startIngestRun: (...args: unknown[]) => {
    m.order.push('start');
    return m.startIngestRun(...args);
  },
  finishIngestRun: (...args: unknown[]) => {
    m.order.push('finish');
    return m.finishIngestRun(...args);
  },
  failStaleIngestRuns: m.failStaleIngestRuns,
  recordIngestRun: m.recordIngestRun,
  recordCronFailure: vi.fn(),
  claimDue: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
}));
vi.mock('@/lib/cron-alert', () => ({
  maybeAlertCronFailure: (...args: unknown[]) => {
    m.order.push('alert');
    return m.maybeAlertCronFailure(...args);
  },
  postAlertWebhook: vi.fn(),
}));
vi.mock('@/lib/ingest-alerts', () => ({ maybeRecordIngestAlert: m.maybeRecordIngestAlert }));
vi.mock('@/lib/filing/queue', () => ({ processFilingQueue: m.processFilingQueue }));
vi.mock('@/lib/eligibility-drafts-store', () => ({ persistEligibilityDrafts: m.persistEligibilityDrafts }));
vi.mock('@/lib/link-check', () => ({ runOfficialLinkCheck: m.runOfficialLinkCheck }));

import { GET } from '@/app/api/cron/daily/route';

const SECRET = 'test-cron-secret';
const INGEST = { ingested: 2, published: 0, pending_review: 1, updated: 2, held: 0, failed: 0, emptySources: [] };

function cronRequest(path = '/api/cron/daily', auth = true) {
  return new Request(`https://lawsuitai.org${path}`, {
    headers: auth ? { authorization: `Bearer ${SECRET}`, 'x-vercel-cron': '1' } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.order = [];
  m.ingestAndExtract.mockResolvedValue(INGEST);
  m.startIngestRun.mockResolvedValue('job-1');
  m.finishIngestRun.mockResolvedValue(undefined);
  m.failStaleIngestRuns.mockResolvedValue([]);
  m.maybeAlertCronFailure.mockResolvedValue(undefined);
  m.maybeRecordIngestAlert.mockResolvedValue(null);
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  vi.stubEnv('MATCH_EMAILS_ENABLED', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/daily observability', () => {
  it('records a started jobs row before any ingest work', async () => {
    const res = await GET(cronRequest());
    expect(res.status).toBe(200);
    expect(m.order.indexOf('start')).toBeGreaterThanOrEqual(0);
    expect(m.order.indexOf('start')).toBeLessThan(m.order.indexOf('ingest'));
    expect(m.startIngestRun).toHaveBeenCalledWith('cron/daily', { dryRun: false });
    expect(m.finishIngestRun).toHaveBeenCalledWith(
      'job-1',
      'cron/daily',
      expect.objectContaining({ status: 'ran', result: INGEST }),
    );
  });

  it('on a thrown ingest, records failed and fires the cron-alert hook', async () => {
    m.ingestAndExtract.mockRejectedValue(new Error('feed timed out'));
    const res = await GET(cronRequest());
    expect(res.status).toBe(500);
    expect(m.finishIngestRun).toHaveBeenCalledWith(
      'job-1',
      'cron/daily',
      expect.objectContaining({ status: 'failed', error: 'feed timed out' }),
    );
    expect(m.maybeAlertCronFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'daily',
        ok: false,
        failedSteps: ['ingest'],
      }),
    );
    expect(m.order.indexOf('finish')).toBeLessThan(m.order.indexOf('alert'));
  });

  it('passes dryRun=1 through to ingest after the cron secret is accepted', async () => {
    await GET(cronRequest('/api/cron/daily?dryRun=1'));
    expect(m.startIngestRun).toHaveBeenCalledWith('cron/daily', { dryRun: true });
    expect(m.ingestAndExtract).toHaveBeenCalledWith({ dryRun: true });
  });

  it('does not start a job when the Vercel Cron header is missing the secret', async () => {
    const res = await GET(cronRequest('/api/cron/daily', false));
    expect(res.status).toBe(401);
    expect(m.startIngestRun).not.toHaveBeenCalled();
    expect(m.ingestAndExtract).not.toHaveBeenCalled();
  });

  it('marks leftover running rows failed and alerts before starting this run', async () => {
    m.failStaleIngestRuns.mockResolvedValue([{ id: 'old', trigger: 'cron/daily' }]);
    await GET(cronRequest());
    expect(m.failStaleIngestRuns).toHaveBeenCalled();
    expect(m.maybeAlertCronFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failedSteps: ['ingest'],
        steps: {
          ingest: expect.objectContaining({
            status: 'failed',
            error: expect.stringMatching(/Timed out or killed/),
          }),
        },
      }),
    );
    expect(m.startIngestRun).toHaveBeenCalled();
  });
});
