import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ShieldAlert } from 'lucide-react';
import { LEGAL_DISCLAIMER } from '@/lib/disclaimer';
import { legalContact } from '@/lib/legal-contact';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Interim terms for using ClaimMatch, a free claim assistant. ClaimMatch is not a law firm, gives no legal advice, never files claims for you and never handles settlement money.',
};

const LAST_UPDATED = 'October 16, 2026';
const LINK = 'font-semibold text-brand-700 underline hover:text-brand-800';

export default function TermsPage() {
  const contact = legalContact();
  const operator = contact.legalEntity;
  const hasContact = Boolean(contact.email || contact.postalAddress);

  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-narrow py-16 sm:py-20">
        {/* Header ---------------------------------------------------------- */}
        <div className="mb-8">
          <span className="badge-brand gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden /> Terms of Service
          </span>
          <h1 className="mt-4 text-4xl font-extrabold">Terms of Service</h1>
          <p className="mt-3 text-ink-muted">
            These terms cover your use of ClaimMatch. Please read them. By using
            ClaimMatch, you agree to them.
          </p>
          <p className="mt-2 text-sm text-ink-muted">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="mb-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p>
            <strong className="font-semibold">Interim, pending legal review.</strong>{' '}
            These are temporary terms. We will update them after a lawyer reviews them
            and change the date above when we do.
          </p>
        </div>

        {/* Callout --------------------------------------------------------- */}
        <div className="mb-10 rounded-2xl border border-brand-100 bg-brand-50 p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-800">
            <ShieldAlert className="h-4 w-4" aria-hidden /> The short version
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
            <li>ClaimMatch is a free claim assistant. It is not a law firm and gives no legal advice.</li>
            <li>You file every claim yourself on the official settlement website. ClaimMatch never files, submits or signs a claim for you.</li>
            <li>ClaimMatch never handles settlement money and never takes a share of it.</li>
            <li>Our settlement listings are not verified. The official settlement website is the final word.</li>
          </ul>
        </div>

        {/* Body ------------------------------------------------------------ */}
        <div className="space-y-10 text-ink-muted">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">1. About these terms</h2>
            <p>
              These terms are an agreement between you and{' '}
              {operator ? `${operator}, which runs ClaimMatch` : 'ClaimMatch'} (“ClaimMatch,”
              “we” or “us”) about your use of the ClaimMatch website and services (the
              “Service”). By using the Service or creating an account, you agree to these
              terms and to our{' '}
              <Link href="/privacy" className={LINK}>
                Privacy Policy
              </Link>
              . If you don’t agree, please don’t use the Service. You must be at least 18
              years old to create an account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">2. What ClaimMatch does</h2>
            <p>
              ClaimMatch shows class-action settlements that may be open for claims, links
              to official settlement information when our source provides it, and lets you
              keep track of claims you file yourself.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. What ClaimMatch does not do</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                ClaimMatch does not file, submit or sign claims for you. You decide whether
                to file, and you file directly with the settlement administrator, usually on
                the official settlement website.
              </li>
              <li>
                ClaimMatch is not your agent or representative. It does not deal with
                courts or settlement administrators for you.
              </li>
              <li>
                ClaimMatch never receives, holds or sends settlement payments, and never
                takes a share of any payment you receive.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">4. Not a law firm; no legal advice</h2>
            <p>
              ClaimMatch is not a law firm. We are not lawyers, we do not represent you,
              and nothing on the Service is legal advice. Using the Service or contacting
              us does not create an attorney-client relationship. Decisions about whether
              to file a claim, opt out of a settlement or object to it are yours. Consider
              talking with a licensed lawyer about your situation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">5. Settlement information is not verified</h2>
            <p>
              Settlement listings come from third-party sources, including SettleSignal,
              and we have not verified them. Information can be wrong, incomplete or out
              of date. Courts and settlement administrators set the deadlines, who
              qualifies and how much is paid, and these can change. Deadlines on
              ClaimMatch are shown as dates; the official settlement website gives the
              exact cutoff time.
            </p>
            <p>
              A listing on ClaimMatch does not mean you qualify or that you will be paid.
              Always check the official settlement website before you rely on any
              information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Keeping track of your claims</h2>
            <p>
              When you tell us you filed a claim or add a confirmation number, ClaimMatch
              records what you tell us. We do not check it with the settlement
              administrator. The administrator’s records decide the real status of your
              claim.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">7. Your responsibilities</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Give accurate information. File a claim only if you qualify: filing a claim
                you don’t qualify for may be against the law.
              </li>
              <li>Keep your login details secure and don’t share your account.</li>
              <li>
                Read each settlement’s official notice, rules and deadlines before you file.
              </li>
              <li>
                Use the Service only for lawful purposes, and don’t disrupt, overload or
                scrape it.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">8. Cost</h2>
            <p>
              ClaimMatch is free to use. We never take a share of any settlement payment.
              See our{' '}
              <Link href="/pricing" className={LINK}>
                Pricing page
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">9. Other websites and data sources</h2>
            <p>
              The Service links to websites run by others, such as official settlement
              websites. Their own terms and privacy policies apply there, and we are not
              responsible for their content or practices. A link does not mean we endorse
              a site. Settlement data from SettleSignal is used under the{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer license"
                className={LINK}
              >
                CC BY 4.0 license
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">10. Ending your use</h2>
            <p>
              You can stop using ClaimMatch at any time, and you can ask us to delete your
              account as described in our{' '}
              <Link href="/privacy" className={LINK}>
                Privacy Policy
              </Link>
              . We may suspend or close accounts that misuse the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">11. Disclaimers and limits on liability</h2>
            <p>
              The Service is provided “as is” and “as available,” without warranties of
              any kind, express or implied. To the fullest extent the law allows,
              ClaimMatch and the people who run it are not liable for any indirect,
              incidental, special, consequential or punitive damages, or for any lost
              claims, payments or opportunities, arising from your use of (or inability to
              use) the Service.
            </p>
            <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-ink-muted">
              {LEGAL_DISCLAIMER}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">12. Changes to these terms</h2>
            <p>
              We may update these terms. When we do, we’ll change the “Last updated” date
              above. If you keep using the Service after a change takes effect, you accept
              the updated terms. If you don’t agree with a change, please stop using the
              Service.
            </p>
          </section>

          {hasContact && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-ink">13. Contact us</h2>
              {contact.email && (
                <p>
                  Questions about these terms? Email us at{' '}
                  <a href={`mailto:${contact.email}`} className={LINK}>
                    {contact.email}
                  </a>
                  .
                </p>
              )}
              {contact.postalAddress && (
                <address className="whitespace-pre-line not-italic">
                  {operator ? `${operator}\n` : ''}
                  {contact.postalAddress}
                </address>
              )}
            </section>
          )}
        </div>

        {/* Footer note ----------------------------------------------------- */}
        <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            Want to know what we collect and why? Read our{' '}
            <Link href="/privacy" className={LINK}>
              Privacy Policy
            </Link>
            .
          </p>
          <Link href="/how-it-works" className="btn-secondary shrink-0">
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
