'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ClipboardCheck, Library, Wallet, Link2, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminNavCounts } from './AdminNav';

const BASE_LINKS = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard, exact: true, countKey: null },
  { href: '/admin/review', label: 'Review', Icon: ClipboardCheck, exact: false, countKey: 'pendingReview' as const },
  { href: '/admin/catalog', label: 'Catalog', Icon: Library, exact: false, countKey: null },
  { href: '/admin/verify', label: 'Verify', Icon: BadgeCheck, exact: false, countKey: null },
  { href: '/admin/share-links', label: 'Share links', Icon: Link2, exact: false, countKey: null },
];

const RECOVERIES_LINK = {
  href: '/admin/recoveries',
  label: 'Recoveries',
  Icon: Wallet,
  exact: false,
  countKey: 'awaitingPayout' as const,
};

/**
 * Admin section links. Client component only to highlight the current route;
 * whether the legacy Recoveries link shows is decided on the server (AdminNav).
 */
export function AdminNavLinks({
  counts,
  showRecoveries,
}: {
  counts?: AdminNavCounts;
  showRecoveries: boolean;
}) {
  const pathname = usePathname();
  const links = showRecoveries ? [...BASE_LINKS, RECOVERIES_LINK] : BASE_LINKS;

  return (
    <nav aria-label="Admin" className="flex flex-wrap items-center gap-1.5">
      {links.map(({ href, label, Icon, exact, countKey }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        const count = countKey && counts ? counts[countKey] : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-ink-muted hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {count > 0 && (
              <span
                className={cn(
                  'ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700',
                )}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
