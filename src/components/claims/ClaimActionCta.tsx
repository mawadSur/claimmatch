import Link from 'next/link';
import { AlertTriangle, ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import {
  EASY_SUBMIT_BADGE,
  EASY_SUBMIT_EXPLAINER,
  claimActionCta,
  claimActionOf,
  hidesFileQualifySignup,
  isPublicEasySubmit,
  type ClaimActionDetails,
  type ClaimActionType,
} from '@/lib/claim-actions';
import { flags } from '@/lib/flags';

export function EasySubmitBadge({
  type,
  approved = false,
  enabled = flags.claimActionCtas(),
}: {
  type: ClaimActionType | null | undefined;
  /** Approved filing spec + policy. Draft desk_file rows stay hidden. */
  approved?: boolean;
  /** Server-passed flag so a client island hydrates the same as SSR. */
  enabled?: boolean;
}) {
  if (!enabled || !isPublicEasySubmit(type, approved)) return null;
  return (
    <span className="badge-green shrink-0 gap-1" title={EASY_SUBMIT_EXPLAINER}>
      <Sparkles className="h-3 w-3" aria-hidden="true" /> {EASY_SUBMIT_BADGE}
    </span>
  );
}

export function ClaimActionCta({
  slug,
  claimActionType,
  claimAction,
  officialHref,
  deskEligible = false,
  compact = false,
  selfHref,
}: {
  slug: string;
  claimActionType?: string | null;
  claimAction?: ClaimActionDetails | null;
  officialHref?: string | null;
  deskEligible?: boolean;
  compact?: boolean;
  /**
   * The path this CTA is being rendered on. Any button that would navigate
   * here is dropped: on /claim/[slug] the desk_file primary ("Submit a claim")
   * and the unapproved-draft secondary ("View claim details") both point at
   * /claim/[slug] itself, so they rendered as a second submit button that did
   * nothing while the real one sat further down the same page.
   */
  selfHref?: string | null;
}) {
  if (!flags.claimActionCtas()) return null;
  const { type, details } = claimActionOf({
    claim_action_type: claimActionType,
    claim_action: claimAction ?? null,
  });
  if (!type) return null;
  const model = claimActionCta({
    type,
    slug,
    officialHref,
    details,
    deskEligible,
  });
  // claimActionCta stays pure; the self-link is dropped here at render time.
  const primary = model.primary && model.primary.href !== selfHref ? model.primary : null;
  const secondary = model.secondary && model.secondary.href !== selfHref ? model.secondary : null;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'} data-claim-action={type}>
      {model.alert && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {model.alert}
        </p>
      )}
      <div>
        <p className="font-bold">{model.heading}</p>
        <p className="mt-1 text-sm text-ink-muted">{model.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {primary &&
          (primary.href.startsWith('/') ? (
            <Link href={primary.href} className="btn-primary grow basis-40 px-3">
              {primary.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <a href={primary.href} target="_blank" rel="noopener noreferrer" className="btn-primary grow basis-40 px-3">
              {primary.label} <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ))}
        {secondary &&
          (secondary.href.startsWith('/') ? (
            <Link href={secondary.href} className="btn-secondary grow basis-20 px-3">
              {secondary.label}
            </Link>
          ) : (
            <a href={secondary.href} target="_blank" rel="noopener noreferrer" className="btn-secondary grow basis-20 px-3">
              {secondary.label} <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ))}
      </div>
    </div>
  );
}

export function shouldHideFileButton(
  claimActionType?: string | null,
  enabled = flags.claimActionCtas(),
): boolean {
  if (!enabled) return false;
  return hidesFileQualifySignup(claimActionType);
}
