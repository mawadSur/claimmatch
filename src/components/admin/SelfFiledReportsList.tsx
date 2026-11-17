import Link from 'next/link';

export interface AdminSelfFiledRow {
  id: string;
  created_at: string;
  email: string | null;
  lawsuit_title: string | null;
  lawsuit_slug: string | null;
  has_confirmation_number: boolean;
  has_screenshot: boolean;
}

export function SelfFiledReportsList({ rows }: { rows: AdminSelfFiledRow[] }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Self-filed reports</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Members who marked a claim as filed on the official site. Confirmation
        numbers stay here — they are never sent to PostHog. Screenshots are in
        a private bucket.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="py-2 pr-3 font-semibold">When</th>
              <th className="py-2 pr-3 font-semibold">Settlement</th>
              <th className="py-2 pr-3 font-semibold">Number?</th>
              <th className="py-2 font-semibold">Screenshot?</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-muted">
                  No self-filed reports yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 align-top last:border-0">
                <td className="py-2 pr-3 text-xs text-ink-muted">
                  {new Date(row.created_at).toUTCString()}
                  {row.email ? (
                    <div className="mt-0.5 font-mono text-[11px] text-ink-soft">{row.email}</div>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-ink">
                  {row.lawsuit_slug ? (
                    <Link href={`/lawsuits/${row.lawsuit_slug}`} className="font-semibold text-brand-700 underline underline-offset-2">
                      {row.lawsuit_title || row.lawsuit_slug}
                    </Link>
                  ) : (
                    row.lawsuit_title || '—'
                  )}
                </td>
                <td className="py-2 pr-3 text-ink-muted">{row.has_confirmation_number ? 'Yes' : 'No'}</td>
                <td className="py-2 text-ink-muted">{row.has_screenshot ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
