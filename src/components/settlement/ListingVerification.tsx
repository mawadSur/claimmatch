import { BadgeCheck, ExternalLink } from 'lucide-react';
import type { CatalogLink } from '@/lib/lawsuit-display';
import type { Lawsuit } from '@/lib/types';
import { showVerifiedBadge, verifiedOnLabel } from '@/lib/verified-fields';

/**
 * Per-listing verification, not a site-wide banner. Compact so it does not
 * push the first settlement off a phone screen.
 *
 * `linkTitle` names the settlement for a screen reader. The catalog card sets
 * it because a page of cards would otherwise repeat a bare "Official site".
 */
export function ListingVerification({
  lawsuit,
  official,
  compact = false,
  open = true,
  linkTitle,
  verifiedFields,
  checkedLabel,
}: {
  lawsuit: Pick<
    Lawsuit,
    | 'slug'
    | 'verified_at'
    | 'verified_by'
    | 'eligibility_verified'
    | 'proof_verified'
    | 'administrator'
    | 'eligibility_text'
    | 'eligibility'
    | 'proof_required'
  >;
  official: CatalogLink | null;
  compact?: boolean;
  open?: boolean;
  linkTitle?: string;
  /** Server-passed flag so a client island hydrates the same as SSR. */
  verifiedFields?: boolean;
  /**
   * "Checked against the official notice on {date}", computed on the server
   * via noticeCheckedOnLabel. Passing it keeps settlement-guides out of client
   * islands (homepage HTML trim).
   */
  checkedLabel?: string | null;
}) {
  const verified = showVerifiedBadge(lawsuit, verifiedFields);
  const checked = checkedLabel ?? null;
  const link = (href: string, label: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded font-semibold underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {label}
      {linkTitle ? (
        <>
          <ExternalLink className="ml-0.5 inline h-3 w-3" aria-hidden="true" />
          <span className="sr-only"> for {linkTitle} (opens in a new tab)</span>
        </>
      ) : null}
    </a>
  );
  const source =
    official?.kind === 'official' ? (
      link(official.href, official.label)
    ) : official ? (
      <>Source: {link(official.href, official.label)}. We don’t have the official site’s link yet.</>
    ) : (
      'We don’t have its link yet.'
    );
  if (verified) {
    const label = verifiedOnLabel(lawsuit.verified_at);
    return (
      <p className={`flex min-w-0 items-start gap-1.5 text-xs text-success-700 ${compact ? '' : 'mt-3'}`}>
        <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">Verified</span>
          {label ? ` · ${label}` : ' against the official notice.'} {source}
        </span>
      </p>
    );
  }
  if (checked) {
    return (
      <p className={`min-w-0 text-xs text-ink-muted ${compact ? '' : 'mt-3'}`}>
        {checked} {source}
      </p>
    );
  }
  return (
    <div className={`min-w-0 ${compact ? '' : 'mt-3'}`}>
      <p className="flex items-start gap-1.5 text-xs text-ink-muted">
        <span>
          {!compact &&
            (open
              ? 'Confirm the deadline, who qualifies and what proof you need on the official site. '
              : 'The official site has the latest status. ')}
          {source}
        </span>
      </p>
    </div>
  );
}
