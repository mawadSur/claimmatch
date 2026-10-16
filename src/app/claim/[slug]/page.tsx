import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarX2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  eligibilitySummary,
  linkHost,
  proofNeed,
  safeExternalUrl,
  toClaimView,
} from '@/lib/claims';
import { UUID_RE, claimContext, loadSettlementBySlug, logClaimsError } from '@/lib/claims-server';
import { formatDeadline } from '@/lib/utils';
import { ClaimFlow, type ClaimFlowSettlement } from '@/components/claims/ClaimFlow';
import { UnverifiedLabel } from '@/components/claims/UnverifiedLabel';
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
 * without a claim, unlisted and fictional settlements are a 404.
 */
export default async function ClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/claim/${slug}`)}`);

  const lookup = await loadSettlementBySlug(slug);
  // A failed read is not "taken down": someone coming back from the official
  // site to report filing gets a retry, never a 404.
  if (!lookup.ok) return <LoadError slug={slug} what="this settlement" />;
  const settlement = lookup.settlement;
  if (!settlement || !UUID_RE.test(settlement.id)) notFound();

  const now = new Date();
  const context = claimContext(settlement, now);
  const { data: claimRow, error: claimError } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', user.id)
    .eq('lawsuit_id', settlement.id)
    .maybeSingle();
  if (claimError) logClaimsError('claim page lookup failed', claimError);
  const claim = claimRow ? toClaimView(claimRow as Record<string, unknown>) : null;

  if (claimError) return <LoadError slug={slug} what="your claim" />;
  if (!claim && (!context.published || context.fictional)) notFound();

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
        {!context.fictional && <UnverifiedLabel />}
      </div>
      <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">{settlement.title}</h1>
    </>
  );

  if (!claim && !context.openForClaims) {
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
            If you think that&rsquo;s wrong, check the official site.
          </p>
          <Link href="/lawsuits" className="btn-primary mt-5 w-full sm:w-auto">
            Browse open settlements <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  const flowSettlement: ClaimFlowSettlement = {
    id: settlement.id,
    slug: settlement.slug,
    title: settlement.title,
    deadline: settlement.deadline,
    officialUrl: safeExternalUrl(settlement.claim_url),
    sourceUrl: safeExternalUrl(settlement.source_url),
    sourceHost: linkHost(settlement.source_url),
    eligibility: eligibilitySummary(settlement.eligibility_text),
    proof: proofNeed(settlement),
  };

  return (
    <section className="container-narrow py-10 sm:py-12">
      {header}
      <div className="mt-6">
        <ClaimFlow settlement={flowSettlement} context={context} initialClaim={claim} nowIso={now.toISOString()} />
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
