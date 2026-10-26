import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { legalContact } from '@/lib/legal-contact';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What ClaimMatch collects, why, who helps us process it, the cookies we use, and your choices. Interim policy, pending legal review.',
};

const LAST_UPDATED = 'October 26, 2026';
const LINK = 'font-semibold text-brand-700 underline hover:text-brand-800';

/** Service providers that process personal information for us (or, for SettleSignal, none). */
const PROVIDERS = [
  {
    name: 'Supabase',
    role: 'Our database and sign-in provider. It stores your account, your answers and the claims you track, and sends sign-in emails such as the link to confirm your email address.',
  },
  {
    name: 'Vercel',
    role: 'Hosts the website and runs Vercel Web Analytics, which counts page visits without cookies.',
  },
  {
    name: 'PostHog',
    role: 'Product analytics: which pages are visited and which buttons are clicked. It uses cookies and similar browser storage. Events go through a first-party /ingest path on this site. We skip PostHog when your browser sends a Do Not Track signal.',
  },
  {
    name: 'Resend',
    role: 'Sends our emails. It receives your email address and the content of the email.',
  },
  {
    name: 'SettleSignal',
    role: 'A public source of settlement data that we use for our listings. We do not share any user data with SettleSignal.',
  },
];

export default function PrivacyPage() {
  const contact = legalContact();
  const operator = contact.legalEntity;
  const hasContact = Boolean(contact.email || contact.postalAddress);

  return (
    <div className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-narrow py-16 sm:py-20">
        {/* Header ---------------------------------------------------------- */}
        <div className="mb-8">
          <span className="badge-brand gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Privacy Policy
          </span>
          <h1 className="mt-4 text-4xl font-extrabold">Privacy Policy</h1>
          <p className="mt-3 text-ink-muted">
            This policy explains, in plain English, what ClaimMatch collects, why, who
            helps us handle it, and the choices you have.
          </p>
          <p className="mt-2 text-sm text-ink-muted">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="mb-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p>
            <strong className="font-semibold">Interim, pending legal review.</strong>{' '}
            This is a temporary policy. We will update it after a lawyer reviews it and
            change the date above when we do.
          </p>
        </div>

        {/* Body ------------------------------------------------------------ */}
        <div className="space-y-10 text-ink-muted">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">1. Who we are</h2>
            <p>
              ClaimMatch is a free claim assistant that helps people find class-action
              settlements, check the official details, and keep track of the claims they
              file themselves.{operator ? ` ClaimMatch is run by ${operator}.` : ''} We are
              not a law firm. This policy covers the ClaimMatch website and services (the
              “Service”).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">2. What we collect</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <span className="font-semibold text-ink">Account details:</span> your email
                address, the name you give when you sign up, and your password. Our sign-in
                provider stores passwords in scrambled (hashed) form, so we can’t read them.
              </li>
              <li>
                <span className="font-semibold text-ink">Answers you give us:</span> your
                state and your answers to our short questions, such as whether you received
                a data-breach notice, own a car (and which brands), paid bank fees, bought
                packaged goods, use social media or streaming services, or worked an hourly
                or gig job.
              </li>
              <li>
                <span className="font-semibold text-ink">Details you add in Settings:</span>{' '}
                your name and, if you choose, your phone number. We don’t send text
                messages.
              </li>
              <li>
                <span className="font-semibold text-ink">Claims you track:</span> which
                settlements you’re tracking, the status you report (for example “Reported
                filed by you”) and any confirmation numbers you add.
              </li>
              <li>
                <span className="font-semibold text-ink">Earlier claim forms:</span> if you
                used the claim forms we offered before October 2026, we kept what you
                entered (such as your name, email and mailing address), the name you typed
                to sign, and your IP address at that time.
              </li>
              <li>
                <span className="font-semibold text-ink">Referrals:</span> if you joined
                through someone’s invite link, the invite code and who invited you.
              </li>
              <li>
                <span className="font-semibold text-ink">Our old email sign-up list:</span>{' '}
                if you used the email form that used to be on our home page, we kept your
                email address (and state, if you gave it). We no longer collect addresses
                that way.
              </li>
              <li>
                <span className="font-semibold text-ink">Usage and device data:</span> pages
                you visit, buttons you click, your browser and device type, and approximate
                location based on your IP address, collected through PostHog and Vercel Web
                Analytics. When you’re logged in, PostHog links this activity to your
                account id only — not your email address or name. Like most
                websites, our hosting provider also keeps technical logs, such as IP
                addresses, to keep the Service working and secure.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">3. Health information</h2>
            <p>
              We don’t ask about your health. We used to ask whether you had taken
              prescription medication or used a medical device. That question is no longer
              asked, and we no longer collect answers to it. If you answered it before, your
              answer is still stored for now. We plan to delete those answers, and you can
              ask us to delete yours sooner.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">4. How we use it</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>To run your account and let you log in.</li>
              <li>To show you settlements and keep track of the claims you file.</li>
              <li>
                To send account emails (such as confirming your email address) and important
                notices about claims you track.
              </li>
              <li>
                To send settlement alert emails, only while you leave them turned on in
                Settings. These emails are paused for now.
              </li>
              <li>To understand how the Service is used, fix problems and improve it.</li>
              <li>To keep the Service secure, prevent abuse and follow the law.</li>
            </ul>
            <p>We don’t use your information for advertising.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">5. Who we share it with</h2>
            <p>
              We don’t sell your personal information, and we don’t share it for
              advertising. We share it only with the service providers that help us run
              ClaimMatch, and only as needed to do that:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              {PROVIDERS.map((p) => (
                <li key={p.name}>
                  <span className="font-semibold text-ink">{p.name}</span> — {p.role}
                </li>
              ))}
            </ul>
            <p>
              We may also share information when the law requires it, or to protect the
              rights and safety of our users and ClaimMatch. ClaimMatch never sends your
              information to settlement administrators: you give it to them yourself when
              you file.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">6. Cookies and similar technologies</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <span className="font-semibold text-ink">Sign-in cookies</span> keep you
                logged in and your session secure. The Service can’t log you in without them.
              </li>
              <li>
                <span className="font-semibold text-ink">Analytics:</span> PostHog stores a
                random ID in a cookie and in your browser’s local storage so we can count
                visits and see how people use the site. If your browser sends a Do Not
                Track signal, we do not load PostHog or set that cookie.
              </li>
              <li>
                <span className="font-semibold text-ink">Referral cookie:</span> if you open
                someone’s invite link, we save their invite code in a cookie for 30 days.
              </li>
              <li>
                <span className="font-semibold text-ink">First-touch campaign cookie:</span>{' '}
                if a link includes utm_source, utm_medium, utm_campaign, utm_content or
                ref, we save those values in a cookie for 30 days so we can attribute
                your signup to the first campaign you arrived from. Later links do not
                overwrite it.
              </li>
              <li>Vercel Web Analytics does not use cookies.</li>
              <li>We don’t use advertising cookies.</li>
            </ul>
            <p>
              You can block or delete cookies in your browser settings, or send a Do Not
              Track signal to skip analytics. If you block sign-in cookies, you won’t be
              able to log in. Using the Service with analytics cookies allowed is your
              consent to this product-analytics use — not advertising.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">7. Emails</h2>
            <p>
              We send account emails, such as the link to confirm your email address. We
              may also send important notices about claims you track, such as a correction;
              these come even if you turn off other emails, because they’re about your
              claims. Settlement alert emails are paused for now, and you can turn them off
              at any time in Settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">8. How long we keep it</h2>
            <p>
              We keep your information while your account is open. If you ask us to delete
              your account, we will delete your personal information, except anything we
              must keep to meet legal obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">9. Your choices and rights</h2>
            <p>
              You can update your name, state and phone number, and turn alert emails on or
              off, in Settings. You can request a copy of the personal information we have
              about you, including any answers you gave to our earlier questions, and you
              can ask us to correct it or to delete your account and data.
              Depending on where you live, you may have other rights under state law.
            </p>
            {contact.email && (
              <p>
                To make a request, email us at{' '}
                <a href={`mailto:${contact.email}`} className={LINK}>
                  {contact.email}
                </a>
                .
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">10. How we protect it</h2>
            <p>
              Your data is stored with Supabase, which encrypts stored data and data in
              transit. Database rules limit each account to its own records. No system is
              perfectly secure, but we work to protect your information and limit who can
              access it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">11. Children’s privacy</h2>
            <p>
              ClaimMatch is for adults. We do not knowingly collect personal information
              from anyone under 18. If you believe a child has given us information, please
              contact us and we’ll delete it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-ink">12. Changes to this policy</h2>
            <p>
              We may update this policy. When we do, we’ll change the “Last updated” date
              above, and we’ll tell you on the Service if a change is significant.
            </p>
          </section>

          {hasContact && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-ink">13. Contact us</h2>
              {contact.email && (
                <p>
                  Questions about your privacy or this policy? Email us at{' '}
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
            Want the short version? See{' '}
            <Link href="/trust" className={LINK}>
              what we store and why
            </Link>
            .
          </p>
          <Link href="/terms" className="btn-secondary shrink-0">
            Read our Terms
          </Link>
        </div>
      </div>
    </div>
  );
}
