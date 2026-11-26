import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ShieldAlert } from 'lucide-react';
import { legalDisclaimer } from '@/lib/disclaimer-flags';
import { CLAIMMATCH_FEE_RATE, MAY_FILE_SHORT_SENTENCE, lawsuitAiMayFile } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { legalContact } from '@/lib/legal-contact';

import { publicPageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = publicPageMetadata({
  title: 'Terms of Service',
  description:
    'Interim terms for using Lawsuit AI. Lawsuit AI is not a law firm, gives no legal advice and never handles settlement money.',
  path: '/terms',
});

const LAST_UPDATED = 'November 26, 2026';
const LINK = 'font-semibold text-brand-700 underline hover:text-brand-800';

export default function TermsPage() {
  const contact = legalContact();
  const operator = contact.legalEntity;
  const hasContact = Boolean(contact.email || contact.postalAddress);
  // Filing and fee lines follow FEE_DISCLOSURE_ENABLED / ONE_CLICK_FILING_ENABLED
  // (copy.ts). With both off, the wording is unchanged.
  const mayFile = lawsuitAiMayFile();
  const disclose = flags.feeDisclosure();

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
            These terms cover your use of Lawsuit AI. Please read them. By using
            Lawsuit AI, you agree to them.
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
            <li>Lawsuit AI is a {disclose ? '' : 'free '}claim assistant. It is not a law firm and gives no legal advice.</li>
            <li>
              {mayFile
                ? MAY_FILE_SHORT_SENTENCE
                : 'You file every claim yourself on the official settlement website. Lawsuit AI never files, submits or signs a claim for you.'}
            </li>
            <li>
              {disclose
                ? `Matching is free. Filing yourself on the official site is free. Easy submit claims have a ${CLAIMMATCH_FEE_RATE} percent recovery-only fee, billed by invoice after payout if you recover money from a claim Lawsuit AI submitted for you. If you recover nothing, you owe $0. Lawsuit AI never holds or redirects settlement funds.`
                : 'Lawsuit AI never handles settlement money and never takes a share of it.'}
            </li>
            <li>Our settlement listings are not verified. The official settlement website is the final word.</li>
          </ul>
        </div>

        {/* Body ------------------------------------------------------------ */}
        <div className="space-y-10 text-ink-muted">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">1. About these terms</h2>
            <p>
              These terms are an agreement between you and{' '}
              {operator ? `${operator}, which runs Lawsuit AI` : 'Lawsuit AI'} (“Lawsuit AI,”
              “we” or “us”) about your use of the Lawsuit AI website and services (the
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
            <h2 className="text-xl font-bold text-ink">2. What Lawsuit AI does</h2>
            <p>
              Lawsuit AI shows class-action settlements that may be open for claims, links
              to official settlement information when our source provides it, and lets you
              keep track of claims you file yourself.
              {mayFile
                ? ' For some settlements we also offer one-click filing, where you can sign a claim and we submit it to the settlement administrator as your agent (section 14).'
                : ''}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. What Lawsuit AI does not do</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                {mayFile
                  ? `${MAY_FILE_SHORT_SENTENCE} You decide whether to file.`
                  : 'Lawsuit AI does not file, submit or sign claims for you. You decide whether to file, and you file directly with the settlement administrator, usually on the official settlement website.'}
              </li>
              <li>
                {mayFile
                  ? 'Except when you choose one-click filing for a settlement and sign an authorization for that claim, Lawsuit AI is not your agent. One-click filing covers only the claim you reviewed and signed; we do not deal with courts for you.'
                  : 'Lawsuit AI is not your agent or representative. It does not deal with courts or settlement administrators for you.'}
              </li>
              <li>
                {disclose
                  ? `Lawsuit AI never receives, holds or redirects settlement payments. Easy submit claims have a ${CLAIMMATCH_FEE_RATE} percent recovery-only fee, billed separately by invoice after the settlement administrator pays you.`
                  : 'Lawsuit AI never receives, holds or sends settlement payments, and never takes a share of any payment you receive.'}
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">4. Not a law firm; no legal advice</h2>
            <p>
              Lawsuit AI is not a law firm. We are not lawyers, we do not represent you,
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
              Lawsuit AI are shown as dates; the official settlement website gives the
              exact cutoff time.
            </p>
            <p>
              A listing on Lawsuit AI does not mean you qualify or that you will be paid.
              Always check the official settlement website before you rely on any
              information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Keeping track of your claims</h2>
            <p>
              When you tell us you filed a claim or add a confirmation number, Lawsuit AI
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
              {disclose
                ? `Matching on Lawsuit AI is free. Filing yourself on the official settlement website is free. For Easy submit claims that Lawsuit AI submitted for you, Lawsuit AI charges ${CLAIMMATCH_FEE_RATE} percent of what you recover, billed separately by invoice after the settlement administrator pays you. If you recover nothing, you owe $0. Lawsuit AI never holds or redirects settlement funds.`
                : 'Lawsuit AI is free to use. We never take a share of any settlement payment.'}{' '}
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
              You can stop using Lawsuit AI at any time, and you can ask us to delete your
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
              Lawsuit AI and the people who run it are not liable for any indirect,
              incidental, special, consequential or punitive damages, or for any lost
              claims, payments or opportunities, arising from your use of (or inability to
              use) the Service.
            </p>
            <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-ink-muted">
              {legalDisclaimer()}
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


          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">14. One-click filing: when Lawsuit AI files a claim for you</h2>
            <p>
              This section applies when you choose one-click filing for a settlement and sign the
              authorization shown in the product. It does not apply when you file on the official
              settlement website yourself.
            </p>
            <h3 className="text-lg font-semibold text-ink">What one-click filing is</h3>
            <p>
              For some settlements, Lawsuit AI offers to submit a claim to the settlement administrator
              for you, as your agent. We offer it only where the law firm that advises us has reviewed
              that settlement and approved the way the claim will be submitted. Everywhere else, you file
              the claim yourself on the official settlement website, and Lawsuit AI only helps you prepare.
            </p>
            <p>
              You never have to use one-click filing. You can always file on the official settlement
              website yourself, where filing is free.
            </p>
            <h3 className="text-lg font-semibold text-ink">Scope of each authorization</h3>
            <p>
              Each authorization covers one claim in one settlement, exactly as you reviewed and signed
              it. It does not cover any other claim, any other settlement, or any change to the claim after
              you sign. If the claim changes (you edit it, the settlement&apos;s form changes, or the way we
              would submit it changes), your signature no longer authorizes it and we ask you to review and
              sign again.
            </p>
            <p>We submit the claim only through the channel named in the authorization you signed:</p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <span className="font-semibold text-ink">Filing desk:</span> a Lawsuit AI staff member enters
                your signed answers on the official claim form in an ordinary web browser.
              </li>
              <li>
                <span className="font-semibold text-ink">Administrator email:</span> we email the claim, your
                uploaded documents and the record of your signature to the administrator&apos;s published claims
                address, and send you a copy.
              </li>
              <li>
                <span className="font-semibold text-ink">Bulk file:</span> we include your individually signed
                claim in a file the administrator has agreed to accept from us.
              </li>
              <li>
                <span className="font-semibold text-ink">Administrator system:</span> we pass the claim through a
                system the administrator provides for that purpose.
              </li>
            </ul>
            <p>
              We use only channels the law firm approved for that settlement, and a bulk file or administrator
              system only after a written agreement with the administrator.
            </p>
            <h3 className="text-lg font-semibold text-ink">Your statements and your signature</h3>
            <p>
              The claim form may ask you to confirm facts under penalty of perjury. You read that statement word
              for word and tick it yourself; we never tick, fill in or type it for you. You then sign by typing
              your full legal name. Your typed name is your electronic signature for that claim and has the same
              effect as your handwritten signature (see the e-signature consent you gave first in the product).
            </p>
            <p>
              You are responsible for the truth of what you sign. Only sign if the settlement&apos;s class definition
              describes you and your answers are true. We do not decide whether you qualify; the settlement
              administrator does.
            </p>
            <h3 className="text-lg font-semibold text-ink">Changing your mind</h3>
            <p>
              You can withdraw your authorization in Lawsuit AI at any time before filing starts. Once filing has
              started, contact the settlement administrator about any change; we will tell you how. If you
              withdraw before filing starts, that claim is closed for one-click in Lawsuit AI and you cannot start
              the same claim again here after withdrawal.
            </p>
            <h3 className="text-lg font-semibold text-ink">If we cannot submit your claim in time</h3>
            <p>
              If we cannot submit a claim you authorized before our last day for it (we stop taking a claim a few
              days before the settlement&apos;s deadline, so there is still time), we will tell you by email and in
              Lawsuit AI, and return the claim to you with your answers ready so you can file it yourself on the
              official site.
            </p>
            <h3 className="text-lg font-semibold text-ink">Identity</h3>
            <p>
              We do not verify your identity with a third-party service. Settlements whose administrator requires
              an identity check are not offered for one-click filing. You agree to file only your own claim, in your
              own name, and never one for another person.
            </p>
            <h3 className="text-lg font-semibold text-ink">Fees and payments</h3>
            <p>
              {disclose
                ? `If Lawsuit AI submitted this Easy submit claim for you and you recover money from it, Lawsuit AI charges ${CLAIMMATCH_FEE_RATE} percent of that recovery. The fee is billed separately by invoice after the settlement administrator pays you. If you recover nothing, you owe $0. Matching is free, and filing yourself on the official settlement website is free.`
                : 'Lawsuit AI does not charge you a fee when you use one-click filing for a claim.'}{' '}
              Any payment from the settlement goes to you directly from the settlement administrator, by the payment
              method you choose. We never receive, hold or redirect settlement money, and we never ask for bank or card
              account numbers.
            </p>
            <h3 className="text-lg font-semibold text-ink">Checks on the official site</h3>
            <p>
              If the official site shows a code by email or text, an identity check or an account login, we stop and
              return the claim to you. We never use tools to get past any check on an official site.
            </p>
            <p>
              If the official site shows a CAPTCHA and the settlement allows it, a person at our filing desk may
              complete it by hand on the official site for you. We never use a bot or a solving service for it. This
              applies only where the authorization you signed includes that permission and the settlement&apos;s desk
              rule allows it.
            </p>
            <h3 className="text-lg font-semibold text-ink">What we are not</h3>
            <p>
              Lawsuit AI is not a law firm, does not give legal advice, and is not affiliated with any settlement,
              court, party or settlement administrator. Acting as your agent to submit a claim does not create an
              attorney-client relationship.
            </p>
          </section>

          {hasContact && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-ink">15. Contact us</h2>
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
