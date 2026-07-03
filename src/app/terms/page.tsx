import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ShieldAlert } from 'lucide-react';
import { LEGAL_DISCLAIMER } from '@/lib/disclaimer';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms that govern your use of ClaimMatch — an information and matching service, not a law firm. No legal advice, no attorney-client relationship.',
};

const LAST_UPDATED = 'January 2026';
const CONTACT_EMAIL = 'legal@claimmatch.app';

export default function TermsPage() {
  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-narrow py-16 sm:py-20">
        {/* Header ---------------------------------------------------------- */}
        <div className="mb-10">
          <span className="badge-brand gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Terms of Service
          </span>
          <h1 className="mt-4 text-4xl font-extrabold">Terms of Service</h1>
          <p className="mt-3 text-ink-muted">
            These terms govern your use of ClaimMatch. Please read them carefully —
            by using the Service you agree to them.
          </p>
          <p className="mt-2 text-sm text-ink-soft">Last updated: {LAST_UPDATED}</p>
        </div>

        {/* Callout: not a law firm ---------------------------------------- */}
        <div className="mb-10 rounded-2xl border border-brand-100 bg-brand-50 p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-800">
            <ShieldAlert className="h-4 w-4" /> Important
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            ClaimMatch is an information and matching service, <strong>not a law
            firm</strong>. We do not provide legal advice, and using the Service does
            not create an attorney-client relationship. Always consult a licensed
            attorney for advice about your specific situation.
          </p>
        </div>

        {/* Body ------------------------------------------------------------ */}
        <div className="space-y-10 text-ink-muted">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">1. Acceptance of these terms</h2>
            <p>
              By accessing or using the ClaimMatch website and related services (the
              “Service”), you agree to be bound by these Terms of Service and by our{' '}
              <Link href="/privacy" className="font-semibold text-brand-700 hover:text-brand-800">
                Privacy Policy
              </Link>
              . If you do not agree, please do not use the Service. You must be at
              least 18 years old to use ClaimMatch.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">
              2. Not a law firm; no legal advice
            </h2>
            <p>
              ClaimMatch helps you discover class-action settlements and lawsuits you
              may qualify for and points you toward the relevant official claim forms.
              We are not attorneys, we do not represent you, and nothing on the Service
              is legal advice. Using the Service, communicating with us, or receiving a
              match does not create an attorney-client relationship. Any decision about
              whether to file a claim, join a lawsuit, or opt out of a settlement is
              yours alone, and you should seek independent legal advice where
              appropriate.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. Accuracy and eligibility</h2>
            <p>
              We work to keep settlement information accurate and current, but we make
              no guarantee about the completeness, accuracy, timeliness, or
              availability of any information on the Service. Eligibility rules,
              deadlines, and payout amounts are set by the courts and settlement
              administrators — not by ClaimMatch — and can change without notice. A
              match on ClaimMatch is a suggestion that you may qualify; it is not a
              determination of eligibility and does not guarantee any payment. Always
              confirm the details and deadlines on the official settlement website
              before you rely on them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">4. Your responsibilities</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Provide accurate, truthful answers in your eligibility profile. Filing
                a claim you don’t qualify for may be a violation of the law.
              </li>
              <li>
                Keep your account credentials secure and don’t share your account with
                others.
              </li>
              <li>
                Review each settlement’s official terms, requirements, and deadlines
                before submitting any claim.
              </li>
              <li>
                Use the Service only for lawful purposes and not to disrupt, scrape, or
                misuse it.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">5. Third-party claim sites and links</h2>
            <p>
              The Service links to third-party websites, including official settlement
              administrators and independent claim-filing services. Those sites are
              operated by others and are governed by their own terms and privacy
              policies. We provide links for your convenience only, and a link does not
              imply endorsement. We are not responsible for the content, accuracy, or
              practices of any third-party site, and we may earn a referral fee if you
              choose to use certain partner claim services (see our{' '}
              <Link href="/about" className="font-semibold text-brand-700 hover:text-brand-800">
                About page
              </Link>{' '}
              for how we make money).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, ClaimMatch and its operators are
              not liable for any indirect, incidental, special, consequential, or
              punitive damages, or for any loss of money, claims, or opportunities,
              arising out of or related to your use of (or inability to use) the
              Service. The Service is provided “as is” and “as available,” without
              warranties of any kind, whether express or implied. Any rewards,
              settlements, or compensation you obtain may be subject to applicable fees,
              including attorney’s fees and court costs. Past results do not guarantee
              future outcomes, and each legal matter is unique.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">7. Full legal disclaimer</h2>
            <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-ink-soft">
              {LEGAL_DISCLAIMER}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">8. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. When we do, we’ll revise the
              “Last updated” date above. Your continued use of the Service after changes
              take effect means you accept the revised terms. If you don’t agree with an
              update, please stop using the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">9. Contact us</h2>
            <p>
              Questions about these terms? Reach us at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-brand-700 hover:text-brand-800"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        {/* Footer note ----------------------------------------------------- */}
        <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            Curious how we handle your information? Read our{' '}
            <Link href="/privacy" className="font-semibold text-brand-700 hover:text-brand-800">
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
