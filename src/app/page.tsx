import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import type { Lawsuit } from '@/lib/types';
import { lookupLawsuits } from '@/lib/lawsuits';
import { HOME_CATALOG_COLUMNS, slimHomeCards } from '@/lib/home-catalog';
import { pickClosingSoon } from '@/lib/closing-soon';
import { pickTopPayouts } from '@/lib/top-payouts';
import { homeStats, type HomeStats } from '@/lib/home-stats';
import { payoutStats } from '@/lib/payout-stats';
import {
  BROWSE_NO_ACCOUNT,
  FILE_OR_EASY_SUBMIT,
  HOME_HERO_PRIMARY_CTA,
  OFFICIAL_FILING_IS_FREE,
  homeHeroPriceLine,
  accountGateWhy,
  lawsuitAiMayFile,
  publicBetaFeeCopy,
} from '@/lib/copy';
import { HomeHero, type HeroPayout } from '@/components/home/HomeHero';
import dynamic from 'next/dynamic';
import type { HowStep } from '@/components/home/how-it-works-types';
import { HomeFeatures } from '@/components/home/HomeFeatures';
import { HomeNarrowing } from '@/components/home/HomeNarrowing';
import { HomeSettlementList } from '@/components/home/HomeSettlementList';
import {
  catalogProofStats,
  HomeCatalogProof,
} from '@/components/home/HomeCatalogProof';
import { HomeTrust } from '@/components/home/HomeTrust';
import { HomeFaq } from '@/components/home/HomeFaq';
import { HomeFinalCta } from '@/components/home/HomeFinalCta';
import { PublicTrustBlock } from '@/components/PublicTrustBlock';
import type { Screen } from '@/components/home/DeviceFrame';
import { CaptureView } from '@/components/analytics/CaptureView';
import { flags } from '@/lib/flags';
import { homeWedgeAvailability, homeWedgesEnabled } from '@/lib/home-wedges';
import { oneClickLawsuitIdSet } from '@/lib/one-click-listings';
import { noticeCheckedOnLabel } from '@/lib/settlement-guides';
import { publicPageMetadata } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

const HowItWorks = dynamic(() => import('@/components/home/HowItWorks').then((m) => m.HowItWorks), {
  ssr: true,
});
const HomeTrimCatalog = dynamic(
  () => import('@/components/home/HomeTrimCatalog').then((m) => m.HomeTrimCatalog),
  { ssr: true },
);
const Testimonials = dynamic(
  () => import('@/components/home/Testimonials').then((m) => m.Testimonials),
  { ssr: true },
);

/**
 * Hero product shots only (above/near fold). How-it-works uses light SVGs so the
 * RSC payload stays small.
 */
const SCREENS = {
  catalogDesktop: {
    src: '/screens/catalog-desktop.webp',
    width: 1600,
    height: 1000,
    alt: 'The Lawsuit AI settlement list on a laptop: open class-action settlements, each with its payout, deadline and proof rule.',
  },
  catalog: {
    src: '/screens/catalog-mobile.webp',
    width: 780,
    height: 1688,
    alt: 'The settlement list on a phone, with search and each settlement’s payout and deadline.',
  },
  dashboard: {
    src: '/screens/dashboard-mobile.webp',
    width: 780,
    height: 1688,
    alt: 'The Lawsuit AI dashboard on a phone, listing a sample account’s claims grouped by what to do next, each with its deadline.',
  },
} satisfies Record<string, Screen>;

function howSteps(mayFile: boolean): HowStep[] {
  return [
    {
      title: 'Answer a few questions',
      body: 'Tell us a few things about yourself — state and simple yes/no answers. Matching never asks for your Social Security number or bank account details.',
      points: [
        'Takes a couple of minutes',
        'No card required to start',
        'No Social Security number or bank details to match',
      ],
      illustration: 'questions',
    },
    {
      title: 'See matched settlements',
      body: 'We show open settlements that may fit your answers. Every listing links to its official administrator notice so you can check it yourself.',
      points: [
        'Payout and deadline as the listing states them',
        'Official administrator link on every claim we have',
        'Browse without creating an account',
      ],
      illustration: 'matches',
    },
    mayFile
      ? {
          title: 'File with Easy submit or our guide',
          body: `${FILE_OR_EASY_SUBMIT} Filing on the official site is always free.`,
          points: [
            'Easy submit: a few questions and an e-sign',
            'Or follow the guide and file yourself',
            'No fee to file on the official site',
          ],
          illustration: 'file',
        }
      : {
          title: 'File with our guide',
          body: 'Open the official claim form and copy in the details you saved. Filing there is always free, and you send it yourself.',
          points: [
            'Copy-ready details from your profile',
            'The official form opens in a new tab',
            'No fee to file on the official site',
          ],
          illustration: 'file',
        },
  ];
}

