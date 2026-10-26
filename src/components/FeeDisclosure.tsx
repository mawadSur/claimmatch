import Link from 'next/link';
import { FEE_DISPLAY, isFeeTbd } from '@/lib/fee';

/**
 * Single public fee surface. When the amount is TBD, ClaimMatch is free during
 * beta. Use this instead of a hard-coded percentage on public pages.
 */
export function FeeDisclosure({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const body = isFeeTbd()
    ? 'ClaimMatch is free. We never take a cut of a settlement. You file on the official site.'
    : `If a price is ever added it will be ${FEE_DISPLAY}, shown before you use it. ClaimMatch never takes a cut of a settlement.`;

  if (compact) {
    return (
      <p className={className || 'text-sm text-ink-muted'}>
        {body}{' '}
        <Link href="/how-we-make-money" className="font-semibold text-brand-700 hover:text-brand-800">
          How ClaimMatch makes money
        </Link>
      </p>
    );
  }

  return (
    <div className={className || 'rounded-2xl border border-brand-100 bg-brand-50/60 p-5'}>
      <p className="text-sm font-semibold text-ink">Our fee</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      <Link
        href="/how-we-make-money"
        className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800"
      >
        How ClaimMatch makes money
      </Link>
    </div>
  );
}
