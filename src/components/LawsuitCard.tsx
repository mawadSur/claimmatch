import Link from 'next/link';
import { ArrowRight, Clock, ShieldCheck, Wallet } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { formatDeadline, daysUntil } from '@/lib/utils';

/**
 * The settlement card — the signature UI element carried over from the original
 * site (brand purple top border, payout / proof / deadline stats, CTA).
 *
 * `badge` overrides the default status badge, e.g. "AI Matched" for featured
 * cards or a claim status on the dashboard.
 */
export function LawsuitCard({
  lawsuit,
  badge,
  reasons,
  href,
}: {
  lawsuit: Lawsuit;
  badge?: { label: string; tone?: 'brand' | 'green' | 'red' | 'gray' };
  reasons?: string[];
  href?: string;
}) {
  const link = href ?? `/lawsuits/${lawsuit.slug}`;
  const days = daysUntil(lawsuit.deadline);
  const closingSoon = days !== null && days >= 0 && days <= 30;

  const tone = badge?.tone ?? 'brand';
  const badgeClass =
    tone === 'green' ? 'badge-green'
    : tone === 'red' ? 'badge-red'
    : tone === 'gray' ? 'badge-gray'
    : 'badge-brand';

  return (
    <article className="settlement-card group">
      <div className="flex items-start justify-between gap-3">
        <span className={badgeClass}>{badge?.label ?? lawsuit.category}</span>
        {closingSoon && (
          <span className="badge-red gap-1">
            <Clock className="h-3 w-3" /> {days}d left
          </span>
        )}
      </div>

      <h3 className="mt-3 text-lg font-bold leading-snug">
        <Link href={link} className="hover:text-brand-700">
          {lawsuit.title}
        </Link>
      </h3>

      {lawsuit.summary && (
        <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{lawsuit.summary}</p>
      )}

      {reasons && reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-success-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {r}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
        <Stat icon={<Wallet className="h-3.5 w-3.5" />} label="Typical" value={lawsuit.typical_payout || 'Varies'} accent />
        <Stat icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Proof" value={lawsuit.proof_required ? 'Required' : 'None'} />
        <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Deadline" value={formatDeadline(lawsuit.deadline)} />
      </div>

      <Link
        href={link}
        className="btn-secondary mt-4 w-full justify-center group-hover:bg-brand-600 group-hover:text-white group-hover:ring-brand-600"
      >
        View settlement <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
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
