import type { CronReport } from '@/app/api/cron/_lib/report';

export interface CronAlertPayload {
  job: string;
  error: string;
  at: string;
}

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * POST {job, error, at} to ALERT_WEBHOOK_URL when set. Unset is a no-op.
 * Errors are swallowed and logged. Timeout defaults to 3s.
 */
export async function postAlertWebhook(
  payload: CronAlertPayload,
  opts: {
    url?: string | undefined;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    log?: (...args: unknown[]) => void;
  } = {},
): Promise<void> {
  const url = opts.url ?? process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = opts.log ?? console.error;

  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log('[alert] webhook failed:', err);
  }
}

/** Fire the webhook when a cron report has failed steps. Never throws. */
export async function maybeAlertCronFailure(
  report: Pick<CronReport, 'job' | 'ok' | 'failedSteps' | 'steps'>,
  opts?: Parameters<typeof postAlertWebhook>[1] & { at?: string },
): Promise<void> {
  if (report.ok || report.failedSteps.length === 0) return;
  const error = report.failedSteps
    .map((name) => {
      const step = report.steps[name];
      return step?.status === 'failed' ? `${name}: ${step.error}` : name;
    })
    .join('; ');
  await postAlertWebhook(
    { job: report.job, error, at: opts?.at ?? new Date().toISOString() },
    opts,
  );
}
