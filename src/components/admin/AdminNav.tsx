'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ClipboardCheck, Library, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard, exact: true },
  { href: '/admin/review', label: 'Review queue', Icon: ClipboardCheck, exact: false },
  { href: '/admin/catalog', label: 'Catalog', Icon: Library, exact: false },
  { href: '/admin/recoveries', label: 'Recoveries', Icon: Wallet, exact: false },
];

/**
 * Admin section navigation. Highlights the active route. Client component so it
 * can read the current pathname for the active state.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {LINKS.map(({ href, label, Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-ink-muted hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
