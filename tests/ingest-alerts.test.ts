import { afterEach, describe, expect, it, vi } from 'vitest';
import { ingestAlertDecision, renderIngestAlertEmail } from '@/lib/ingest-alerts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ingestAlertDecision', () => {
  it('alerts when the ingest step failed', () => {
    expect(ingestAlertDecision({ status: 'failed', error: 'feed timed out' })).toEqual({
      reason: 'failed',
      error: 'feed timed out',
      summary: {},
    });
  });

  it('alerts when a completed run updated 0 rows', () => {
    expect(
      ingestAlertDecision({
        status: 'ran',
        result: { ingested: 12, updated: 0, inserted: 0 },
      }),
    ).toEqual({
      reason: 'zero_updates',
      error: 'Ingest updated 0 catalog rows',
      summary: { ingested: 12, updated: 0, inserted: 0 },
    });
  });

  it('alerts as warning when the ingest step is a held-only warning', () => {
    expect(
      ingestAlertDecision({
        status: 'warning',
        error: '187 closures held for review',
        result: { held: 187, updated: 12 },
      }),
    ).toEqual({
      reason: 'warning',
      error: '187 closures held for review',
      summary: { held: 187, updated: 12 },
    });
  });

  it('does not page skipped runs or older summaries without updated', () => {
    expect(ingestAlertDecision({ status: 'skipped', reason: 'paused' })).toBeNull();
    expect(ingestAlertDecision({ status: 'ran', result: { ingested: 2 } })).toBeNull();
    expect(ingestAlertDecision({ status: 'ran', result: { ingested: 2, updated: 4 } })).toBeNull();
  });
});

describe('ingest alert email', () => {
  it('renders a failed-run message', () => {
    const html = renderIngestAlertEmail({
      job: 'daily',
      reason: 'failed',
      error: 'feed timed out',
      at: '2026-10-28T06:00:00.000Z',
    });
    expect(html).toContain('Catalog ingest failed');
    expect(html).toContain('feed timed out');
  });

  it('renders a held-closure warning message', () => {
    const html = renderIngestAlertEmail({
      job: 'daily',
      reason: 'warning',
      error: '187 closures held for review',
      at: '2026-10-30T06:00:00.000Z',
    });
    expect(html).toContain('Catalog ingest held closures for review');
    expect(html).toContain('187 closures held for review');
  });
});
