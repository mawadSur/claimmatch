import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { BROWSE_NO_ACCOUNT, FILE_FREE_DIRECTLY, accountGateWhy, lawsuitAiMayFile } from '@/lib/copy';
import { cn } from '@/lib/utils';

/**
 * Shown at the account gate (signup, match-result save, filing start).
 * Visitors already saw match results; this explains why an account exists.
 */
export function WhyAccountExplainer({
  className,
  heading = 'Why an account?',
}: {
  className?: string;
  heading?: string;
}) {
  const mayFile = lawsuitAiMayFile();
  const points = [
    BROWSE_NO_ACCOUNT,
    FILE_FREE_DIRECTLY,
    accountGateWhy(mayFile),
  ];

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-5', className)}>
      <h2 className="text-base font-bold">{heading}</h2>
      <ul className="mt-3 space-y-2">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">
        Continue with Apple or Google, or email a sign-in link. See{' '}
        <Link href="/privacy" className="text-link">
          Privacy
        </Link>
        .
      </p>
    </div>
  );
}
