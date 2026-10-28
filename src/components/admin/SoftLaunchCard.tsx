import type { SoftLaunchCounts } from '@/lib/soft-launch';

export function SoftLaunchCard({ counts }: { counts: SoftLaunchCounts }) {
  const rows: Array<[string, number]> = [
    ['Signups', counts.signups],
    ['Onboarded', counts.onboarded],
    ['Official-form clicks', counts.officialFormClicks],
    ['Filings reported', counts.filingsReported],
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-ink">Soft launch</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Cohort starts with soft-. Internal testers are excluded.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="text-lg font-extrabold tabular-nums">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
