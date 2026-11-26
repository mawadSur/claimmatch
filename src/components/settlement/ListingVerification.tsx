import { AlertTriangle, BadgeCheck } from 'lucide-react';
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
  if (verified) {
    const label = verifiedOnLabel(lawsuit.verified_at);
    return (
      <p className={`flex min-w-0 items-start gap-1.5 text-xs text-success-700 ${compact ? '' : 'mt-3'}`}>
        <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{label || 'Verified against the official notice.'}</span>
      </p>
    );
  }
  if (checked) {
    return <p className={`min-w-0 text-xs text-ink-muted ${compact ? '' : 'mt-3'}`}>{checked}</p>;
  }
  return (
    <div className={`min-w-0 ${compact ? '' : 'mt-3'}`}>
      <p className="flex items-start gap-1.5 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        <span>
          <span className="font-semibold">Unverified: check the official site.</span>{' '}
          {!compact &&
            (open
              ? 'We haven’t checked this listing against the official settlement notice yet. Before you file, confirm the deadline, who qualifies and what proof you need on the official site. '
              : 'We haven’t checked this listing against the official settlement notice. The official site has the latest status. ')}
          {official?.kind === 'official' ? (
            <a
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2 hover:text-amber-900"
            >
              {official.label}
            </a>
          ) : official ? (
            <>We don’t have the official site’s link yet.</>
          ) : (
            'We don’t have its link yet.'
          )}
        </span>
      </p>
    </div>
  );
}
