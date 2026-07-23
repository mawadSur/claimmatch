import { Handshake } from 'lucide-react';
import { pickPartnersForContext } from '@/lib/partners';
import { PartnerCard } from '@/components/PartnerCard';

/**
 * A titled band of sponsored partner placements, chosen for the given context
 * (a settlement category ranks affine partners first; no category just orders by
 * priority). Renders nothing when there are no active partners, so it's safe to
 * drop onto any page. Every card carries its own "Sponsored" chip + disclosure.
 */
export async function RecommendedServices({
  placement,
  lawsuitCategory,
  lawsuitId,
  limit = 2,
  title = 'Recommended services',
  subtitle = 'Optional partner services that can help. These are ads — using them is free and never affects your settlement.',
}: {
  placement: string;
  lawsuitCategory?: string | null;
  lawsuitId?: string | null;
  limit?: number;
  title?: string;
  subtitle?: string;
}) {
  const partners = await pickPartnersForContext({ lawsuitCategory, limit });
  if (partners.length === 0) return null;

  return (
    <section aria-label="Sponsored partner services">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-ink-soft">
          <Handshake className="h-4 w-4" />
        </span>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{subtitle}</p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {partners.map((p) => (
          <PartnerCard
            key={p.id}
            partner={p}
            placement={placement}
            lawsuitId={lawsuitId}
          />
        ))}
      </div>
    </section>
  );
}
