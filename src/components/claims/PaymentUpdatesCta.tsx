import Link from 'next/link';
import { GET_PAYMENT_UPDATES_CTA, KEEP_ADDRESS_CURRENT, NO_CLAIM_NEEDED_HEADING } from '@/lib/claim-actions';
import { guideSignupHref } from '@/lib/signup-context';

/**
 * Automatic-payment settlements: no file / qualify / signup-to-file CTAs.
 * Optional alert only.
 */
export function PaymentUpdatesCta({
  slug,
  signedIn,
  officialHref,
  addressUpdateUrl,
}: {
  slug: string;
  signedIn: boolean;
  officialHref?: string | null;
  addressUpdateUrl?: string | null;
}) {
  const alertHref = signedIn ? '/settings' : guideSignupHref(slug);
  return (
    <section
      id="payment-updates"
      className="scroll-mt-24 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6"
    >
      <h2 className="text-lg font-bold">{NO_CLAIM_NEEDED_HEADING}</h2>
      <p className="text-sm text-ink-muted">{KEEP_ADDRESS_CURRENT}</p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {(addressUpdateUrl || officialHref) && (
          <a
            href={addressUpdateUrl || officialHref || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {addressUpdateUrl ? 'Update your address with the administrator' : 'Official administrator site'}
          </a>
        )}
        <Link href={alertHref} className="btn-secondary">
          {GET_PAYMENT_UPDATES_CTA}
        </Link>
      </div>
      <p className="text-xs text-ink-muted">
        {signedIn
          ? 'Payment and deadline emails follow the alerts you already chose in Settings.'
          : 'Optional. Create an account only if you want payment or deadline alerts. There is nothing to file.'}
      </p>
    </section>
  );
}
