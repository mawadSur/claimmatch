import Link from 'next/link';
import { BETA_FEE_COPY, feeEveryClaimCopy } from '@/lib/copy';
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
    : `${BETA_FEE_COPY} You always file on the official site, and ClaimMatch never files for you.`;

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
