/** Placeholder while a settlement page loads. */
export default function LawsuitLoading() {
  return (
    <section className="container-page py-10 sm:py-14" aria-busy="true">
      <p className="sr-only" role="status">
        Loading settlement…
      </p>
      <div className="animate-pulse" aria-hidden="true">
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="mt-6 flex gap-2">
          <div className="h-6 w-24 rounded-full bg-gray-200" />
          <div className="h-6 w-28 rounded-full bg-gray-200" />
        </div>
        <div className="mt-5 h-9 w-full max-w-2xl rounded bg-gray-200" />
        <div className="mt-3 h-5 w-full max-w-xl rounded bg-gray-100" />
        <div className="mt-8 h-24 w-full rounded-xl bg-amber-50" />
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="h-48 rounded-2xl bg-gray-100 lg:col-span-2" />
          <div className="h-48 rounded-2xl bg-gray-100" />
        </div>
      </div>
    </section>
  );
}
