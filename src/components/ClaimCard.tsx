import Link from 'next/link';
import { ArrowRight, Clock, ExternalLink, Hash, Wallet } from 'lucide-react';
import type { Claim, ClaimStatus } from '@/lib/types';
import { CLAIM_STATUS_LABELS } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';

/**
 * The "receipt" settlement card shown on the dashboard for a filed claim.
 * Server-safe (no hooks) — mirrors the LawsuitCard aesthetic (brand top border,
 * gray stats box) but surfaces the claim's receipt number and live status.
 */
export function ClaimCard({ claim }: { claim: Claim }) {
  const lawsuit = claim.lawsuit;
  const badgeClass = statusBadgeClass(claim.status);
  const title = lawsuit?.title ?? claim.lawsuit_title;

  return (
    <article className="settlement-card group">
      <div className="flex items-start justify-between gap-3">
        <span className="badge-gray">Claim filed</span>
        <span className={badgeClass}>{CLAIM_STATUS_LABELS[claim.status]}</span>
      </div>

      <h3 className="mt-3 text-lg font-bold leading-snug">
        {lawsuit ? (
          <Link href={`/lawsuits/${lawsuit.slug}`} className="hover:text-brand-700">
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>

      {lawsuit?.summary && (
        <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{lawsuit.summary}</p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
        <Stat
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="Typical"
          value={lawsuit?.typical_payout || 'Varies'}
          accent
        />
        <Stat
          icon={<Hash className="h-3.5 w-3.5" />}
          label="Receipt"
          value={`#${claim.receipt_number}`}
        />
        <Stat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Deadline"
          value={formatDeadline(lawsuit?.deadline)}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        {lawsuit && (
          <Link
            href={`/lawsuits/${lawsuit.slug}`}
            className="btn-secondary flex-1 justify-center group-hover:bg-brand-600 group-hover:text-white group-hover:ring-brand-600"
          >
            View settlement <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {lawsuit?.claim_url && (
          <a
            href={lawsuit.claim_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost shrink-0 text-brand-700 hover:bg-brand-50"
          >
            <ExternalLink className="h-4 w-4" /> Official claim site
          </a>
        )}
      </div>
    </article>
  );
}

function statusBadgeClass(status: ClaimStatus): string {
  switch (status) {
    case 'approved':
    case 'paid':
      return 'badge-green';
    case 'rejected':
      return 'badge-red';
    case 'processing':
    case 'submitted':
    default:
      return 'badge-brand';
  }
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {icon} {label}
      </div>
      <div className={`mt-0.5 truncate text-sm font-bold ${accent ? 'text-success-600' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}