/** Public marketing home; catalog reads use the cookie-free client. */
export const revalidate = 900;

const homeMeta = publicPageMetadata({
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  path: '/',
  ogTitle: `${SITE.name} — ${SITE.tagline}`,
});
export const metadata: Metadata = {
  ...homeMeta,
  // Skip the layout "%s · Lawsuit AI" template so the site name is not doubled.
  title: { absolute: `${SITE.name} — ${SITE.tagline}` },
};

async function loadHomeCatalog(): Promise<{
  lawsuits: Lawsuit[];
  openingSoon: Lawsuit[];
  failed: boolean;
}> {
  try {
    const result = await lookupLawsuits(
      flags.homeHtmlTrim() ? { columns: HOME_CATALOG_COLUMNS } : undefined,
    );
    if (result.error) return { lawsuits: [], openingSoon: [], failed: true };
    return { lawsuits: result.lawsuits, openingSoon: result.openingSoon ?? [], failed: false };
  } catch {
    return { lawsuits: [], openingSoon: [], failed: true };
  }
}

export default async function HomePage() {
  const catalog = await loadHomeCatalog();
  const trim = flags.homeHtmlTrim();
  const closing = { rows: pickClosingSoon(catalog.lawsuits, 5), failed: catalog.failed };
  const closingIds = new Set(closing.rows.map((row) => row.id));
  const top = catalog.failed
    ? []
    : pickTopPayouts(catalog.lawsuits.filter((row) => !closingIds.has(row.id)), 5);
  const closingCards = trim ? slimHomeCards(closing.rows) : closing.rows;
  const topCards = trim ? slimHomeCards(top) : top;
  const openingSoonCards = trim
    ? slimHomeCards(catalog.openingSoon.slice(0, 3))
    : catalog.openingSoon.slice(0, 3);
  const wedges = homeWedgesEnabled() ? homeWedgeAvailability(catalog.lawsuits) : null;
  const disclose = flags.feeDisclosure();
  const mayFile = lawsuitAiMayFile();
  const easySubmitIds = await oneClickLawsuitIdSet();
  const noticeChecked = Object.fromEntries(
    [...topCards, ...closingCards, ...openingSoonCards].map((row) => [
      row.slug,
      noticeCheckedOnLabel(row.slug),
    ]),
  );
  const accountFirst = flags.homeAccountFirstCta();
  const stats = !catalog.failed && catalog.lawsuits.length > 0 ? homeStats(catalog.lawsuits) : null;
  const payout = !catalog.failed && catalog.lawsuits.length > 0 ? payoutStats(catalog.lawsuits) : null;
  const proof = catalogProofStats(stats, payout);

  const freeLabel = disclose ? 'Official filing stays free' : 'Free during beta';
  const fileLine = mayFile ? 'Easy submit on eligible claims' : 'File on the official site';
  const browse = { href: '/lawsuits', label: 'See open settlements' };
  const account = { href: '/signup', label: 'Create a free account' };
  const primary = accountFirst ? account : browse;
  const secondary = accountFirst ? browse : account;
  const heroPrimary = { href: '/preview', label: HOME_HERO_PRIMARY_CTA };
  const heroPayout = stats ? payoutFigures(catalog.lawsuits, stats) : null;

  return (
    <>
      <CaptureView event="landing_viewed" />

      <HomeHero
        primary={heroPrimary}
        browse={browse}
        freeLabel={freeLabel}
        fileLine={fileLine}
        browseNote={`${BROWSE_NO_ACCOUNT} ${accountGateWhy(mayFile, disclose)}`}
        priceLine={homeHeroPriceLine(mayFile)}
        payout={heroPayout}
        stats={stats}
        desktop={SCREENS.catalogDesktop}
        phone={SCREENS.dashboard}
        mobile={SCREENS.catalog}
      />

      <HowItWorks
        steps={howSteps(mayFile)}
        caption="Matching is free. Lawsuit AI is a claim assistant, not a law firm. Every listing links to its official administrator site when we have that URL."
      />

      <HomeCatalogProof stats={proof} />

      {trim ? (
        <HomeTrimCatalog
          top={topCards}
          closing={closingCards}
          closingFailed={catalog.failed}
          openingSoon={openingSoonCards}
          easySubmitIds={[...easySubmitIds]}
          closesInChips={flags.closesInChips()}
          claimActionCtas={flags.claimActionCtas()}
          verifiedFields={flags.verifiedFields()}
          catalogHideUnknowns={flags.catalogHideUnknowns()}
          noticeChecked={noticeChecked}
        />
      ) : (
        <>
          {top.length > 0 && (
            <section className="section-y bg-brand-50" aria-labelledby="top-heading">
              <div className="container-page">
                <div
                  className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
                  data-reveal
                >
                  <div>
                    <p className="eyebrow">Top open settlements</p>
                    <h2 id="top-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                      Biggest payouts still open
                    </h2>
                    <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                      Open settlements with the highest payout each listing states. Actual payments
                      depend on the settlement, so check the official notice. Lawsuit AI is not
                      affiliated with the settlements listed here or their administrators.
                    </p>
                  </div>
                  <Link href="/lawsuits" className="btn-secondary shrink-0">
                    See all settlements <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
                <div className="mt-8">
                  <HomeSettlementList
                    lawsuits={topCards}
                    easySubmitIds={easySubmitIds}
                    noticeChecked={noticeChecked}
                  />
                </div>
              </div>
            </section>
          )}

          <section className="section-y bg-white" aria-labelledby="open-heading">
            <div className="container-page">
              <div
                className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
                data-reveal
              >
                <div>
                  <p className="eyebrow">Closing soon</p>
                  <h2 id="open-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                    Open settlements
                  </h2>
                  <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                    Nearest deadlines first. Payout amounts and deadlines as the listing states them.
                    Lawsuit AI is not affiliated with the settlements listed here or their
                    administrators.
                  </p>
                </div>
                <Link href="/lawsuits" className="btn-secondary shrink-0">
                  See all settlements <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              {closing.failed ? (
                <div
                  role="alert"
                  className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
                >
                  <AlertCircle className="h-8 w-8 text-danger-700" aria-hidden />
                  <p className="mt-3 font-semibold text-ink">
                    We couldn’t load settlements right now.
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">Please try again in a moment.</p>
                  <Link href="/lawsuits" className="btn-secondary mt-6">
                    Go to all settlements
                  </Link>
                </div>
              ) : closing.rows.length === 0 ? (
                <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                  <p className="font-semibold text-ink">No deadlines coming up right now.</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    New settlements open all the time. See everything that is open today.
                  </p>
                  <Link href="/lawsuits" className="btn-secondary mt-6">
                    Browse open settlements
                  </Link>
                </div>
              ) : (
                <div className="mt-6">
                  <HomeSettlementList
                    lawsuits={closingCards}
                    easySubmitIds={easySubmitIds}
                    noticeChecked={noticeChecked}
                  />
                </div>
              )}
            </div>
          </section>

          {catalog.openingSoon.length > 0 && (
            <section className="section-y bg-white" aria-labelledby="opening-soon-home-heading">
              <div className="container-page">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between" data-reveal>
                  <div>
                    <p className="eyebrow">Not taking claims yet</p>
                    <h2 id="opening-soon-home-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
                      Opening soon
                    </h2>
                    <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
                      These listings are published but not open for claims on Lawsuit AI yet.
                    </p>
                  </div>
                  <Link href="/lawsuits?openingSoon=1" className="btn-secondary shrink-0">
                    See opening soon <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
                <div className="mt-8">
                  <HomeSettlementList
                    lawsuits={openingSoonCards}
                    easySubmitIds={easySubmitIds}
                    noticeChecked={noticeChecked}
                  />
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {wedges && (wedges.showBreachPrivacy || wedges.showNoProof) && (
        <HomeNarrowing
          showBreachPrivacy={wedges.showBreachPrivacy}
          showDataBreach={wedges.showDataBreach}
          showPrivacy={wedges.showPrivacy}
          showNoProof={wedges.showNoProof}
        />
      )}

      <HomeFeatures />

      <section className="section-y bg-white" aria-labelledby="public-trust-heading">
        <div className="container-page">
          <PublicTrustBlock />
        </div>
      </section>

      <HomeTrust />

      <Testimonials />

      <HomeFaq />

      <HomeFinalCta
        primary={primary}
        secondary={secondary}
        openCount={stats?.open ?? null}
        costLine={disclose ? OFFICIAL_FILING_IS_FREE : `${publicBetaFeeCopy()} ${OFFICIAL_FILING_IS_FREE}`}
      />
    </>
  );
}

/** Combine payout figures with the same live counts used by the stats strip and final CTA. */
function payoutFigures(lawsuits: readonly Lawsuit[], counts: HomeStats): HeroPayout {
  const stats = payoutStats(lawsuits);
  return {
    median: stats.medianPayout,
    max: stats.topPayout?.amount ?? null,
    maxTitle: stats.topPayout?.title ?? null,
    maxSlug: stats.topPayout?.slug ?? null,
    openCount: counts.open,
    statedCount: stats.withStatedPayout,
    closingCount: counts.closingSoon,
  };
}
