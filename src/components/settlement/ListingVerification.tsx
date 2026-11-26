import { BadgeCheck } from 'lucide-react';
import type { CatalogLink } from '@/lib/lawsuits';
import type { Lawsuit } from '@/lib/types';
import { showVerifiedBadge, verifiedOnLabel } from '@/lib/verified-fields';
import { noticeCheckedOnLabel } from '@/lib/settlement-guides';

/**
 * Per-listing verification, not a site-wide banner. Compact so it does not
 * push the first settlement off a phone screen.
 */
export function ListingVerification({
  lawsuit,
  official,
  compact = false,
  open = true,
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
}) {
  const verified = showVerifiedBadge(lawsuit);
  const checked = noticeCheckedOnLabel(lawsuit.slug);
  const source =
    official?.kind === 'official' ? (
      <a
        href={official.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline underline-offset-2 hover:text-ink"
      >
        {official.label}
      </a>
    ) : official ? (
      <>Source: {official.label}. We don’t have the official site’s link yet.</>
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
