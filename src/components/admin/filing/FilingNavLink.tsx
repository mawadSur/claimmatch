'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The admin nav's link to the one-click filing console. Rendered by
 * src/app/admin/layout.tsx only while ONE_CLICK_FILING_ENABLED is on (and the
 * legacy assisted-filing link is not already shown). Same look as AdminNavLinks.
 */
export function FilingNavLink() {
  const pathname = usePathname();
  const active = pathname === '/admin/filing' || pathname.startsWith('/admin/filing/');
  return (
    <Link
      href="/admin/filing"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
        active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-muted hover:bg-brand-50 hover:text-brand-700',
      )}
    >
      <Send className="h-4 w-4" aria-hidden />
      Filing
    </Link>
  );
}
