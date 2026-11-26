import Link from 'next/link';
import { AlertTriangle, ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import {
  EASY_SUBMIT_BADGE,
  EASY_SUBMIT_EXPLAINER,
  claimActionCta,
  claimActionOf,
  hidesFileQualifySignup,
  type ClaimActionDetails,
  type ClaimActionType,
} from '@/lib/claim-actions';
import { flags } from '@/lib/flags';

export function EasySubmitBadge({ type }: { type: ClaimActionType | null | undefined }) {
  if (!flags.claimActionCtas() || type !== 'desk_file') return null;
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
}: {
  slug: string;
  claimActionType?: string | null;
  claimAction?: ClaimActionDetails | null;
  officialHref?: string | null;
  deskEligible?: boolean;
  compact?: boolean;
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
        {model.primary &&
          (model.primary.href.startsWith('/') ? (
            <Link href={model.primary.href} className="btn-primary grow basis-40 px-3">
              {model.primary.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <a href={model.primary.href} target="_blank" rel="noopener noreferrer" className="btn-primary grow basis-40 px-3">
              {model.primary.label} <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ))}
        {model.secondary &&
          (model.secondary.href.startsWith('/') ? (
            <Link href={model.secondary.href} className="btn-secondary grow basis-20 px-3">
              {model.secondary.label}
            </Link>
          ) : (
            <a href={model.secondary.href} target="_blank" rel="noopener noreferrer" className="btn-secondary grow basis-20 px-3">
              {model.secondary.label} <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ))}
      </div>
    </div>
  );
}

export function shouldHideFileButton(claimActionType?: string | null): boolean {
  if (!flags.claimActionCtas()) return false;
  return hidesFileQualifySignup(claimActionType);
}
