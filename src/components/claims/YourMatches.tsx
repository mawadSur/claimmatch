import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarClock, Sparkles, UserCog } from 'lucide-react';
import type { DashboardMatch } from './dashboard-model';

/**
 * Ranked matches for the signed-in user. Strong = rule-verified; Possible =
 * heuristic or state-only. Not a score list.
 */
export function YourMatches({
  items,
  failed = false,
  needsProfile = false,
}: {
  items: DashboardMatch[];
  failed?: boolean;
  needsProfile?: boolean;
}) {
  return (
    <section aria-labelledby="your-matches-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="your-matches-title" className="text-2xl font-extrabold">
            Your matches
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Settlements that may apply to you, best first. A strong match passed
            the listing&rsquo;s stated rules. A possible match is a state-only or
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
      ) : items.length === 0 ? (
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
      ) : (
        <ul className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      item.strength === 'strong'
                        ? 'badge-green gap-1'
                        : 'badge-brand gap-1'
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
              </div>
              <Link
                href={`/claim/${item.slug}`}
                className="btn-secondary shrink-0 !px-4 !py-2 text-sm"
                aria-label={`How to file: ${item.title}`}
              >
                How to file <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
