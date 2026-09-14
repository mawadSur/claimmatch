'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { cn } from '@/lib/utils';

/**
 * Client filter bar for the settlements catalog. Writes ?q / ?category to the
 * URL so the server page re-queries. The text input is debounced ~300ms;
 * category pills commit immediately.
 */
export function LawsuitFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  const activeCategory = searchParams.get('category') ?? '';
  const activeQ = searchParams.get('q') ?? '';
  const [q, setQ] = useState(activeQ);
  const [isPending, startTransition] = useTransition();

  const commit = useCallback(
    (next: { q?: string; category?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.q !== undefined) {
        if (next.q.trim()) params.set('q', next.q.trim());
        else params.delete('q');
      }
      if (next.category !== undefined) {
        if (next.category) params.set('category', next.category);
        else params.delete('category');
      }
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Re-sync the input when the URL's q changes externally (Back button, a
  // "Clear filters" link, or any soft navigation). This resets the debounce
  // effect's early-return guard so it can't re-commit a stale term.
  useEffect(() => {
    setQ(activeQ);
  }, [activeQ]);

  // Debounce the text input (~300ms) and keep the URL in sync.
  useEffect(() => {
    if (q === activeQ) return;
    const t = setTimeout(() => {
      commit({ q });
      if (q.trim()) {
        posthog?.capture('claim_search_submitted', { query: q.trim() });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, activeQ, commit, posthog]);

  const hasFilters = Boolean(activeQ || activeCategory);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card sm:p-5">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search settlements — data breach, overdraft fees, vehicle…"
          className="field-input pl-10 pr-10"
          aria-label="Search settlements"
        />
        {isPending ? (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
        ) : q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-gray-100 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Category pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Pill active={!activeCategory} onClick={() => commit({ category: '' })}>
          All
        </Pill>
        {categories.map((c) => (
          <Pill
            key={c}
            active={activeCategory === c}
            onClick={() => commit({ category: activeCategory === c ? '' : c })}
          >
            {c}
          </Pill>
        ))}
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setQ('');
            commit({ q: '', category: '' });
          }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          <X className="h-3.5 w-3.5" /> Clear all filters
        </button>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-white text-ink-muted ring-1 ring-gray-200 hover:bg-brand-50 hover:text-brand-700',
      )}
    >
      {children}
    </button>
  );
}
