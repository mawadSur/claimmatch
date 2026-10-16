import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock, ExternalLink, ShieldCheck } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { deadlineUrgencyLabel, formatDeadline } from '@/lib/utils';
import { displaySummary, isOpenForClaims, officialLinkFor } from '@/lib/lawsuits';
import { proofLabel } from '@/lib/proof';

/**
 * The settlement card (server component; brand top border from the original
 * site). It shows the payout as the source states it, the proof rule and the
 * deadline, the D50 "Unverified: check the official site" label with the
 * official link, and "Start your claim" while the settlement is open for
 * claims. A settlement that is not open shows "Claims closed" and no call to
 * action.
 *
 * `badge` replaces the category label, e.g. a claim status on the dashboard.
 * Labels with a percentage or "Matched" are dropped: ClaimMatch shows no match
 * scores (D50). `href` changes where the title links (default: the settlement
 * page).
 */
export function LawsuitCard({
  lawsuit,
  badge,
  reasons,
  href,
}: {
  lawsuit: Lawsuit;
  badge?: { label: string; tone?: 'brand' | 'green' | 'red' | 'gray' };
  reasons?: string[];
  href?: string;
}) {
  const open = isOpenForClaims(lawsuit);
  const urgency = open ? deadlineUrgencyLabel(lawsuit.deadline) : null;
  const detailsHref = `/lawsuits/${lawsuit.slug}`;
  const titleHref = href ?? detailsHref;
  const official = officialLinkFor(lawsuit);
  const summary = displaySummary(lawsuit);
  const shownBadge = badge && isAllowedBadge(badge.label) ? badge : undefined;

  const tone = shownBadge?.tone ?? 'brand';
  const badgeClass =
    tone === 'green' ? 'badge-green'
    : tone === 'red' ? 'badge-red'
    : tone === 'gray' ? 'badge-gray'
    : 'badge-brand';

  return (
    <article className="settlement-card group h-full">
      <div className="flex items-start justify-between gap-3">
        <span className={badgeClass}>{shownBadge?.label ?? lawsuit.category}</span>
        {urgency && (
          <span className="badge-red shrink-0 gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" /> {urgency}
          </span>
        )}
      </div>

      <h3 className="mt-3 text-lg font-bold leading-snug">
        <Link
          href={titleHref}
          className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {lawsuit.title}
        </Link>
      </h3>

      {summary && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{summary}</p>}

      {reasons && reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-success-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {r}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-gray-50 p-3">
        <Stat label="Deadline" value={formatDeadline(lawsuit.deadline)} />
        <Stat label="Proof" value={proofLabel(lawsuit)} />
        <div className="col-span-2">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Payout, as listed
          </dt>
          <dd className="mt-0.5 line-clamp-2 text-sm font-semibold text-ink">
            {lawsuit.typical_payout?.trim() || 'Not stated'}
          </dd>
        </div>
      </dl>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          <span className="font-semibold">Unverified: check the official site.</span>{' '}
          {official ? (
            <a
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded font-semibold underline underline-offset-2 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {official.label}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only"> for {lawsuit.title} (opens in a new tab)</span>
            </a>
          ) : (
            'We don’t have its link yet.'
          )}
        </span>
      </p>

      <div className="mt-auto pt-4">
        {open ? (
          <div className="flex gap-2">
            <Link href={`/claim/${lawsuit.slug}`} className="btn-primary flex-1 px-3">
              Start your claim <ArrowRight className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only"> for {lawsuit.title}</span>
            </Link>
            <Link href={detailsHref} className="btn-secondary px-3">
              Details<span className="sr-only"> about {lawsuit.title}</span>
            </Link>
          </div>
        ) : (
          <p className="rounded-xl bg-gray-100 px-3 py-2.5 text-center text-sm font-semibold text-gray-700">
            Claims closed
          </p>
        )}
      </div>
    </article>
  );
}

/** No match scores or "Matched" labels on cards (D50; no percentage scores anywhere). */
function isAllowedBadge(label: string): boolean {
  return !label.includes('%') && !/\bmatched\b/i.test(label);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
