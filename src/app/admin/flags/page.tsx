import type { Metadata } from 'next';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { listFlagStatus } from '@/lib/flag-catalog';

export const metadata: Metadata = { title: 'Feature flags' };
export const dynamic = 'force-dynamic';

/**
 * Read-only list of every feature-flag env var this app reads, and whether
 * it is on in this environment. Admin-gated. Never shows secret values.
 */
export default async function AdminFlagsPage() {
  await requireAdmin('/admin/flags');
  const flags = listFlagStatus();
  const onCount = flags.filter((flag) => flag.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <span className="badge-brand gap-1.5">
          <ToggleLeft className="h-3.5 w-3.5" aria-hidden /> Flags
        </span>
        <h2 className="mt-3 text-2xl font-extrabold">Feature flags in this environment</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Each switch is on only when its env var is exactly <code>1</code>. This page is
          read-only — change values in Vercel env and redeploy. {onCount} of {flags.length}{' '}
          currently on. Secret keys are never shown.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Flag</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">What it does</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {flags.map((flag) => (
              <tr key={flag.env}>
                <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">{flag.env}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      flag.enabled
                        ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800'
                        : 'inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-ink-muted'
                    }
                  >
                    {flag.enabled ? (
                      <ToggleRight className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {flag.enabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-muted">{flag.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
