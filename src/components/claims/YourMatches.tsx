import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock, Sparkles, UserCog } from 'lucide-react';
import {
  POSSIBLE_MATCH_CAP,
  groupDashboardMatches,
  type DashboardMatch,
} from './dashboard-model';
import { FILE_FOR_YOU_CTA, SELF_FILE_SECONDARY } from '@/lib/copy';
import { MatchFeedback } from './MatchFeedback';

/**
 * Ranked matches for the signed-in user. Strong first; Possible is collapsed
 * and capped. Not a score list.
 */
export function YourMatches({
  items,
  failed = false,
  needsProfile = false,
  metricsEnabled = false,
  fileForYou = false,
}: {
  items: DashboardMatch[];
  failed?: boolean;
  needsProfile?: boolean;
  metricsEnabled?: boolean;
  /** ASSISTED_FILING_ENABLED: primary CTA authorizes ClaimMatch to file. */
  fileForYou?: boolean;
}) {
  const grouped = groupDashboardMatches(items);
  const hasAny = items.length > 0;

  return (
    <section aria-labelledby="your-matches-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="your-matches-title" className="text-2xl font-extrabold">
            Your matches
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Settlements that may apply to you. A strong match passed the
            listing&rsquo;s stated rules. A possible match is a state-only or
            broader fit. Always check the official notice before you file.
          </p>
        </div>
        <Link href="/settings" className="btn-ghost !py-2 text-sm">
          Edit profile
        </Link>
      </div>

      {failed ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-2xl border border-danger-50 bg-white p-5 text-sm shadow-card"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" aria-hidden />
          <p className="text-ink-muted">
            <span className="font-semibold text-ink">We couldn&rsquo;t load matches right now.</span>{' '}
            Please try again in a minute.
          </p>
        </div>
      ) : !hasAny ? (
        <EmptyMatches needsProfile={needsProfile} />
      ) : (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-ink">Strong matches</h3>
            {grouped.strong.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-brand-200 bg-white p-5 shadow-card">
                <p className="text-sm leading-relaxed text-ink-muted">
                  No strong matches yet. We only label a match strong when the
                  listing has structured who-qualifies rules that fit your
                  profile. Possible matches below are a broader fit — check the
                  official notice on each one.
                </p>
              </div>
            ) : (
              <MatchList items={grouped.strong} metricsEnabled={metricsEnabled} fileForYou={fileForYou} />
            )}
          </div>

          {grouped.possible.length > 0 && (
            <details className="rounded-2xl border border-gray-100 bg-white shadow-card">
              <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-ink sm:p-5">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>Possible matches ({grouped.possible.length}{grouped.possibleHidden ? `, ${grouped.possibleHidden} more not shown` : ''})</span>
                  <span className="text-xs font-medium text-ink-muted">Show or hide</span>
                </span>
              </summary>
              <div className="border-t border-gray-100 px-4 pb-4 sm:px-5 sm:pb-5">
                <p className="pt-3 text-sm text-ink-muted">
                  These are state-only or broader fits. Showing up to {POSSIBLE_MATCH_CAP}.
                </p>
                <MatchList items={grouped.possible} metricsEnabled={metricsEnabled} fileForYou={fileForYou} />
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyMatches({ needsProfile }: { needsProfile: boolean }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-brand-200 bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <UserCog className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink">
            {needsProfile ? 'Add a few profile details' : 'No open matches right now'}
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
            {needsProfile
              ? 'Tell us about vehicles, bank or credit accounts, shopping, streaming, or a data-breach notice. We use those answers to find settlements that may apply to you.'
              : 'Nothing open matches your profile today. You can add more details or browse the full list.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={needsProfile ? '/onboarding' : '/settings'} className="btn-primary">
              {needsProfile ? 'Finish your profile' : 'Update your profile'}{' '}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/lawsuits" className="btn-secondary">
              Browse open settlements
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchList({
  items,
  metricsEnabled,
  fileForYou,
}: {
  items: DashboardMatch[];
  metricsEnabled: boolean;
  fileForYou: boolean;
}) {
  return (
    <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  item.strength === 'strong' ? 'badge-green gap-1' : 'badge-brand gap-1'
                }
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                {item.label}
              </span>
            </div>
            <Link
              href={`/claim/${item.slug}`}
              className="mt-2 block rounded font-semibold text-ink hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {item.title}
            </Link>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              {item.deadlineText}
            </p>
            {item.reasons.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {metricsEnabled && (
              <MatchFeedback
                lawsuitId={item.id}
                score={item.score}
                reasons={item.reasons}
              />
            )}
          </div>
          {fileForYou ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <Link
                href={`/claim/${item.slug}#authorize`}
                className="btn-primary !px-4 !py-2 text-sm"
                aria-label={`${FILE_FOR_YOU_CTA}: ${item.title}`}
              >
                {FILE_FOR_YOU_CTA} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={`/claim/${item.slug}`}
                className="text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                {SELF_FILE_SECONDARY}
              </Link>
            </div>
          ) : (
            <Link
              href={`/claim/${item.slug}`}
              className="btn-secondary shrink-0 !px-4 !py-2 text-sm"
              aria-label={`How to file: ${item.title}`}
            >
              How to file <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
