import { Send } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { filingStatusLabel, listAdminFilingJobs } from '@/lib/filing/queue';
import { createServiceClient } from '@/lib/supabase/server';
import type { FilingJob } from '@/lib/types';

/**
 * The legacy assisted-filing page (0015), admins only. /admin/filing renders it
 * whenever ONE_CLICK_FILING_ENABLED is off. Its copy says the queue is retired
 * (Phase 0 deleted the worker and the drain); the job list is unchanged.
 */
export async function LegacyAssistedFilingPage() {
  await requireAdmin('/admin/filing');

  if (!flags.assistedFiling()) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-extrabold">Assisted filing</h2>
        <p className="max-w-2xl text-sm text-ink-muted">
          This view is off. Set ASSISTED_FILING_ENABLED=1 after counsel review.
          The legacy assisted-filing queue is retired; one-click filing replaces it.
        </p>
      </div>
    );
  }

  const jobs = await listAdminFilingJobs(200);
  const titles = await loadTitles(jobs);

  return (
    <div className="space-y-6">
      <header>
        <span className="badge-brand gap-1.5">
          <Send className="h-3.5 w-3.5" /> Queue
        </span>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Assisted filing</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Jobs people authorized under the retired assisted-filing path. Nothing
          drains this queue and nothing posts to an official form.
        </p>
      </header>

      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-sm text-ink-muted">
          No filing jobs yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Settlement</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Confirmation id</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-3 font-medium text-ink">{titles[job.lawsuit_id] ?? job.lawsuit_id}</td>
                  <td className="px-4 py-3">{filingStatusLabel(job.status)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{job.administrator_claim_id ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{new Date(job.updated_at).toUTCString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function loadTitles(jobs: FilingJob[]): Promise<Record<string, string>> {
  const ids = [...new Set(jobs.map((j) => j.lawsuit_id))];
  if (ids.length === 0) return {};
  try {
    const svc = createServiceClient();
    const { data } = await svc.from('lawsuits').select('id, title').in('id', ids);
    return Object.fromEntries(
      ((data ?? []) as Array<{ id: string; title: string }>).map((row) => [row.id, row.title]),
    );
  } catch {
    return {};
  }
}
