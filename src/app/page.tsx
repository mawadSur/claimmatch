import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import type { Lawsuit } from '@/lib/types';
import { lookupLawsuits } from '@/lib/lawsuits';
import { HOME_CATALOG_COLUMNS, slimHomeCards } from '@/lib/home-catalog';
import { pickClosingSoon } from '@/lib/closing-soon';
import { pickTopPayouts } from '@/lib/top-payouts';
import { HomeFeatures } from '@/components/home/HomeFeatures';
import { homeStats } from '@/lib/home-stats';
import { payoutStats } from '@/lib/payout-stats';
import {
  BROWSE_NO_ACCOUNT,
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
import { HomeNarrowing } from '@/components/home/HomeNarrowing';
import { HomeSettlementList } from '@/components/home/HomeSettlementList';
import { HomeTrust } from '@/components/home/HomeTrust';
import { Testimonials } from '@/components/home/Testimonials';
import { HomeFaq } from '@/components/home/HomeFaq';
import { HomeFinalCta } from '@/components/home/HomeFinalCta';

const HowItWorks = dynamic(() => import('@/components/home/HowItWorks').then((m) => m.HowItWorks), {
  ssr: true,
});
const HomeTrimCatalog = dynamic(
  () => import('@/components/home/HomeTrimCatalog').then((m) => m.HomeTrimCatalog),
  { ssr: true },
);
import { PublicTrustBlock } from '@/components/PublicTrustBlock';
import type { Screen } from '@/components/home/DeviceFrame';
import { CaptureView } from '@/components/analytics/CaptureView';
import { flags } from '@/lib/flags';
import { homeWedgeAvailability, homeWedgesEnabled } from '@/lib/home-wedges';
import { oneClickLawsuitIdSet } from '@/lib/one-click-listings';
import { noticeCheckedOnLabel } from '@/lib/settlement-guides';
import { publicPageMetadata } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

/**
 * Real app screens (public/screens), captured from the app itself. The
 * settlements in them are real catalog listings; the signed-in account is a
 * sample, and the caption under "How it works" says so.
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
  settlement: {
    src: '/screens/settlement-mobile.webp',
    width: 780,
    height: 1688,
    alt: 'A settlement page on a phone: who qualifies, the listed payout, the deadline, and a link to the official claim site.',
  },
  claim: {
    src: '/screens/claim-mobile.webp',
    width: 780,
    height: 1688,
    alt: 'The claim page on a phone, with details from a sample profile ready to copy into the official claim form.',
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
      title: 'Find an open settlement',
      body: 'Browse settlements that are taking claims right now. Every listing shows the payout and the deadline as the source states them.',
      points: [
        'Search by company or filter by category',
        'Upcoming deadlines flagged',
        'Each listing links to its source',
      ],
      screen: SCREENS.catalog,
    },
    {
      title: 'Check who qualifies',
      body: 'Each settlement page sums up who qualifies, the payout, the deadline and whether you need proof, then links to the official notice so you can confirm it yourself.',
      points: [
        'Who qualifies, in plain words',
        'Proof needed, as the listing states it',
        'A link to the official notice when we have it',
      ],
      screen: SCREENS.settlement,
    },
    mayFile
      ? {
          title: 'Easy submit on supported settlements',
          body: 'You answer a few questions and e-sign — we submit it to the official claims site for you. You can always file on the official site yourself instead, where filing is free.',
          points: [
            'Easy submit: a few questions and an e-sign',
            'You can always file on the official site yourself',
            'No fee to file on the official site',
          ],
          screen: SCREENS.claim,
        }
      : {
          title: 'File on the official site',
          body: 'Open the official claim form and copy in the details you saved, like your name, address and email. Filing there is always free, and you send it yourself.',
          points: [
            'Copy-ready details from your profile (name, email, and phone or address if you added them)',
            'The official form opens in a new tab',
            'No fee to file on the official site',
          ],
          screen: SCREENS.claim,
        },
    {
      title: 'Keep track of every claim',
      body: 'Tell us when you have filed and save the confirmation number the official site gives you. Your claims and deadlines stay in one list.',
      points: [
        'Confirmation numbers in one place',
        'Claims grouped by what to do next',
        'Deadlines at a glance',
      ],
      screen: SCREENS.dashboard,
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
    // lookupLawsuits() applies the shared open-for-claims rule and reports a
    // failed query (getLawsuits() would turn it into "no settlements"); we
    // only order. not_open rows are excluded from lawsuits / home counts.
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
  // "Closing soon" always gets the nearest deadlines; the top-payout list picks
  // from the rest so no row shows twice and no urgent deadline is hidden.
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
  // Live counts only when the catalog really loaded; never a made-up number.
  const stats = !catalog.failed && catalog.lawsuits.length > 0 ? homeStats(catalog.lawsuits) : null;

  const freeLabel = disclose ? 'Official filing stays free' : 'Free during beta';
  const fileLine = mayFile ? 'Easy submit on eligible claims' : 'File on the official site';
  const browse = { href: '/lawsuits', label: 'See open settlements' };
  const account = { href: '/signup', label: 'Create a free account' };
  const primary = accountFirst ? account : browse;
  const secondary = accountFirst ? browse : account;
  // Above the fold there is one primary action: see which settlements fit you.
  // Browsing and how-it-works are text links inside the hero.
  const heroPrimary = { href: '/preview', label: HOME_HERO_PRIMARY_CTA };
  // Payout figures for the hero, counted from the same open rows the cards
  // below are drawn from. Null when the catalog did not load, so the hero
  // states no amount rather than an amount that is not true of the listings
  // beside it; a figure payoutStats could not compute comes through as null
  // and its line is not rendered. Changes as the catalog does, every load.
  const heroPayout: HeroPayout | null = payoutFigures(catalog);

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
        caption="Real screens from Lawsuit AI. The settlements shown are real catalog listings; the account details are a sample."
      />

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
                  depend on the settlement, so check the official notice.
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

/**
 * Hero figures from the open catalog. Returns null when the catalog failed or
 * is empty — the hero then shows no payout block at all — and leaves any
 * single figure null rather than substituting a stand-in. `closingCount`
 * counts real deadlines inside the next 30 days, which is what the hero's
 * line says; nothing here is averaged, rounded up or carried over a load.
 */
function payoutFigures(catalog: Awaited<ReturnType<typeof loadHomeCatalog>>): HeroPayout | null {
  if (catalog.failed || catalog.lawsuits.length === 0) return null;
  const stats = payoutStats(catalog.lawsuits);
  return {
    median: stats.medianPayout,
    max: stats.topPayout?.amount ?? null,
    maxTitle: stats.topPayout?.title ?? null,
    maxSlug: stats.topPayout?.slug ?? null,
    openCount: stats.open,
    closingCount: stats.closingSoon,
  };
}
