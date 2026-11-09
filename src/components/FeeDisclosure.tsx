import Link from 'next/link';
import { feeEveryClaimCopy, publicBetaFeeCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';

/**
 * Single public fee surface. Default: free during beta. When
 * FEE_DISCLOSURE_ENABLED=1, states that ClaimMatch files the claim and
 * charges a recovery share only if the user is paid.
 */
export function FeeDisclosure({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const body = flags.feeDisclosure()
    ? feeEveryClaimCopy()
    : `${publicBetaFeeCopy()} You always file on the official site, and ClaimMatch never files for you.`;

  if (compact) {
    return (
      <p className={className || 'text-sm text-ink-muted'}>
        {body}{' '}
        <Link href="/how-we-make-money" className="text-link">
          How ClaimMatch makes money
        </Link>
      </p>
    );
  }

  return (
    <div className={className || 'rounded-2xl border border-slate-200 bg-brand-50 p-5'}>
      <p className="text-sm font-semibold text-ink">Cost</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      <Link
        href="/how-we-make-money"
        className="text-link mt-3 inline-flex text-sm"
      >
        How ClaimMatch makes money
      </Link>
    </div>
  );
}
