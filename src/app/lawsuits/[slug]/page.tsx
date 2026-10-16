import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  UserCheck,
} from 'lucide-react';
import {
  displaySummary,
  isOpenForClaims,
  isSettleSignalRecord,
  lookupLawsuitBySlug,
  officialLinkFor,
  settleSignalPageFor,
  type CatalogLink,
} from '@/lib/lawsuits';
import { proofDetail, proofLabel } from '@/lib/proof';
import { deadlineUrgencyLabel, formatDeadline, isDeadlinePassed, SITE } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import type { Lawsuit } from '@/lib/types';

type Params = { params: Promise<{ slug: string }> };

function deadlineText(lawsuit: Lawsuit): string {
  return lawsuit.deadline ? formatDeadline(lawsuit.deadline) : 'Not listed';
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const result = await lookupLawsuitBySlug(slug);
  if (result.status === 'missing') {
    return { title: 'Settlement not found', robots: { index: false, follow: false } };
  }
  if (result.status === 'error') {
    return { title: 'Settlement', robots: { index: false, follow: false } };
  }

  const lawsuit = result.lawsuit;
  const open = isOpenForClaims(lawsuit);
  const url = `${SITE.url.replace(/\/$/, '')}/lawsuits/${lawsuit.slug}`;
  const description = open
    ? `${lawsuit.title}: deadline ${deadlineText(lawsuit)}. See who may qualify and go to the official site to file for free. Listing not yet verified by ClaimMatch.`
    : `${lawsuit.title} is not taking claims.`;

  return {
    title: lawsuit.title,
    description,
    alternates: { canonical: url },
    // Only settlements open for claims are listed in the sitemap and indexed.
    robots: open ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: lawsuit.title,
      description,
      url,
      siteName: SITE.name,
      type: 'article',
    },
  };
}

