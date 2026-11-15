import { filingStatusLabel } from '@/lib/filing/queue';
import type { FilingJob } from '@/lib/types';

/**
 * The retired assisted-filing job list (ASSISTED_FILING_ENABLED, 0015).
 * A job that stopped for any reason, including a check on the official
 * site, is never handed to the member to solve for a machine: they finish
 * the claim themselves. One-click claims show in FilingSummaryList instead.
 */
export function FilingStatusList({
  jobs,
  titles,
}: {
  jobs: FilingJob[];
  titles: Record<string, string>;
}) {
  if (jobs.length === 0) return null;

  return (
    <section aria-labelledby="filing-status-title" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <h2 id="filing-status-title" className="text-lg font-bold">
        Authorized submissions
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Status of jobs you authorized Lawsuit AI to send to an administrator.
      </p>
      <ul className="mt-4 divide-y divide-gray-100">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-ink">{titles[job.lawsuit_id] ?? 'Settlement'}</p>
              {job.administrator_claim_id && (
                <p className="mt-1 text-sm text-ink-muted">
                  Administrator confirmation id: {job.administrator_claim_id}
                </p>
              )}
              {job.needs_user_reason && (
                <p className="mt-1 text-sm text-ink-muted">
                  Finish this claim yourself on the official site. Your details are on the claim page.
                </p>
              )}
              {job.error && job.status === 'failed' && (
                <p className="mt-1 text-sm text-ink-muted">{job.error}</p>
              )}
            </div>
            <span className="badge-brand shrink-0">{filingStatusLabel(job.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
