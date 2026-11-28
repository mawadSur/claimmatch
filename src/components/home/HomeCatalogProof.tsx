import { CLOSING_SOON_DAYS, formatUpdated, type HomeStats } from '@/lib/home-stats';
import type { PayoutStats } from '@/lib/payout-stats';
import { CountUp } from './CountUp';

export interface CatalogProofStats {
  open: number;
  closingSoon: number;
  withStatedPayout: number;
  updatedAt: string | null;
}

/** Build proof counters from already-loaded home + payout stats. Null when empty. */
export function catalogProofStats(
  home: HomeStats | null,
  payout: PayoutStats | null,
): CatalogProofStats | null {
  if (!home || home.open <= 0) return null;
  return {
    open: home.open,
    closingSoon: home.closingSoon,
    withStatedPayout: payout?.withStatedPayout ?? 0,
    updatedAt: home.updatedAt,
  };
}

/**
 * Honest live counters from the open catalog. Every figure is a real count;
 * nothing increments on a timer, and empty/failed catalogs render nothing.
 */
export function HomeCatalogProof({ stats }: { stats: CatalogProofStats | null }) {
  if (!stats) return null;
  const updated = formatUpdated(stats.updatedAt);
  const items = [
    {
      value: stats.open,
      label: 'open settlements taking claims right now',
    },
    {
      value: stats.closingSoon,
      label: `close in the next ${CLOSING_SOON_DAYS} days`,
      hideWhenZero: true,
    },
    {
      value: stats.withStatedPayout,
      label: 'list a per-person payout amount in their own text',
      hideWhenZero: true,
    },
  ].filter((item) => !item.hideWhenZero || item.value > 0);

  return (
    <section aria-labelledby="catalog-proof-heading" className="section-y bg-white">
      <div className="container-page">
        <div className="max-w-2xl" data-reveal>
          <p className="eyebrow">Live catalog</p>
          <h2 id="catalog-proof-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
            Real numbers from settlements open today
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            Counted from the Lawsuit AI catalog{updated ? `, refreshed ${updated}` : ''}. Listing
            counts only — not money anyone has received through Lawsuit AI.
          </p>
        </div>
        <dl className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="border-l border-slate-200 pl-5" data-reveal>
              <dt className="sr-only">{item.label}</dt>
              <dd className="font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
                <CountUp value={item.value} />
              </dd>
              <dd className="mt-2 text-sm leading-snug text-ink-muted" aria-hidden>
                {item.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