export default async function LawsuitDetailPage({ params }: Params) {
  const { slug } = await params;
  const result = await lookupLawsuitBySlug(slug);
  if (result.status === 'missing') notFound();
  if (result.status === 'error') {
    // Shown by src/app/lawsuits/error.tsx with a retry button.
    throw new Error('Settlement lookup failed');
  }

  const lawsuit = result.lawsuit;
  const open = isOpenForClaims(lawsuit);
  const urgency = open ? deadlineUrgencyLabel(lawsuit.deadline) : null;
  const deadlinePassed = isDeadlinePassed(lawsuit.deadline);
  const official = officialLinkFor(lawsuit);
  const fromSettleSignal = isSettleSignalRecord(lawsuit);
  const settleSignalPage = settleSignalPageFor(lawsuit);
  const payout = lawsuit.typical_payout?.trim() || 'Not stated';
  const summary = displaySummary(lawsuit);
  const showAbout =
    !!lawsuit.description &&
    lawsuit.description.trim() !== payout &&
    lawsuit.description.trim() !== summary;

  return (
    <>
      {/* Header ------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative py-10 sm:py-14">
          <Link
            href="/lawsuits"
            className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All open settlements
          </Link>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="badge-brand">{lawsuit.category}</span>
            {open ? (
              <span className="badge-green">Open for claims</span>
            ) : (
              <span className="badge-gray">Claims closed</span>
            )}
            {urgency && (
              <span className="badge-red gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" /> {urgency}
              </span>
            )}
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl">
            {lawsuit.title}
          </h1>
          {summary && <p className="mt-4 max-w-2xl text-lg text-ink-muted">{summary}</p>}
        </div>
      </section>

      {/* D50: unverified label with the official link ------------------------ */}
      <section className="container-page -mt-2 pb-4" aria-labelledby="unverified-heading">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="flex-1">
              <h2 id="unverified-heading" className="text-sm font-bold text-amber-900">
                Unverified: check the official site
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                {open
                  ? 'We haven’t checked this listing against the official settlement notice yet. Before you file, confirm the deadline, who qualifies and what proof you need on the official site.'
                  : 'We haven’t checked this listing against the official settlement notice. The official site has the latest status.'}
              </p>
              <OfficialLink link={official} />
            </div>
          </div>
        </div>
      </section>

      {/* Body --------------------------------------------------------------- */}
      <section className="container-page grid gap-8 py-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <dl className="grid gap-4 rounded-2xl bg-gray-50 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Deadline</dt>
              <dd className="mt-1 text-base font-bold text-ink">{deadlineText(lawsuit)}</dd>
              <dd className="mt-1 text-sm text-ink-muted">
                {!open
                  ? deadlinePassed
                    ? 'This deadline has passed.'
                    : 'Not taking claims.'
                  : lawsuit.deadline
                    ? 'Deadlines often end at 11:59 pm in the settlement’s time zone. Check the official site for the exact cutoff.'
                    : 'This listing has no deadline. Check the official site.'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Proof</dt>
              <dd className="mt-1 text-base font-bold text-ink">{proofLabel(lawsuit)}</dd>
              <dd className="mt-1 text-sm text-ink-muted">{proofDetail(lawsuit)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                Payout, as the listing states it
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-ink">{payout}</dd>
              <dd className="mt-1 text-sm text-ink-muted">
                The amount you get depends on the settlement’s rules and how many people file.
              </dd>
            </div>
          </dl>

          {showAbout && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">About this settlement</h2>
              <p className="mt-3 leading-relaxed text-ink-muted">{lawsuit.description}</p>
            </div>
          )}

          {lawsuit.eligibility_text && (
            <div className="mt-8 rounded-2xl border border-success-500/20 bg-success-50/60 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <UserCheck className="h-5 w-5 text-success-600" aria-hidden="true" /> Who may qualify
              </h2>
              <p className="mt-2 leading-relaxed text-ink-muted">{lawsuit.eligibility_text}</p>
              <p className="mt-2 text-sm text-ink-muted">
                The official notice has the exact rules.
              </p>
            </div>
          )}

          {open && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">How filing works</h2>
              <ol className="mt-4 space-y-4">
                {[
                  {
                    title: 'Check that you qualify',
                    body: 'Read the official notice. It has the exact rules and the deadline.',
                  },
                  {
                    title: 'File on the official site yourself',
                    body: 'Filing is free. ClaimMatch never files for you and never takes a cut of your payment.',
                  },
                  {
                    title: 'Keep track in ClaimMatch',
                    body: 'Tell us when you’ve filed and save the confirmation number the official site gives you.',
                  },
                ].map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{step.title}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(fromSettleSignal || official?.kind === 'source') && (
            <div className="mt-10 border-t border-gray-100 pt-6">
              <h2 className="text-base font-bold">Where this listing comes from</h2>
              {fromSettleSignal ? (
                <p className="mt-2 text-sm text-ink-muted">
                  Adapted from{' '}
                  <a
                    href="https://settlesignal.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
                  >
                    SettleSignal (settlesignal.com)
                  </a>
                  , used under{' '}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
                  >
                    CC BY 4.0
                  </a>
                  . ClaimMatch may have shortened or reformatted it. SettleSignal is a
                  listing service, not the settlement’s official site.
                  {settleSignalPage && (
                    <>
                      {' '}
                      <a
                        href={settleSignalPage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
                      >
                        See the SettleSignal listing
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      .
                    </>
                  )}
                </p>
              ) : (
                official && (
                  <p className="mt-2 text-sm text-ink-muted">
                    We found this listing on {official.host}. That page is a source, not the
                    settlement’s official site.
                  </p>
                )
              )}
            </div>
          )}

          <div className="mt-10">
            <Disclaimer />
          </div>
        </div>

        {/* Sidebar ---------------------------------------------------------- */}
        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border-t-4 border-brand-400 bg-white p-6 shadow-card">
            {open ? (
              <>
                <h2 className="text-lg font-bold">Ready to file?</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  We’ll guide you to the official site, where you file for free, and help
                  you keep track of your claim.
                </p>
                <Link
                  href={`/claim/${lawsuit.slug}`}
                  className="btn-primary mt-5 w-full justify-center"
                >
                  Start your claim <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <p className="mt-2 text-center text-xs text-ink-muted">
                  You’ll sign in or create a free account first.
                </p>
                {official?.kind === 'official' && (
                  <a
                    href={official.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary mt-4 w-full justify-center"
                  >
                    Go to the official site <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                <ul className="mt-5 space-y-2 border-t border-gray-100 pt-5">
                  {[
                    'You file on the official site yourself',
                    'ClaimMatch never files for you or takes a cut',
                    'Save your confirmation number in one place',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-ink-muted">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Claims closed</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {deadlinePassed && lawsuit.deadline
                    ? `This settlement isn’t taking claims. The deadline listed was ${formatDeadline(lawsuit.deadline)}.`
                    : 'This settlement isn’t taking claims.'}{' '}
                  Some settlements pay eligible people automatically. The official site
                  says whether that applies.
                </p>
                <p className="mt-3 text-sm text-ink-muted">
                  Already filed? Keep the confirmation number the official site gave you.
                </p>
                <Link
                  href="/lawsuits"
                  className="mt-5 inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  Browse open settlements <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}

function OfficialLink({ link }: { link: CatalogLink | null }) {
  if (!link) {
    return (
      <p className="mt-3 text-sm font-semibold text-amber-900">
        We don’t have a link to the official site yet. Search for the settlement’s
        official website, and only use a site the settlement notice names.
      </p>
    );
  }
  if (link.kind === 'official') {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
      >
        Go to the official site ({link.host})
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <div className="mt-3 text-sm text-amber-900">
      <p>We don’t have the official site’s link yet. This is where we found the listing:</p>
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-semibold ring-1 ring-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
      >
        {link.label} ({link.host}, not the official site)
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
