import Link from 'next/link';
import { Scale } from 'lucide-react';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { legalContact } from '@/lib/legal-contact';

const LINK = 'rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';
const INLINE_LINK = 'font-semibold text-brand-700 underline hover:text-brand-800';

export function Footer() {
  const contact = legalContact();

  return (
    <footer className="mt-20 border-t border-gray-100 bg-gray-50">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-display text-lg font-extrabold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
                <Scale className="h-4 w-4" aria-hidden />
              </span>
              <span>
                Claim<span className="text-brand-600">Match</span>
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-ink-muted">
              A free claim assistant. Find open class-action settlements, file on the
              official site, and keep track of your claims. We never take a cut.
            </p>
          </div>

          <nav aria-label="Product">
            <h2 className="text-sm font-semibold text-ink">Product</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              <li><Link href="/lawsuits" className={LINK}>Browse settlements</Link></li>
              <li><Link href="/how-it-works" className={LINK}>How it works</Link></li>
              <li><Link href="/pricing" className={LINK}>Pricing</Link></li>
              <li><Link href="/signup" className={LINK}>Create a free account</Link></li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="text-sm font-semibold text-ink">Company</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              <li><Link href="/about" className={LINK}>About</Link></li>
              <li><Link href="/trust" className={LINK}>Is this legit?</Link></li>
              <li><Link href="/privacy" className={LINK}>Privacy</Link></li>
              <li><Link href="/terms" className={LINK}>Terms</Link></li>
              {contact.email && (
                <li><a href={`mailto:${contact.email}`} className={LINK}>Contact us</a></li>
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-10 space-y-3 border-t border-gray-200 pt-6 text-xs leading-relaxed text-ink-muted">
          <p>
            Settlement listings include data from{' '}
            <a
              href="https://settlesignal.com/data/"
              target="_blank"
              rel="noopener noreferrer"
              className={INLINE_LINK}
            >
              SettleSignal
            </a>
            , used under the{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer license"
              className={INLINE_LINK}
            >
              CC BY 4.0 license
            </a>
            . We reformat it, and we have not verified each listing. Always check the
            official settlement website.
          </p>
          <p>{SHORT_DISCLAIMER}</p>
          {contact.postalAddress && (
            <address className="whitespace-pre-line not-italic">{contact.postalAddress}</address>
          )}
          <p>
            © {new Date().getFullYear()} {contact.legalEntity ?? 'ClaimMatch'}
          </p>
        </div>
      </div>
    </footer>
  );
}
