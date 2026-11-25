import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { isThinSettlement } from '@/lib/catalog-page';
import {
  displaySummary,
  getLawsuits,
  isOpenForClaims,
  isSettleSignalRecord,
  lookupLawsuitBySlug,
  officialLinkFor,
  settleSignalPageFor,
  type CatalogLink,
} from '@/lib/lawsuits';
import { settlementPreviewPath } from '@/lib/match-preview';
import { relatedSettlements } from '@/lib/related-settlements';
import { proofDetail } from '@/lib/proof';
import { catalogGuideFaqs, catalogGuideSections, catalogGuideSummary } from '@/lib/catalog-guides';
import {
  hasOfficialNoticeGuide,
  noticeCheckedOnLabel,
  settlementProofDetail,
} from '@/lib/settlement-guides';
import {
  displayEligibilityText,
  overlayVerifiedFacts,
  showVerifiedBadge,
} from '@/lib/verified-fields';
import {
  breadcrumbJsonLd,
  categoryHubPath,
  faqJsonLd,
  pageUrl,
  settlementAnswerFacts,
  settlementArticleJsonLd,
  settlementFaqs,
  settlementLegalServiceJsonLd,
  settlementMetaDescription,
  settlementMetaTitle,
  settlementPath,
} from '@/lib/settlement-seo';
import { settlementHowToJsonLd, settlementHowToSteps } from '@/lib/settlement-howto';
import { flags } from '@/lib/flags';
import { isTestSettlementSlug } from '@/lib/test-settlements';
import { settlementOgImagePath } from '@/lib/site-metadata';
import { deadlineUrgencyLabel, formatDeadline, isDeadlinePassed, SITE } from '@/lib/utils';
import { AddToCalendarLink } from '@/components/settlement/AddToCalendarLink';
import { AnswerBlock } from '@/components/settlement/AnswerBlock';
import { ClosesInChip } from '@/components/settlement/ClosesInChip';
import { ProofFeedback } from '@/components/settlement/ProofFeedback';
import { VerifiedBadge } from '@/components/settlement/VerifiedBadge';
import { HubLinks } from '@/components/settlement/HubLinks';
import { JsonLd } from '@/components/settlement/JsonLd';
import { PageBreadcrumbs } from '@/components/settlement/PageBreadcrumbs';
import { RelatedSettlements } from '@/components/settlement/RelatedSettlements';
import { SettlementFaq } from '@/components/settlement/SettlementFaq';
import { OfficialFormLink } from '@/components/settlement/OfficialFormLink';
import { SettlementEligibilityQuiz } from '@/components/settlement/SettlementEligibilityQuiz';
import { GuideSignupCta } from '@/components/settlement/GuideSignupCta';
import { SettlementQualifyCta } from '@/components/settlement/SettlementQualifyCta';
import { StickyQualifyCta } from '@/components/settlement/StickyQualifyCta';
import { ClaimActionCta, EasySubmitBadge } from '@/components/claims/ClaimActionCta';
import {
  ACCOUNT_FOR_SAVE_WHY,
  BROWSE_NO_ACCOUNT,
  guideFilingCopy,
  WE_FILE_THIS_CLAIM,
  WE_HELP_YOU_FILE,
  WE_FILE_THIS_CLAIM_GUIDE,
  WE_HELP_YOU_FILE_GUIDE,
} from '@/lib/copy';
import { settlementFilingMode } from '@/lib/filing/public-filing';
import { eligibilityQuizPrompts } from '@/lib/settlement-quiz';
import { Disclaimer } from '@/components/Disclaimer';
import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import { CaptureView } from '@/components/analytics/CaptureView';
import { FileFreeDirectly } from '@/components/FileFreeDirectly';
import { PublicTrustBlock } from '@/components/PublicTrustBlock';
import type { Lawsuit } from '@/lib/types';

export const revalidate = 3600;
export const dynamic = 'force-static';

type Params = { params: Promise<{ slug: string }> };

function deadlineText(lawsuit: Lawsuit): string | null {
  return lawsuit.deadline ? formatDeadline(lawsuit.deadline) : null;
}

