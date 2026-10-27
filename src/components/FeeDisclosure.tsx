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
    ? 'ClaimMatch is free during beta. We may introduce a fee later. We’ll tell you before it applies, and you’ll see the price before you use anything paid. You always file on the official site, and ClaimMatch never files for you.'
    : `The price is ${FEE_DISPLAY}. You’ll see the price before you use anything paid. You always file on the official site, and ClaimMatch never files for you.`;

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
      <p className="text-sm font-semibold text-ink">Cost</p>
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
