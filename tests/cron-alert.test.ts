import { describe, expect, it, vi } from 'vitest';
import { maybeAlertCronFailure, postAlertWebhook } from '@/lib/cron-alert';

describe('postAlertWebhook', () => {
  it('is a no-op when the URL is unset', async () => {
    const fetchImpl = vi.fn();
    await postAlertWebhook({ job: 'daily', error: 'boom', at: '2026-10-27T00:00:00Z' }, { url: '', fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs {job, error, at} when the URL is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await postAlertWebhook(
      { job: 'daily', error: 'feed timed out', at: '2026-10-27T06:00:00Z' },
      { url: 'https://hooks.example/alert', fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://hooks.example/alert');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      job: 'daily',
      error: 'feed timed out',
      at: '2026-10-27T06:00:00Z',
    });
  });

  it('swallows webhook failures', async () => {
    const log = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      postAlertWebhook(
        { job: 'digest', error: 'no', at: '2026-10-27T00:00:00Z' },
        { url: 'https://hooks.example/alert', fetchImpl, log },
      ),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});

describe('maybeAlertCronFailure', () => {
  it('does not fire on a clean report', async () => {
    const fetchImpl = vi.fn();
    await maybeAlertCronFailure(
      { job: 'daily', ok: true, failedSteps: [], steps: {} },
      { url: 'https://hooks.example/alert', fetchImpl },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fires with the failed step names and errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await maybeAlertCronFailure(
      {
        job: 'daily',
        ok: false,
        failedSteps: ['ingest'],
        steps: { ingest: { status: 'failed', error: '2 catalog reads or writes failed' } },
      },
      { url: 'https://hooks.example/alert', fetchImpl, at: '2026-10-27T06:00:00Z' },
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      job: 'daily',
      error: 'ingest: 2 catalog reads or writes failed',
      at: '2026-10-27T06:00:00Z',
    });
  });
});
