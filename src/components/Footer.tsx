import Link from 'next/link';
import { Scale } from 'lucide-react';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-gray-100 bg-gray-50">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-display text-lg font-extrabold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
                <Scale className="h-4 w-4" />
              </span>
              Claim<span className="-ml-1 text-brand-600">Match</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-ink-soft">
              We scan class-action settlements and lawsuits, match you to the ones
              you qualify for, and help you file — free to check.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-ink">Product</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li><Link href="/lawsuits" className="hover:text-brand-700">Browse settlements</Link></li>
              <li><Link href="/how-it-works" className="hover:text-brand-700">How it works</Link></li>
              <li><Link href="/signup" className="hover:text-brand-700">Get matched</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-ink">Company</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li><Link href="/about" className="hover:text-brand-700">About</Link></li>
              <li><Link href="/privacy" className="hover:text-brand-700">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-brand-700">Terms</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6">
          <p className="text-xs leading-relaxed text-ink-soft">{SHORT_DISCLAIMER}</p>
          <p className="mt-3 text-xs text-ink-soft">
            © {new Date().getFullYear()} ClaimMatch. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
