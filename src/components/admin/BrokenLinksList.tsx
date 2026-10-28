export interface BrokenLinkRow {
  id: string;
  title: string;
  slug: string;
  claim_url: string | null;
  link_status: string | null;
  link_http_status: number | null;
  link_checked_at: string | null;
}

export function BrokenLinksList({ rows }: { rows: BrokenLinkRow[] }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Broken links</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Official claim URLs that did not return 2xx or 3xx. Listings are not unpublished.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">No broken official links recorded.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <p className="font-semibold text-ink">{row.title}</p>
              <p className="text-xs text-ink-muted">
                {row.link_status}
                {row.link_http_status != null ? ` ${row.link_http_status}` : ''}
                {row.claim_url ? ` · ${row.claim_url}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
