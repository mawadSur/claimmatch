import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How ClaimMatch collects, uses, and protects your information: your email and eligibility answers, why we need them, how they’re stored, and how to opt out.',
};

const LAST_UPDATED = 'January 2026';
const CONTACT_EMAIL = 'privacy@claimmatch.app';

export default function PrivacyPage() {
  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-narrow py-16 sm:py-20">
        {/* Header ---------------------------------------------------------- */}
        <div className="mb-10">
          <span className="badge-brand gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy Policy
          </span>
          <h1 className="mt-4 text-4xl font-extrabold">Privacy Policy</h1>
          <p className="mt-3 text-ink-muted">
            Your trust is the whole product. This policy explains, in plain English,
            what ClaimMatch collects, why, and the choices you have.
          </p>
          <p className="mt-2 text-sm text-ink-soft">Last updated: {LAST_UPDATED}</p>
        </div>

        {/* Body ------------------------------------------------------------ */}
        <div className="space-y-10 text-ink-muted">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">1. Who we are</h2>
            <p>
              ClaimMatch is an information and matching service that helps people
              find class-action settlements and lawsuits they may qualify for. We are
              not a law firm and do not provide legal advice. This policy applies to
              the ClaimMatch website and related services (the “Service”).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">2. What we collect</h2>
            <p>We keep data collection to the minimum needed to match you well:</p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <span className="font-semibold text-ink">Your email address</span> —
                so we can create your account and email you when new settlements match
                your profile.
              </li>
              <li>
                <span className="font-semibold text-ink">Eligibility answers</span> —
                the responses you give in our questionnaire (for example, your state,
                whether you’ve received a data-breach notice, or the kinds of products
                you’ve bought). These power your matches.
              </li>
              <li>
                <span className="font-semibold text-ink">Claim activity</span> — which
                settlements you’ve chosen to file or dismiss, so we can track your
                claims and avoid showing you the same case twice.
              </li>
              <li>
                <span className="font-semibold text-ink">Basic technical data</span> —
                standard information your browser sends (such as general device and
                usage signals) needed to keep the Service secure and working.
              </li>
            </ul>
            <p>
              We do not ask for, and do not want, sensitive information beyond what a
              settlement’s eligibility criteria require.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. Why we use it</h2>
            <p>We use your information only to run the Service:</p>
            <ul className="ml-5 list-disc space-y-2">
              <li>To match you to settlements and lawsuits you may qualify for.</li>
              <li>To notify you by email when new matches open up.</li>
              <li>To help you file and keep track of your claims.</li>
              <li>To operate, secure, and improve the Service.</li>
            </ul>
            <p>
              Our matching is rule-based and driven entirely by the answers you
              provide — we don’t make hidden decisions about you.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">4. How your data is stored</h2>
            <p>
              Your account, profile, and claim data are stored in our database, hosted
              on <span className="font-semibold text-ink">Supabase</span> (a managed
              Postgres platform). Access is protected by row-level security, so you can
              only read and write your own records. We rely on our infrastructure
              providers’ industry-standard safeguards to encrypt data in transit and at
              rest. No system is perfectly secure, but we work to protect your
              information and limit access to it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">5. We do not sell your data</h2>
            <p>
              We do not sell, rent, or trade your personal information. We share data
              only with the service providers that help us run ClaimMatch (such as our
              hosting and email providers), and only to the extent needed to deliver
              the Service. If you choose to use a third-party claim-filing partner, any
              information you submit to them is governed by their own privacy policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Cookies and authentication</h2>
            <p>
              We use cookies that are necessary to keep you signed in and to keep your
              session secure. These are essential to how the Service works — without
              them we couldn’t log you in. We don’t use them to build advertising
              profiles about you.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">7. Email and opt-out</h2>
            <p>
              If you’ve asked us to notify you about matches, we’ll email you when new
              settlements fit your profile. You can opt out at any time by turning off
              email notifications in your account settings, using the unsubscribe link
              in any email we send, or contacting us at the address below. Opting out
              of match emails won’t delete your account or your saved matches.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">8. Your choices and rights</h2>
            <p>
              You can review and update your eligibility answers at any time, dismiss
              matches you’re not interested in, and request that we delete your account
              and associated data. To make a request, just get in touch using the
              contact details below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">9. Children’s privacy</h2>
            <p>
              ClaimMatch is intended for adults. We do not knowingly collect personal
              information from anyone under 18. If you believe a minor has provided us
              information, please contact us and we’ll remove it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">10. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. When we do, we’ll revise the
              “Last updated” date above. Significant changes will be communicated
              through the Service. Continuing to use ClaimMatch after an update means
              you accept the revised policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">11. Contact us</h2>
            <p>
              Questions about your privacy or this policy? Reach us at{' '}
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
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <Mail className="h-5 w-5" />
            </div>
            <p className="text-sm text-ink-muted">
              Want to see how we use your answers? Read{' '}
              <Link href="/how-it-works" className="font-semibold text-brand-700 hover:text-brand-800">
                how matching works
              </Link>
              .
            </p>
          </div>
          <Link href="/terms" className="btn-secondary shrink-0">
            Read our Terms
          </Link>
        </div>
      </div>
    </div>
  );
}
