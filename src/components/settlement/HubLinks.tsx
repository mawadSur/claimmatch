import Link from 'next/link';
import {
  categoryHubPath,
  CLOSING_SOON_PATH,
  CLOSING_THIS_MONTH_PATH,
  FEATURED_CATEGORY_HUBS,
  NEW_SETTLEMENTS_PATH,
  NO_PROOF_PATH,
} from '@/lib/settlement-seo';

const LINK =
  'rounded font-semibold text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

export type HubCurrent =
  | 'all'
  | 'closing-soon'
  | 'closing-this-month'
  | 'no-proof'
  | 'new'
  | string;

function linkedCategories(categories: string[]): string[] {
  const extra = Array.from(new Set(categories.filter(Boolean)))
    .filter((name) => !(FEATURED_CATEGORY_HUBS as readonly string[]).includes(name))
    .sort();
  return [...FEATURED_CATEGORY_HUBS, ...extra];
}

export function HubLinks({
  categories = [],
  current,
}: {
  categories?: string[];
  current?: HubCurrent;
}) {
  const unique = linkedCategories(categories);
  return (
    <nav aria-label="Settlement hubs" className="text-sm text-ink-muted">
      <p className="font-semibold text-ink">Browse settlements</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        <li>
          {current === 'all' ? (
            <span className="font-medium text-ink">All open</span>
          ) : (
            <Link href="/lawsuits" className={LINK}>
              All open
            </Link>
          )}
        </li>
        <li>
          {current === 'closing-soon' ? (
            <span className="font-medium text-ink">Closing soon</span>
          ) : (
            <Link href={CLOSING_SOON_PATH} className={LINK}>
              Closing soon
            </Link>
          )}
        </li>
        <li>
          {current === 'closing-this-month' ? (
            <span className="font-medium text-ink">Closing this month</span>
          ) : (
            <Link href={CLOSING_THIS_MONTH_PATH} className={LINK}>
              Closing this month
            </Link>
          )}
        </li>
        <li>
          {current === 'no-proof' ? (
            <span className="font-medium text-ink">No proof required</span>
          ) : (
            <Link href={NO_PROOF_PATH} className={LINK}>
              No proof required
            </Link>
          )}
        </li>
        <li>
          {current === 'new' ? (
            <span className="font-medium text-ink">New settlements</span>
          ) : (
            <Link href={NEW_SETTLEMENTS_PATH} className={LINK}>
              New settlements
            </Link>
          )}
        </li>
        {unique.map((category) => {
          const href = categoryHubPath(category);
          const active = current === category;
          return (
            <li key={category}>
              {active ? (
                <span className="font-medium text-ink">{category}</span>
              ) : (
                <Link href={href} className={LINK}>
                  {category}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
