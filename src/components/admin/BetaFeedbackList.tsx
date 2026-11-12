import type { BetaFeedbackRow } from '@/lib/beta-feedback';

export function BetaFeedbackList({ rows }: { rows: BetaFeedbackRow[] }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Beta feedback</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Signed-in notes from the dashboard prompt. Free text stays here — it is
        never emailed and never sent to PostHog. Interview opt-in is a flag
        only; reach out yourself.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="py-2 pr-3 font-semibold">When</th>
              <th className="py-2 pr-3 font-semibold">Call?</th>
              <th className="py-2 pr-3 font-semibold">What almost stopped you</th>
              <th className="py-2 font-semibold">What&apos;s missing</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-muted">
                  No feedback yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 align-top last:border-0">
                <td className="py-2 pr-3 text-xs text-ink-muted">
                  {new Date(row.created_at).toUTCString()}
                  {row.dismissed ? (
                    <div className="mt-0.5 font-semibold text-ink-soft">Dismissed</div>
                  ) : null}
                  {row.email ? (
                    <div className="mt-0.5 font-mono text-[11px] text-ink-soft">{row.email}</div>
                  ) : null}
                </td>
                <td className="py-2 pr-3">
                  <span className={row.interview_opt_in ? 'font-semibold text-brand-700' : 'text-ink-muted'}>
                    {row.interview_opt_in ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="py-2 pr-3 text-ink">{row.almost_stopped || '—'}</td>
                <td className="py-2 text-ink">{row.whats_missing || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
