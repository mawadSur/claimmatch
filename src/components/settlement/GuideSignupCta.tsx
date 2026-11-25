import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  OFFICIAL_FILING_IS_FREE,
  WE_FILE_THIS_CLAIM_GUIDE,
  WE_HELP_YOU_FILE_GUIDE,
  type SettlementFilingMode,
} from '@/lib/copy';
import { guideSignupHref } from '@/lib/signup-context';

/** Easy signup on every public settlement guide. Never names the 15% fee. */
export function GuideSignupCta({
  slug,
  filingMode,
  className,
}: {
  slug: string;
  filingMode: SettlementFilingMode;
  className?: string;
}) {
  const href = guideSignupHref(slug);
  const filingLine =
    filingMode === 'agent' ? WE_FILE_THIS_CLAIM_GUIDE : WE_HELP_YOU_FILE_GUIDE;
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-ink">{filingLine}</p>
      <Link href={href} className="btn-primary mt-3 w-full justify-center sm:w-auto">
        Create a free account <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <p className="mt-2 text-xs text-ink-muted">{OFFICIAL_FILING_IS_FREE}</p>
    </div>
  );
}
