import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, LayoutDashboard, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { lookupLawsuits } from '@/lib/lawsuits';
import { isFictionalSettlementSlug, loadUserClaims } from '@/lib/claims-server';
import { ClaimList } from '@/components/claims/ClaimList';
import { ClosingSoon } from '@/components/claims/ClosingSoon';
import { CorrectiveNoticeList } from '@/components/claims/CorrectiveNoticeList';
import { buildClosingSoon, buildDashboard } from '@/components/claims/dashboard-model';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'Your claims',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The dashboard (D50 interim): the user's claims grouped by next step, the
 * corrective notice for claims the old flow wrongly called filed, and a
 * "Closing soon" catalog module. No match list, no scores, no dollar totals.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const { welcome } = await searchParams;
  const now = new Date();

  const [{ data: profile }, claims, catalog] = await Promise.all([
    supabase.from('profiles').select('full_name, onboarded').eq('id', user.id).maybeSingle(),
    loadUserClaims(user.id),
    // Only settlements open for claims (the shared rule); buildClosingSoon
    // applies the same rule again and drops tracked ones. A failed query is
    // shown as an error, never as "no deadlines coming up".
    lookupLawsuits().catch(() => ({ lawsuits: [], error: true })),
  ]);

  const { rows, notices } = buildDashboard(claims.items, now, isFictionalSettlementSlug);
  const tracked = new Set(claims.items.map((i) => i.claim.lawsuit_id));
  const closingSoon = buildClosingSoon(catalog.lawsuits, tracked, now, isFictionalSettlementSlug);

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <div className="bg-gray-50">
      <div className="container-page space-y-10 py-10 sm:py-14">
        <header>
          <span className="badge-brand gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden /> Your dashboard
          </span>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            {firstName ? `Hi, ${firstName}.` : 'Your claims'}
          </h1>
          <p className="mt-2 max-w-2xl leading-relaxed text-ink-muted">
            Track the claims you file on official settlement sites. ClaimMatch is
            free. It doesn&rsquo;t file for you and never takes a cut of your payment.
          </p>
        </header>

        {welcome === '1' && <WelcomeCard />}

        {/* Always rendered (it shows nothing without notices) so its answers stay
            on screen after router.refresh() drops the answered rows. */}
        <CorrectiveNoticeList items={notices} />

        {!profile?.onboarded && (
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <UserCog className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">Finish your profile</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
                  Add your name and state. It takes a minute. Some settlements
                  are only for people in certain states.
                </p>
              </div>
            </div>
            <Link href="/onboarding" className="btn-primary shrink-0">
              Finish profile <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        <section aria-labelledby="your-claims-title">
          <h2 id="your-claims-title" className="text-2xl font-extrabold">
            Your claims
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Grouped by what to do next. Check each official site for the exact
            deadline time.
          </p>
          <div className="mt-6">
            {claims.failed ? (
              <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger-50 bg-white p-5 shadow-card">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden />
                <div>
                  <p className="font-semibold text-ink">We couldn&rsquo;t load your claims right now.</p>
                  <p className="mt-1 text-sm text-ink-muted">Please refresh the page in a minute.</p>
                </div>
              </div>
            ) : (
              <ClaimList rows={rows} />
            )}
          </div>
        </section>

        <ClosingSoon items={closingSoon} failed={catalog.error} />

        <Disclaimer compact />
      </div>
    </div>
  );
}

function WelcomeCard() {
  const steps = [
    'Find an open settlement in our list.',
    'Read the official notice to see if you qualify.',
    'File on the official site. It’s free, and you do it yourself.',
    'Come back and tell us you filed. We keep your deadline and confirmation number in one place.',
  ];
  return (
    <section
      aria-labelledby="welcome-title"
      className="rounded-2xl border border-success-100 bg-white p-5 shadow-card sm:p-6"
    >
      <h2 id="welcome-title" className="flex items-center gap-2 text-lg font-bold">
        <CheckCircle2 className="h-5 w-5 text-success-600" aria-hidden />
        You&rsquo;re all set
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Here&rsquo;s how ClaimMatch works:</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Link href="/lawsuits" className="btn-primary mt-5">
        Browse open settlements <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
