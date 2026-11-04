import { RelatedSettlementLink } from '@/components/settlement/RelatedSettlementLink';
import type { RelatedSettlement } from '@/lib/related-settlements';
import { formatDeadline } from '@/lib/utils';

/** Server-rendered internal links. Crawlers see the hrefs in the HTML. */
export function RelatedSettlements({
  items,
  fromSlug,
}: {
  items: RelatedSettlement[];
  fromSlug: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="related-settlements-heading">
      <h2 id="related-settlements-heading" className="text-xl font-bold">
        Related open settlements
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        Other listings that are taking claims, in the same category or with the
        nearest deadlines.
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.slug}>
            <RelatedSettlementLink
              href={item.path}
              fromSlug={fromSlug}
              toSlug={item.slug}
              className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className="font-semibold text-ink">{item.title}</span>
              <span className="mt-1 block text-sm text-ink-muted">
                {item.category}
                {item.deadline ? ` · Deadline ${formatDeadline(item.deadline)}` : ''}
              </span>
            </RelatedSettlementLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
