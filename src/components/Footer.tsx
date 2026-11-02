import Link from 'next/link';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { flags } from '@/lib/flags';
import { legalContact } from '@/lib/legal-contact';
import { RECENTLY_CLOSED_PATH } from '@/lib/recently-closed';
import { SiteLogo } from './SiteLogo';

const LINK =
  'inline-flex min-h-tap items-center rounded transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:min-h-[2.25rem]';
// Column headings are UI labels: keep them in the sans, not the headline serif.
const HEADING = 'font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft';
const INLINE_LINK =
  'font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:text-brand-800';

export function Footer() {
  const contact = legalContact();

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <SiteLogo size="sm" />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
              {flags.feeDisclosure()
                ? 'A claim assistant. Find open class-action settlements, file on the official site, and keep track of your claims. Official filing stays free.'
                : 'A free claim assistant. Find open class-action settlements, file on the official site, and keep track of your claims. Free during beta.'}
            </p>
          </div>

          <nav aria-label="Product">
            <h2 className={HEADING}>Product</h2>
            <ul className="mt-3 space-y-1 text-sm text-ink-muted">
              <li><Link href="/lawsuits" className={LINK}>Settlements</Link></li>
              {flags.noticeLookup() && (
                <li><Link href="/check" className={LINK}>Check a notice</Link></li>
              )}
              <li><Link href="/settlements/closing-soon" className={LINK}>Closing soon</Link></li>
              {flags.closedArchive() && (
                <li><Link href={RECENTLY_CLOSED_PATH} className={LINK}>Recently closed</Link></li>
              )}
              <li><Link href="/settlements/new" className={LINK}>New settlements</Link></li>
              <li><Link href="/how-it-works" className={LINK}>How it works</Link></li>
              <li><Link href="/pricing" className={LINK}>Pricing</Link></li>
              <li><Link href="/how-we-make-money" className={LINK}>How we make money</Link></li>
              <li><Link href="/signup" className={LINK}>Create a free account</Link></li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className={HEADING}>Company</h2>
            <ul className="mt-3 space-y-1 text-sm text-ink-muted">
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

        <div className="mt-10 space-y-3 border-t border-slate-200 pt-6 text-xs leading-relaxed text-ink-muted">
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
