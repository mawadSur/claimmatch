import type { Metadata } from 'next';
import Link from 'next/link';
import { MailX, CheckCircle2, ArrowRight, Settings2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  description: 'Manage your ClaimMatch match-alert emails.',
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const success = done === '1';

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-brand-100/50 blur-3xl" />

      <div className="container-narrow relative flex min-h-[70vh] items-center justify-center py-24">
        <div className="reveal w-full max-w-md rounded-3xl border border-brand-100 bg-white/90 p-8 text-center shadow-card backdrop-blur sm:p-10">
          {success ? (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success-600 text-white shadow-card">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">
                You&rsquo;re unsubscribed from match emails
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-ink-muted">
                We won&rsquo;t email you about new settlement matches anymore. You can turn
                alerts back on any time &mdash; changed your mind, or want to be first when
                money opens up?
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/settings" className="btn-primary w-full sm:w-auto">
                  <Settings2 className="h-4 w-4" /> Re-enable match alerts
                </Link>
                <Link href="/" className="btn-ghost w-full sm:w-auto">
                  Back home
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-card">
                <MailX className="h-7 w-7" />
              </div>
              <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">
                We couldn&rsquo;t process that link
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-ink-muted">
                The unsubscribe link may be expired or incomplete. You can manage your email
                preferences directly from your settings instead.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/settings" className="btn-primary w-full sm:w-auto">
                  <Settings2 className="h-4 w-4" /> Manage email preferences
                </Link>
                <Link href="/" className="btn-ghost w-full sm:w-auto">
                  Back home
                </Link>
              </div>
            </>
          )}

          <Link
            href="/lawsuits"
            className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Browse open settlements <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
