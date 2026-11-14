'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { NavAuthLinks } from './NavAuthLinks';

const LINKS = [
  { href: '/lawsuits', label: 'Settlements' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
] as const;

export function NavMenu({
  signedIn,
  isAdmin,
  noticeLookup,
}: {
  signedIn: boolean;
  isAdmin: boolean;
  noticeLookup: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <div className="hidden items-center gap-8 md:flex">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="nav-link">
            {link.label}
          </Link>
        ))}
        {noticeLookup && (
          <Link href="/check" className="nav-link">
            Check a notice
          </Link>
        )}
        <NavAuthLinks signedIn={signedIn} isAdmin={isAdmin} />
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <NavAuthLinks signedIn={signedIn} isAdmin={isAdmin} compact />
        <button
          type="button"
          className="inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full z-40 border-b border-slate-200 bg-white shadow-card md:hidden"
        >
          <nav className="container-page flex flex-col gap-1 py-4" aria-label="Mobile">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-tap items-center rounded-lg px-2 text-base font-semibold text-ink hover:bg-brand-50 hover:text-brand-700"
              >
                {link.label}
              </Link>
            ))}
            {noticeLookup && (
              <Link
                href="/check"
                onClick={() => setOpen(false)}
                className="flex min-h-tap items-center rounded-lg px-2 text-base font-semibold text-ink hover:bg-brand-50 hover:text-brand-700"
              >
                Check a notice
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
