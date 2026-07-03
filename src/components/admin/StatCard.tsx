import type { ReactNode } from 'react';

/**
 * Presentational metric tile for the admin dashboard. Purely visual — the page
 * computes the numbers and passes them in.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        {icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight text-ink">{value}</div>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}
