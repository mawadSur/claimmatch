import {
  ExternalLink,
  FileText,
  Scale,
  Landmark,
  Receipt,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Partner, PartnerCategory } from '@/lib/types';
import { PARTNER_CATEGORY_LABELS } from '@/lib/types';
import { DEFAULT_PARTNER_DISCLOSURE } from '@/lib/partners';

const CATEGORY_ICON: Record<PartnerCategory, LucideIcon> = {
  claims_service: FileText,
  law_firm: Scale,
  financial: Landmark,
  tax: Receipt,
  credit: CreditCard,
  general: Sparkles,
};

/**
 * A sponsored partner placement. Visually distinct from settlement cards (muted
 * ground + a "Sponsored" chip + explicit disclosure) so it never reads as an
 * official settlement. The CTA routes through /api/partners/[slug]/go, which
 * records the lead and redirects with attribution.
 */
export function PartnerCard({
  partner,
  placement,
  lawsuitId,
}: {
  partner: Partner;
  placement: string;
  lawsuitId?: string | null;
}) {
  const Icon = CATEGORY_ICON[partner.category] ?? Sparkles;
  const query = new URLSearchParams({ placement });
  if (lawsuitId) query.set('lid', lawsuitId);
  const goHref = `/api/partners/${partner.slug}/go?${query.toString()}`;

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <Icon className="h-3.5 w-3.5" />
          {PARTNER_CATEGORY_LABELS[partner.category]}
        </span>
        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Sponsored
        </span>
      </div>

      <h3 className="mt-3 text-base font-bold text-ink">{partner.name}</h3>
      {partner.tagline && (
        <p className="mt-1 text-sm font-medium text-ink-muted">{partner.tagline}</p>
      )}
      {partner.description && (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {partner.description}
        </p>
      )}

      <a
        href={goHref}
        target="_blank"
        rel="sponsored nofollow noopener"
        className="btn-secondary mt-4 w-full justify-center"
      >
        Visit {partner.name} <ExternalLink className="h-4 w-4" />
      </a>

      <p className="mt-3 text-[11px] leading-snug text-ink-soft">
        {partner.disclosure ?? DEFAULT_PARTNER_DISCLOSURE}
      </p>
    </div>
  );
}
