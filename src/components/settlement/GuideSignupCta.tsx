import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  OFFICIAL_FILING_IS_FREE,
  WE_FILE_THIS_CLAIM_GUIDE,
  type SettlementFilingMode,
} from '@/lib/copy';
import { guideSignupHref } from '@/lib/signup-context';
import { EASY_SUBMIT_EXPLAINER, hidesFileQualifySignup, signupPromptFor, type ClaimActionType } from '@/lib/claim-actions';
import { flags } from '@/lib/flags';

/** Sign-in only to save / Easy submit. Hidden on automatic-payment and not-open. */
export function GuideSignupCta({
  slug,
  filingMode,
  claimActionType,
  className,
}: {
  slug: string;
  filingMode: SettlementFilingMode;
  claimActionType?: ClaimActionType | string | null;
  className?: string;
}) {
  if (flags.claimActionCtas() && hidesFileQualifySignup(claimActionType)) return null;
  const href = guideSignupHref(slug);
  const prompt = signupPromptFor(claimActionType ?? null);
  const filingLine =
    claimActionType === 'desk_file' || filingMode === 'agent'
      ? (filingMode === 'agent' ? WE_FILE_THIS_CLAIM_GUIDE : EASY_SUBMIT_EXPLAINER)
      : prompt?.why ?? 'Sign in only if you want to save this claim or get deadline alerts.';
  const label = prompt?.label ?? 'Sign in to save this claim';
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-ink">{filingLine}</p>
      <Link href={href} className="btn-secondary mt-3 w-full justify-center sm:w-auto">
        {label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <p className="mt-2 text-xs text-ink-muted">{OFFICIAL_FILING_IS_FREE}</p>
    </div>
  );
}
