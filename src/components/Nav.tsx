import Link from 'next/link';
import { Scale } from 'lucide-react';
import { NavAuthLinks } from './NavAuthLinks';

/**
 * Top navigation. Auth state is resolved client-side so public marketing
 * routes can skip the session middleware.
 */
export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <nav className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-extrabold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <Scale className="h-5 w-5" />
          </span>
          <span>
            Claim<span className="text-brand-600">Match</span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          <Link href="/lawsuits" className="text-sm font-medium text-ink-muted hover:text-brand-700">
            Browse settlements
          </Link>
          <Link href="/how-it-works" className="text-sm font-medium text-ink-muted hover:text-brand-700">
            How it works
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-ink-muted hover:text-brand-700">
            Pricing
          </Link>
          <Link href="/about" className="text-sm font-medium text-ink-muted hover:text-brand-700">
            About
          </Link>
        </div>

        <NavAuthLinks />
      </nav>
    </header>
  );
}
