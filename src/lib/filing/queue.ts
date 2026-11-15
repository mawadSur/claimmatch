import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';
import type { FilingJob, FilingJobStatus, Lawsuit } from '@/lib/types';

/**
 * Legacy assisted filing (0015, ASSISTED_FILING_ENABLED). Retired: one-click
 * filing (src/lib/filing/v2, ONE_CLICK_FILING_ENABLED) replaces it. The
 * authorize route answers 410, nothing drains the old queue, and no code
 * fills or submits an official form. What is left reads the old jobs so
 * existing rows still show.
 */

/** A settlement is offered only when the flag is on and its own marker allows it. */
export function assistedFilingAllowed(
  lawsuit: Pick<Lawsuit, 'assisted_filing_allowed'> | null | undefined,
  enabled = flags.assistedFiling(),
): boolean {
  return enabled && lawsuit?.assisted_filing_allowed === true;
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
