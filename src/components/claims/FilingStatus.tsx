import { filingStatusLabel } from '@/lib/filing/queue';
import type { FilingJob } from '@/lib/types';

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
        Status of jobs you authorized ClaimMatch to send to an administrator.
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
                  Needs input: {job.needs_user_reason === 'captcha' ? 'a captcha' : 'missing information'}
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
