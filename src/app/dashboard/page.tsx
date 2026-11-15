import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, LayoutDashboard, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardData } from '@/lib/dashboard-server';
import { ClaimList } from '@/components/claims/ClaimList';
import { ClosingSoon } from '@/components/claims/ClosingSoon';
import { CorrectiveNoticeList } from '@/components/claims/CorrectiveNoticeList';
import { YourMatches } from '@/components/claims/YourMatches';
import { Disclaimer } from '@/components/Disclaimer';
import { FilingStatusList } from '@/components/claims/FilingStatus';
import { FilingSummaryList } from '@/components/filing/FilingSummaryList';
import { loadOneClickDashboard } from '@/components/filing/dashboard-data';
import { isOneClickStatus } from '@/components/filing/filing-model';
import { ONE_CLICK_COPY } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import {
  ANALYTICS_EVENTS,
  claimTimelineViewedProperties,
  matchesViewedProperties,
  matchReasonViewedProperties,
} from '@/lib/analytics/events';
import { ProfileCompletenessCard } from '@/components/dashboard/ProfileCompletenessCard';
import { BetaFeedbackPrompt } from '@/components/dashboard/BetaFeedbackPrompt';
import { profileCompleteness, shouldShowCompletenessCard } from '@/lib/profile-completeness';
import type { BetaFeedbackTrigger } from '@/lib/analytics/events';

