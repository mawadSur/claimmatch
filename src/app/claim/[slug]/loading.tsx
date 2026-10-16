/** Shown while the claim page loads. */
export default function ClaimLoading() {
  return (
    <section className="container-narrow py-10 sm:py-12" aria-busy="true">
      <p role="status" className="sr-only">
        Loading the steps for this claim…
      </p>
      <div className="space-y-3" aria-hidden>
        <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
        <div className="h-6 w-56 animate-pulse rounded-full bg-gray-200" />
        <div className="h-9 w-full max-w-lg animate-pulse rounded-xl bg-gray-200" />
      </div>
      <div className="mt-6 space-y-5" aria-hidden>
        <div className="h-36 animate-pulse rounded-2xl bg-white shadow-card" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-white shadow-card" />
        ))}
      </div>
    </section>
  );
}