export async function generateStaticParams() {
  const lawsuits = await getLawsuits();
  return lawsuits.map((lawsuit) => ({ slug: lawsuit.slug }));
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
  const filingMode = open
    ? await settlementFilingMode({ lawsuitId: lawsuit.id, viewer: null })
    : 'never_files';
  const url = pageUrl(settlementPath(lawsuit.slug));
  const title = settlementMetaTitle(lawsuit);
  const description = open
    ? settlementMetaDescription(lawsuit, filingMode)
    : `${lawsuit.title} is not taking claims.`;
  // Closed, past-deadline, and thin listings (no deadline, eligibility,
  // administrator, or payout) stay out of the index.
  const index = open && !isThinSettlement(lawsuit);

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE.name,
      type: 'article',
      images: [
        {
          url: settlementOgImagePath(lawsuit.slug),
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [settlementOgImagePath(lawsuit.slug)],
    },
  };
}

export default async function LawsuitDetailPage({ params }: Params) {
  const { slug } = await params;
  // The one-click test settlement has no public page (testers open /claim/<slug>).
  if (isTestSettlementSlug(slug)) notFound();
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
  // Who files. Agent lane: we file this claim; every other guide: we help you file.
  const filingMode = open ? await settlementFilingMode({ lawsuitId: lawsuit.id, viewer: null }) : 'never_files';
  const summary = displaySummary(lawsuit) || catalogGuideSummary({ ...lawsuit, summary: null });
  const guideSections = catalogGuideSections(lawsuit, filingMode === 'agent');
  const filingCopy = guideFilingCopy(filingMode);
  // The feed's placeholder ("Open to eligible US residents.") is not a rule.
  const eligibility = displayEligibilityText(lawsuit);
  const verified = showVerifiedBadge(lawsuit);
  const guided = hasOfficialNoticeGuide(lawsuit.slug);
  const checkedLabel = noticeCheckedOnLabel(lawsuit.slug);
  const showUnverifiedBanner = !verified && !guided;
  const showAbout =
    !!lawsuit.description &&
    lawsuit.description.trim() !== payout &&
    lawsuit.description.trim() !== summary;
  const facts = overlayVerifiedFacts(settlementAnswerFacts(lawsuit), lawsuit);
  const faqs = [
    ...settlementFaqs(lawsuit, filingMode !== 'never_files', filingMode === 'agent'),
    ...catalogGuideFaqs(lawsuit),
  ];
  const claimHref = `/claim/${lawsuit.slug}`;
  const qualifyEnabled = open;
  const qualifyHref = qualifyEnabled ? settlementPreviewPath(lawsuit.slug) : null;
  const quizPrompts = eligibilityQuizPrompts(eligibility);
  const related = flags.relatedSettlements()
    ? relatedSettlements(lawsuit, await getLawsuits())
    : [];
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Open settlements', path: '/lawsuits' },
    { name: lawsuit.category, path: categoryHubPath(lawsuit.category) },
    { name: lawsuit.title, path: settlementPath(lawsuit.slug) },
  ];

  return (
    <>
      <CaptureView
        event="settlement_viewed"
        properties={{ lawsuit_id: lawsuit.id, slug: lawsuit.slug }}
      />
      {qualifyEnabled && qualifyHref && (
        <CaptureOnce
          event="settlement_cta_viewed"
          properties={{ lawsuit_id: lawsuit.id, slug: lawsuit.slug }}
        />
      )}
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={faqJsonLd(faqs)} />
      <JsonLd data={settlementArticleJsonLd(lawsuit, filingMode)} />
      <JsonLd data={settlementLegalServiceJsonLd(lawsuit, filingMode)} />
      <JsonLd data={settlementHowToJsonLd(lawsuit, filingMode)} />

      {/* Header ------------------------------------------------------------- */}
      <section className="bg-brand-50">
        <div className="container-page py-10 sm:py-14">
          <PageBreadcrumbs
            items={[
              { name: 'Home', href: '/' },
              { name: 'Open settlements', href: '/lawsuits' },
              { name: lawsuit.category, href: categoryHubPath(lawsuit.category) },
              { name: lawsuit.title },
            ]}
          />

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href={categoryHubPath(lawsuit.category)}
              className="badge-brand rounded-full hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {lawsuit.category}
            </Link>
            {open ? (
              <span className="badge-green">Open for claims</span>
            ) : (
              <span className="badge-gray">Claims closed</span>
            )}
            {open &&
              (filingMode === 'agent' ? (
                <span className="badge-green">{WE_FILE_THIS_CLAIM}</span>
              ) : (
                <span className="badge-brand rounded-full">{WE_HELP_YOU_FILE}</span>
              ))}
            <EasySubmitBadge type={lawsuit.claim_action_type} />
            {!flags.closesInChips() && urgency && (
              <span className="badge-red gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" /> {urgency}
              </span>
            )}
            <ClosesInChip deadline={lawsuit.deadline} />
            <VerifiedBadge lawsuit={lawsuit} />
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
            {lawsuit.title}
          </h1>
          {summary && <p className="mt-4 max-w-2xl text-lg text-ink-muted">{summary}</p>}
          <p className="mt-3 max-w-2xl text-sm text-ink-muted">
            {BROWSE_NO_ACCOUNT} {ACCOUNT_FOR_SAVE_WHY}
          </p>

          <AnswerBlock
            facts={facts}
            open={open}
            claimHref={claimHref}
            official={official}
            lawsuitId={lawsuit.id}
            slug={lawsuit.slug}
            qualifyHref={qualifyHref ?? undefined}
            qualifySlug={qualifyEnabled ? lawsuit.slug : undefined}
            qualifyLawsuitId={qualifyEnabled ? lawsuit.id : undefined}
            checkedOn={checkedLabel}
          />

          {open && (
            // On phones the sidebar comes last, so offer the next step up here too.
            <div className="mt-6 lg:hidden">
              {flags.claimActionCtas() && lawsuit.claim_action_type ? (
                <ClaimActionCta
                  slug={lawsuit.slug}
                  claimActionType={lawsuit.claim_action_type}
                  claimAction={lawsuit.claim_action}
                  officialHref={official?.kind === 'official' ? official.href : null}
                  deskEligible={filingMode === 'agent'}
                />
              ) : qualifyHref ? (
                <SettlementQualifyCta
                  href={qualifyHref}
                  slug={lawsuit.slug}
                  lawsuitId={lawsuit.id}
                  className="btn-primary w-full justify-center sm:w-auto"
                >
                  Check if you qualify <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </SettlementQualifyCta>
              ) : (
                <Link
                  href={claimHref}
                  className="btn-primary w-full justify-center sm:w-auto"
                >
                  Start your claim <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
              <p className="mt-2 text-xs text-ink-muted">
                {filingMode === 'agent' ? WE_FILE_THIS_CLAIM_GUIDE : WE_HELP_YOU_FILE_GUIDE}
              </p>
              <GuideSignupCta slug={lawsuit.slug} filingMode={filingMode} className="mt-4" />
            </div>
          )}
        </div>
      </section>

      {/* Unverified warning — hidden for admin-verified rows (C7) and official-notice guides. */}
      {showUnverifiedBanner ? (
      <section className="container-page pb-4" aria-labelledby="unverified-heading">
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
      ) : checkedLabel ? (
      <section className="container-page pb-4">
        <p className="text-sm text-ink-muted">{checkedLabel}</p>
      </section>
      ) : null}

      {/* Body --------------------------------------------------------------- */}
      <section className={`container-page grid gap-8 py-10 lg:grid-cols-3${qualifyHref ? ' pb-28 lg:pb-10' : ''}`}>
        <div className="lg:col-span-2">
          <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
            {deadlineText(lawsuit) && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Deadline</dt>
              <dd className="mt-1 text-base font-bold text-ink">{deadlineText(lawsuit)}</dd>
              <AddToCalendarLink slug={lawsuit.slug} deadline={lawsuit.deadline} />
              <dd className="mt-1 text-sm text-ink-muted">
                {!open
                  ? deadlinePassed
                    ? 'This deadline has passed.'
                    : 'Not taking claims.'
                  : 'Deadlines often end at 11:59 pm in the settlement’s time zone. Check the official site for the exact cutoff.'}
              </dd>
            </div>
            )}
            {facts.proof && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Proof</dt>
              <dd className="mt-1 text-base font-bold text-ink">{facts.proof}</dd>
              <dd className="mt-1 text-sm text-ink-muted">
                {verified
                  ? proofDetail({
                      proof_required: false,
                      eligibility: { proof: lawsuit.proof_verified ?? undefined },
                    })
                  : settlementProofDetail(lawsuit)}
              </dd>
            </div>
            )}
          </dl>

          {showAbout && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">About this settlement</h2>
              <p className="mt-3 leading-relaxed text-ink-muted">{lawsuit.description}</p>
            </div>
          )}

          {/* Neutral, not a success box: the text is unverified, like the claim page's Step 1. */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold">Who may qualify</h2>
            {eligibility ? (
              <>
                <p className="mt-2 text-sm text-ink-muted">What our listing says:</p>
                <p className="mt-1 leading-relaxed text-ink">{eligibility}</p>
                <p className="mt-2 text-sm text-ink-muted">
                  This is a short summary, not the official rules. The official notice has
                  the exact rules.
                </p>
              </>
            ) : (
              <p className="mt-2 leading-relaxed text-ink-muted">
                We don’t have the rules for who qualifies. Read the official notice before
                you file.
              </p>
            )}
            {official?.kind === 'official' && (
              <OfficialFormLink
                href={official.href}
                lawsuitId={lawsuit.id}
                slug={lawsuit.slug}
                className="text-link mt-3 inline-flex items-center gap-1"
              >
                Read the rules on the official site
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </OfficialFormLink>
            )}
          </div>

          {open && quizPrompts.length > 0 && (
            <SettlementEligibilityQuiz
              eligibilityText={eligibility}
              lawsuitId={lawsuit.id}
              slug={lawsuit.slug}
            />
          )}

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold">Listed payout</h2>
            <p className="mt-2 leading-relaxed text-ink">{guideSections.payout}</p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold">Proof needed</h2>
            <p className="mt-2 leading-relaxed text-ink">{guideSections.proof}</p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold">Claim deadline</h2>
            <p className="mt-2 leading-relaxed text-ink">{guideSections.deadline}</p>
          </div>

          {open && (
            <div className="mt-8">
              <FileFreeDirectly official={official} lawsuitId={lawsuit.id} slug={lawsuit.slug} />
            </div>
          )}

          {open && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">How to file</h2>
              <ol className="mt-4 space-y-4">
                {settlementHowToSteps(filingMode).map((step, i) => (
                  <li key={step.name} className="flex gap-3">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{step.name}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <GuideSignupCta slug={lawsuit.slug} filingMode={filingMode} className="mt-6" />
            </div>
          )}

          {flags.proofFeedback() && <ProofFeedback lawsuitId={lawsuit.id} />}

          <div className="mt-8">
            <PublicTrustBlock compact />
          </div>

          <SettlementFaq items={faqs} />

          {related.length > 0 && (
            <RelatedSettlements items={related} fromSlug={lawsuit.slug} />
          )}

          <div className="mt-10">
            <HubLinks categories={[lawsuit.category]} />
          </div>

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
                  . Lawsuit AI may have shortened or reformatted it. SettleSignal is a
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
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            {open ? (
              <>
                <h2 className="text-lg font-bold">Check if you qualify</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {filingMode === 'agent'
                    ? 'We file this claim for you after you review and sign it. You can always file on the official site yourself instead, where filing is free.'
                    : 'We help you file. Filing is free on the official site. You can always file this claim yourself.'}
                </p>
                {flags.claimActionCtas() && lawsuit.claim_action_type ? (
                  <div className="mt-5">
                    <ClaimActionCta
                      slug={lawsuit.slug}
                      claimActionType={lawsuit.claim_action_type}
                      claimAction={lawsuit.claim_action}
                      officialHref={official?.kind === 'official' ? official.href : null}
                      deskEligible={filingMode === 'agent'}
                    />
                  </div>
                ) : (
                  <>
                {qualifyHref ? (
                  <SettlementQualifyCta
                    href={qualifyHref}
                    slug={lawsuit.slug}
                    lawsuitId={lawsuit.id}
                    className="btn-primary mt-5 w-full justify-center"
                  >
                    Check if you qualify <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </SettlementQualifyCta>
                ) : (
                  <Link
                    href={claimHref}
                    className="btn-primary mt-5 w-full justify-center"
                  >
                    Check if you qualify <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
                <Link
                  href={claimHref}
                  className="btn-secondary mt-3 w-full justify-center"
                >
                  Start your claim <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                  </>
                )}
                <GuideSignupCta slug={lawsuit.slug} filingMode={filingMode} className="mt-4" />
                <p className="mt-2 text-center text-xs text-ink-muted">{ACCOUNT_FOR_SAVE_WHY}</p>
                {official?.kind === 'official' && (
                  <OfficialFormLink
                    href={official.href}
                    lawsuitId={lawsuit.id}
                    slug={lawsuit.slug}
                    className="btn-secondary mt-4 w-full justify-center"
                  >
                    Go to the official site <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </OfficialFormLink>
                )}
                {official?.kind === 'official' && (
                  <p className="mt-2 text-center text-xs text-ink-muted">{BROWSE_NO_ACCOUNT}</p>
                )}
                <ul className="mt-5 space-y-2 border-t border-gray-100 pt-5">
                  {filingCopy.points.map((t) => (
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
      {qualifyHref && (
        <StickyQualifyCta
          href={qualifyHref}
          slug={lawsuit.slug}
          lawsuitId={lawsuit.id}
        />
      )}
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
    // The short-answer "Official claim site" button already covers this URL.
    return null;
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
