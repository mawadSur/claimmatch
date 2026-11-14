import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarX2, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { loadClaimScreen } from '@/lib/claim-screen-server';
import { formatDeadline } from '@/lib/utils';
import { flags } from '@/lib/flags';
import { signedOutClaimHref } from '@/lib/signup-context';
import { ClaimFlow } from '@/components/claims/ClaimFlow';
import { loadOneClickClaimPage } from '@/components/filing/claim-page-data';
import { SignupContextReturned } from '@/components/analytics/SignupContextReturned';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'How to file your claim',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The Part A filing flow. Signed-in only (the middleware and this page send
 * signed-out people to log in and back). A settlement the user already tracks
 * stays readable after it closes or leaves the catalog (account-only view);
 * without a claim, unlisted and fictional settlements are a 404, and a closed
 * one still takes "I filed my claim" until 30 days after its deadline. With
 * ONE_CLICK_FILING_ENABLED on, the one-click flow joins it (strong matches on
 * an agent lane, and claims already in a one-click status).
 */
export default async function ClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(signedOutClaimHref(`/claim/${slug}`));

  const now = new Date();
  const screen = await loadClaimScreen(supabase, user.id, slug, now);
  if (screen.kind === 'load_error') return <LoadError slug={slug} what={screen.what} />;
  if (screen.kind === 'not_found') notFound();
  const { settlement, context, claim } = screen;

  const header = (
    <>
      <Link
        href={claim ? '/dashboard' : `/lawsuits/${settlement.slug}`}
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {claim ? 'Back to your claims' : 'Back to the settlement'}
      </Link>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {settlement.category && <span className="badge-brand">{settlement.category}</span>}
      </div>
      <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">{settlement.title}</h1>
    </>
  );

  if (screen.kind === 'closed') {
    const official = screen.officialUrl;
    return (
      <section className="container-narrow py-10 sm:py-12">
        {header}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CalendarX2 className="h-5 w-5 text-ink-muted" aria-hidden />
            This settlement is closed
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {settlement.deadline && context.deadlinePassed
              ? `Its deadline was ${formatDeadline(settlement.deadline)}, so it is no longer taking claims.`
              : 'It is no longer taking claims.'}{' '}
            {official ? (
              <>
                If you think that&rsquo;s wrong,{' '}
                <a
                  href={official}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  check the official site
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                .
              </>
            ) : (
              <>
                If you think that&rsquo;s wrong, check the official site: use the link in the
                notice you got by mail or email.
              </>
            )}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            If you filed before the deadline, keep the confirmation the settlement administrator
            sent you.
          </p>
          <Link href="/lawsuits" className="btn-primary mt-5 w-full sm:w-auto">
            Browse open settlements <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  // One-click filing: null (nothing read) while ONE_CLICK_FILING_ENABLED is off.
  const oneClick = await loadOneClickClaimPage({
    supabase,
    userId: user.id,
    accountEmail: user.email ?? null,
    slug: settlement.slug,
    lawsuitId: settlement.id,
    claim,
    context,
    now,
  });

  return (
    <section className="container-narrow py-10 sm:py-12">
      {flags.signupContext() ? <SignupContextReturned claimPath={`/claim/${settlement.slug}`} /> : null}
      {header}
      <div className="mt-6">
        <ClaimFlow
          settlement={screen.flowSettlement}
          context={context}
          initialClaim={claim}
          nowIso={now.toISOString()}
          profile={screen.profile}
          oneClick={oneClick}
        />
      </div>
      <div className="mt-10">
        <Disclaimer compact />
      </div>
    </section>
  );
}

function LoadError({ slug, what }: { slug: string; what: string }) {
  return (
    <section className="container-narrow py-16">
      <div role="alert" className="rounded-2xl border border-danger-50 bg-white p-6 shadow-card">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <AlertCircle className="h-5 w-5 text-danger-700" aria-hidden />
          We couldn&rsquo;t load {what}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">Please refresh the page. If it keeps happening, try again in a few minutes.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href={`/claim/${slug}`} className="btn-primary">
            Try again
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Go to your dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
