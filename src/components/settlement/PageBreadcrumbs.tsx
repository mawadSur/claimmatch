import Link from 'next/link';

export interface Crumb {
  name: string;
  href?: string;
}

export function PageBreadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.name}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-ink-soft">
                  /
                </span>
              )}
              {last || !item.href ? (
                <span className={last ? 'font-medium text-ink' : undefined} aria-current={last ? 'page' : undefined}>
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
