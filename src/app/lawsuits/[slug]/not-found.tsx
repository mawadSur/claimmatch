'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search } from 'lucide-react';
import { isFictionalSlug } from '@/lib/fictional-slugs';

/** The <slug> in /lawsuits/<slug>, or null. */
function slugFromPath(pathname: string | null): string | null {
  const segment = pathname?.split('/').filter(Boolean)[1];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * A settlement page that doesn't exist, isn't listed or was one of the
 * fictional listings (still a 404; the page's generateMetadata sets the title
 * and noindex). Old match and digest emails linked fictional listings as
 * "View & file your claim", so people arriving at one are told plainly that it
 * was not real and there is nothing to file (D42). Every other missing page
 * (a real listing taken off the list, a closed one, a mistyped link) gets a
 * neutral message that sends people to the official notice, never "nothing
 * to file".
 */
export default function SettlementNotFound() {
  const fictional = isFictionalSlug(slugFromPath(usePathname()));
  return (
    <section className="bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="container-narrow flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-5xl font-extrabold text-brand-200" aria-hidden>
          404
        </p>
        {fictional ? (
          <>
            <h1 className="mt-2 text-3xl font-extrabold">This was not a real settlement</h1>
            <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ink-muted">
              This listing was test data, not a real settlement, so we removed it. There is
              nothing to file and nothing you need to do.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-extrabold">We couldn’t find this settlement</h1>
            <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ink-muted">
              It may have closed, it may be off our list while we re-check it, or the link
              may be wrong. If you got an official notice about a settlement by mail or
              email, check the site it names to see if you can still file.
            </p>
          </>
        )}
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link href="/lawsuits" className="btn-primary w-full sm:w-auto">
            <Search className="h-4 w-4" aria-hidden /> Browse open settlements
          </Link>
          <Link href="/" className="btn-secondary w-full sm:w-auto">
            <Home className="h-4 w-4" aria-hidden /> Back home
          </Link>
        </div>
      </div>
    </section>
  );
}