export const metadata: Metadata = {
  title: 'Your claims',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The dashboard: ranked matches from the matcher, the user's claims grouped
 * by next step, the corrective notice, and a secondary "Closing soon" list.
 * With ONE_CLICK_FILING_ENABLED on it adds "Filing status" (one-click claims
 * and a "Ready to file" count) and the one-click entry on strong matches
 * whose settlement has an agent lane.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; denied?: string; password?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  const { welcome, denied, password } = await searchParams;
  const now = new Date();

  const {
    profile,
    claims,
    catalog,
    filingJobs,
    rows,
    notices,
    closingSoon,
    matchProfile,
    matches,
    needsProfile,
    firstName,
  } = await loadDashboardData(supabase, user.id, now);
  // Web only (the app's dashboard endpoint does not send it yet).
  const completeness =
    flags.profileCompleteness() && !catalog.error
      ? profileCompleteness(matchProfile, catalog.lawsuits, now)
      : null;
  const showCompleteness = completeness ? shouldShowCompletenessCard(completeness) : false;
  // matches_viewed: counted from the matches loadDashboardData ranked.
  const matchView = matchesViewedProperties({
    matchCount: matches.length,
    strongCount: matches.filter((row) => row.strength === 'strong').length,
    possibleCount: matches.filter((row) => row.strength !== 'strong').length,
  });
  // One-click filing: null (nothing read) while ONE_CLICK_FILING_ENABLED is off.
  // Lanes are looked up for strong matches only; possible matches never get the one-click entry.
  const oneClick = await loadOneClickDashboard({
    supabase,
    userId: user.id,
    now,
    strongMatchIds: matches.filter((row) => row.strength === 'strong').map((row) => row.id),
  });
  // One-click claims show under "Filing status"; "Your claims" keeps the self-file ones
  // (and all of them when the filing list could not be read, so none disappears).
  const oneClickClaimIds = new Set(
    oneClick?.summaries ? claims.items.filter((item) => isOneClickStatus(item.claim.status)).map((item) => item.claim.id) : [],
  );
  const claimRows = rows.filter((row) => !oneClickClaimIds.has(row.claimId));
  const hasReportedFiling = claims.items.some(
    (item) => item.claim.status === 'reported_filed' || item.claim.status === 'submitted',
  );
  let betaFeedbackTrigger: BetaFeedbackTrigger | null = null;
  if (flags.betaFeedback()) {
    try {
      const { data: existing, error } = await supabase
        .from('beta_feedback')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && !existing) {
        if (hasReportedFiling) betaFeedbackTrigger = 'filing';
        else if (matchView) betaFeedbackTrigger = 'matches';
      }
    } catch {
      // Table missing until 0033; keep the dashboard up.
    }
  }

  return (
    <div className="bg-gray-50">
      {matchView ? <CaptureOnce event="matches_viewed" properties={matchView} /> : null}
      {flags.claimTimeline() && rows.some((row) => row.timeline) ? (
        <CaptureOnce
          event={ANALYTICS_EVENTS.claim_timeline_viewed}
          properties={claimTimelineViewedProperties({ source: 'dashboard' })}
        />
      ) : null}
      {flags.matchReason() && matches.length > 0 ? (
        <CaptureOnce
          event={ANALYTICS_EVENTS.match_reason_viewed}
          properties={matchReasonViewedProperties({ matchCount: matches.length })}
        />
      ) : null}
      <div className="container-page space-y-10 py-10 sm:py-14">
        <header>
          <span className="badge-brand gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden /> Your dashboard
          </span>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            {firstName ? `Hi, ${firstName}.` : 'Your claims'}
          </h1>
          {oneClick ? (
            <p className="mt-2 max-w-2xl leading-relaxed text-ink-muted">{ONE_CLICK_COPY.dashboardIntro}</p>
          ) : (
            <p className="mt-2 max-w-2xl leading-relaxed text-ink-muted">
              Track the claims you file on official settlement sites.{' '}
              {flags.feeDisclosure()
                ? 'Official filing stays free.'
                : 'Lawsuit AI is free during beta.'}{' '}
              It doesn&rsquo;t file for you and never handles settlement payments.
            </p>
          )}
        </header>

        {denied === 'admin' && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You don&rsquo;t have access to the admin area. It&rsquo;s only for Lawsuit AI staff.
          </p>
        )}
        {password === 'updated' && (
          <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            Your password was updated.
          </p>
        )}

        {welcome === '1' && <WelcomeCard oneClick={Boolean(oneClick)} />}

        {/* Always rendered (it shows nothing without notices) so its answers stay
            on screen after router.refresh() drops the answered rows. */}
        <CorrectiveNoticeList items={notices} />

        {showCompleteness && completeness && <ProfileCompletenessCard result={completeness} />}
        {betaFeedbackTrigger ? <BetaFeedbackPrompt trigger={betaFeedbackTrigger} /> : null}

        {!profile?.onboarded && (
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <UserCog className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">Finish your profile</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
                  Add your name, state, and a few optional details (vehicles,
                  accounts, shopping). We use those to find settlements that may
                  apply to you.
                </p>
              </div>
            </div>
            <Link href="/onboarding" className="btn-primary shrink-0">
              Finish profile <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        <YourMatches
          items={matches}
          failed={catalog.error}
          needsProfile={needsProfile}
          metricsEnabled={flags.matchMetrics()}
          fileForYou={!oneClick && flags.assistedFiling()}
          oneClickLanes={oneClick?.lanes ?? null}
          canDismiss={flags.matchStore()}
          matchReasonEnabled={flags.matchReason()}
        />

        {oneClick ? <FilingSummaryList items={oneClick.summaries} /> : null}

        {flags.assistedFiling() && (
          <FilingStatusList
            jobs={filingJobs}
            titles={Object.fromEntries(catalog.lawsuits.map((l) => [l.id, l.title]))}
          />
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
              <ClaimList rows={claimRows} timelineEnabled={flags.claimTimeline()} />
            )}
          </div>
        </section>

        <ClosingSoon items={closingSoon} failed={catalog.error} />

        <Disclaimer compact />
      </div>
    </div>
  );
}

function WelcomeCard({ oneClick = false }: { oneClick?: boolean }) {
  const steps: readonly string[] = oneClick
    ? ONE_CLICK_COPY.welcomeSteps
    : [
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
      <p className="mt-1 text-sm text-ink-muted">Here&rsquo;s how Lawsuit AI works:</p>
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
