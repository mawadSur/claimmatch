import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';
import type { FilingJob, FilingJobStatus, FormFieldMapping, Lawsuit, Profile } from '@/lib/types';
import { sendFilingReceiptEmail } from './receipt';
import { createFilingWorker, type FilingWorker, type FilingWorkerResult } from './worker';

/** Primary path when the flag is on: every claim can be authorized. */
export function assistedFilingAllowed(
  _lawsuit?: Pick<Lawsuit, 'assisted_filing_allowed'>,
  enabled = flags.assistedFiling(),
): boolean {
  return enabled;
}

export async function queueFilingJob(input: {
  claimId: string;
  userId: string;
  lawsuitId: string;
  authorizationId: string;
}): Promise<{ ok: true; job: FilingJob } | { ok: false; error: string }> {
  if (!flags.assistedFiling()) {
    return { ok: false, error: 'Assisted filing is turned off.' };
  }
  const svc = createServiceClient();
  const { data: lawsuit, error: lawsuitError } = await svc
    .from('lawsuits')
    .select('id, assisted_filing_allowed')
    .eq('id', input.lawsuitId)
    .maybeSingle();
  if (lawsuitError || !lawsuit) {
    return { ok: false, error: 'We could not load this settlement.' };
  }
  if (!assistedFilingAllowed(lawsuit as Pick<Lawsuit, 'assisted_filing_allowed'>)) {
    return { ok: false, error: 'Assisted filing is not available for this settlement.' };
  }

  const { data: existing } = await svc
    .from('filing_jobs')
    .select('*')
    .eq('claim_id', input.claimId)
    .in('status', ['queued', 'needs_user', 'submitted'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: true, job: existing as FilingJob };
  }

  const { data, error } = await svc
    .from('filing_jobs')
    .insert({
      claim_id: input.claimId,
      user_id: input.userId,
      lawsuit_id: input.lawsuitId,
      authorization_id: input.authorizationId,
      status: 'queued',
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[filing] enqueue failed', { code: error?.code });
    return { ok: false, error: 'We could not queue this submission. Please try again.' };
  }
  return { ok: true, job: data as FilingJob };
}

export async function listUserFilingJobs(userId: string): Promise<FilingJob[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('filing_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data as FilingJob[];
  } catch {
    return [];
  }
}

export async function listAdminFilingJobs(limit = 100): Promise<FilingJob[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('filing_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as FilingJob[];
  } catch {
    return [];
  }
}

function nextStatus(result: FilingWorkerResult): FilingJobStatus {
  if (result.status === 'submitted') return 'submitted';
  if (result.status === 'needs_user') return 'needs_user';
  return 'failed';
}

async function loadMapping(
  svc: ReturnType<typeof createServiceClient>,
  lawsuit: Pick<Lawsuit, 'id' | 'administrator_id' | 'claim_url'>,
): Promise<FormFieldMapping> {
  if (!lawsuit.administrator_id) {
    return { claimUrl: lawsuit.claim_url ?? undefined, fields: [] };
  }
  const { data } = await svc
    .from('administrator_form_mappings')
    .select('mapping, lawsuit_id')
    .eq('administrator_id', lawsuit.administrator_id)
    .or(`lawsuit_id.eq.${lawsuit.id},lawsuit_id.is.null`)
    .order('lawsuit_id', { ascending: false, nullsFirst: false })
    .limit(2);
  const rows = (data ?? []) as Array<{ mapping: FormFieldMapping; lawsuit_id: string | null }>;
  const specific = rows.find((r) => r.lawsuit_id === lawsuit.id);
  const fallback = rows.find((r) => r.lawsuit_id == null);
  return specific?.mapping ?? fallback?.mapping ?? { claimUrl: lawsuit.claim_url ?? undefined, fields: [] };
}

/**
 * Drain due filing jobs. Tests pass a mock worker. The default stub never
 * submits a real form.
 */
export async function processFilingQueue(
  opts: { limit?: number; worker?: FilingWorker; now?: Date } = {},
): Promise<{ processed: number; results: Array<{ id: string; status: FilingJobStatus }> }> {
  if (!flags.assistedFiling()) return { processed: 0, results: [] };

  const svc = createServiceClient();
  const now = opts.now ?? new Date();
  const worker = opts.worker ?? createFilingWorker();
  const { data: due, error } = await svc
    .from('filing_jobs')
    .select('*')
    .eq('status', 'queued')
    .lte('run_after', now.toISOString())
    .order('run_after', { ascending: true })
    .limit(opts.limit ?? 10);
  if (error || !due?.length) return { processed: 0, results: [] };

  const results: Array<{ id: string; status: FilingJobStatus }> = [];
  for (const row of due as FilingJob[]) {
    const { data: locked } = await svc
      .from('filing_jobs')
      .update({
        attempts: row.attempts + 1,
        started_at: now.toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle();
    if (!locked) continue;

    const [{ data: lawsuit }, { data: profile }] = await Promise.all([
      svc
        .from('lawsuits')
        .select('id, title, claim_url, administrator_id, assisted_filing_allowed, slug')
        .eq('id', row.lawsuit_id)
        .maybeSingle(),
      svc
        .from('profiles')
        .select('full_name, email, phone, state, zip, address_line1, address_line2, city')
        .eq('id', row.user_id)
        .maybeSingle(),
    ]);

    if (!lawsuit || !assistedFilingAllowed(lawsuit as Pick<Lawsuit, 'assisted_filing_allowed'>)) {
      await svc
        .from('filing_jobs')
        .update({
          status: 'failed',
          error: 'Assisted filing is not allowed for this settlement.',
          finished_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      results.push({ id: row.id, status: 'failed' });
      continue;
    }

    const mapping = await loadMapping(svc, lawsuit as Pick<Lawsuit, 'id' | 'administrator_id' | 'claim_url'>);
    const outcome = await worker.fillAndSubmit({
      jobId: row.id,
      claimId: row.claim_id,
      lawsuitId: row.lawsuit_id,
      claimUrl: mapping.claimUrl ?? (lawsuit.claim_url as string | null),
      mapping,
      profile: (profile ?? {}) as Pick<
        Profile,
        'full_name' | 'email' | 'phone' | 'state' | 'zip' | 'address_line1' | 'address_line2' | 'city'
      >,
    });

    const status = nextStatus(outcome);
    const patch: Record<string, unknown> = {
      status,
      finished_at: new Date().toISOString(),
      result: outcome,
    };
    if (outcome.status === 'submitted') {
      patch.administrator_claim_id = outcome.administratorClaimId;
      patch.screenshot_url = outcome.screenshotUrl;
      patch.error = null;
    } else if (outcome.status === 'needs_user') {
      patch.needs_user_reason = outcome.reason;
      patch.error = outcome.detail ?? outcome.reason;
    } else {
      patch.error = outcome.error;
      if (row.attempts + 1 < row.max_attempts && outcome.status === 'failed') {
        patch.status = 'queued';
        patch.run_after = new Date(Date.now() + 60_000 * (row.attempts + 1)).toISOString();
        patch.finished_at = null;
      }
    }

    await svc.from('filing_jobs').update(patch).eq('id', row.id);
    const storedStatus = (patch.status as FilingJobStatus) ?? status;
    results.push({ id: row.id, status: storedStatus });

    if (outcome.status === 'submitted' && profile?.email) {
      await sendFilingReceiptEmail({
        to: profile.email as string,
        name: (profile.full_name as string | null) ?? undefined,
        lawsuitTitle: (lawsuit.title as string) ?? 'Your settlement',
        administratorClaimId: outcome.administratorClaimId,
        screenshotUrl: outcome.screenshotUrl,
      });
    }
  }

  return { processed: results.length, results };
}

export function filingStatusLabel(status: FilingJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'needs_user':
      return 'Needs your input';
    case 'submitted':
      return 'Sent to the administrator';
    case 'confirmed':
      return 'Confirmed by the administrator';
    case 'failed':
      return 'Did not go through';
    default:
      return status;
  }
}
