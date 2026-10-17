/** Shown while the dashboard loads. */
export default function DashboardLoading() {
  return (
    <div className="bg-gray-50">
      <div className="container-page space-y-8 py-10 sm:py-14" aria-busy="true">
        <p role="status" className="sr-only">
          Loading your claims…
        </p>
        <div className="space-y-3" aria-hidden>
          <div className="h-6 w-32 animate-pulse rounded-full bg-gray-200" />
          <div className="h-9 w-64 animate-pulse rounded-xl bg-gray-200" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-gray-200" />
        </div>
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white shadow-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
