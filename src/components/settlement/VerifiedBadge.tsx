import { BadgeCheck } from 'lucide-react';
import type { VerifiedFieldSource } from '@/lib/verified-fields';
import { showVerifiedBadge, verifiedOnLabel } from '@/lib/verified-fields';

/**
 * Public "Verified on {date}" chip. Renders nothing unless the verified-fields
 * flag is on, verified_at is set, and at least one verified field has content.
 * Never says "unverified" or "AI verified".
 */
export function VerifiedBadge({
  lawsuit,
  className,
}: {
  lawsuit: VerifiedFieldSource;
  className?: string;
}) {
  if (!showVerifiedBadge(lawsuit)) return null;
  const label = verifiedOnLabel(lawsuit.verified_at);
  if (!label) return null;

  return (
    <span
      className={
        className ??
        'badge-green gap-1'
      }
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
