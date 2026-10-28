import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/utils';
import type { StepResult } from '@/app/api/cron/_lib/report';

export type IngestAlertReason = 'failed' | 'zero_updates';

export interface IngestAlertDecision {
  reason: IngestAlertReason;
  error: string;
  summary: Record<string, unknown>;
}

function asSummary(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  return result as Record<string, unknown>;
}

/**
 * Alert when the ingest step failed, or when a completed run reports
 * updated === 0 (the field must be present so older summaries do not page).
 */
export function ingestAlertDecision(step: StepResult | null | undefined): IngestAlertDecision | null {
  if (!step) return null;
  if (step.status === 'skipped') return null;
  if (step.status === 'failed') {
    return {
      reason: 'failed',
      error: step.error,
      summary: asSummary(step.result),
    };
  }
  if (step.status === 'ran') {
    const summary = asSummary(step.result);
    if (typeof summary.updated === 'number' && summary.updated === 0) {
      return {
        reason: 'zero_updates',
        error: 'Ingest updated 0 catalog rows',
        summary,
      };
    }
  }
  return null;
}

function getResend(): { emails: { send: (o: unknown) => Promise<unknown> } } | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const { Resend } = require('resend');
    return new Resend(key);
  } catch {
    return null;
  }
}

function adminInboxes(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

export function renderIngestAlertEmail(input: {
  job: string;
  reason: IngestAlertReason;
  error: string;
  at: string;
}): string {
  const title = input.reason === 'failed' ? 'Catalog ingest failed' : 'Catalog ingest updated 0 rows';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;color:#171326;">
  <h1 style="font-size:18px;">${title}</h1>
  <p>Job: ${input.job}</p>
  <p>When: ${input.at}</p>
  <p>Detail: ${input.error}</p>
  <p>Check /admin → Last catalog ingest.</p>
</body></html>`;
}

async function sendIngestAlertEmail(input: {
  job: string;
  reason: IngestAlertReason;
  error: string;
  at: string;
}): Promise<boolean> {
  if (!flags.ingestAlertEmails()) return false;
  const to = adminInboxes();
  if (to.length === 0) {
    console.log('[ingest-alert] INGEST_ALERT_EMAILS_ENABLED=1 but ADMIN_EMAILS is empty');
    return false;
  }
  const resend = getResend();
  if (!resend) {
    console.log('[ingest-alert] RESEND_API_KEY not set — skipping ingest alert email');
    return false;
  }
  const from = process.env.RESEND_FROM || 'ClaimMatch <onboarding@resend.dev>';
  try {
    await resend.emails.send({
      from,
      to,
      subject: `${input.reason === 'failed' ? 'Ingest failed' : 'Ingest updated 0 rows'} on ${SITE.name}`,
      html: renderIngestAlertEmail(input),
    });
    return true;
  } catch (err) {
    console.error('[ingest-alert] email failed', err);
    return false;
  }
}

/** Record an alert row (always) and email when the email flag is on. Never throws. */
export async function maybeRecordIngestAlert(
  job: string,
  step: StepResult | null | undefined,
  opts: { at?: string } = {},
): Promise<IngestAlertDecision | null> {
  const decision = ingestAlertDecision(step);
  if (!decision) return null;
  const at = opts.at ?? new Date().toISOString();
  try {
    const emailed = await sendIngestAlertEmail({
      job,
      reason: decision.reason,
      error: decision.error,
      at,
    });
    const svc = createServiceClient();
    const { error } = await svc.from('ingest_alerts').insert({
      job,
      reason: decision.reason,
      error: decision.error,
      summary: decision.summary,
      emailed_at: emailed ? at : null,
    });
    if (error) console.error('[ingest-alert] insert failed', { code: error.code });
  } catch (err) {
    console.error('[ingest-alert] record failed', err);
  }
  return decision;
}
