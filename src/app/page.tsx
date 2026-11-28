import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import type { Lawsuit } from '@/lib/types';
import { lookupLawsuits } from '@/lib/lawsuits';
import { HOME_CATALOG_COLUMNS, slimHomeCards } from '@/lib/home-catalog';
import { pickClosingSoon } from '@/lib/closing-soon';
import { homeStats } from '@/lib/home-stats';
import { payoutStats } from '@/lib/payout-stats';
import {
  FILE_OR_EASY_SUBMIT,
  HOME_HERO_PRIMARY_CTA,
  NO_SSN_OR_BANK_TO_MATCH,
  OFFICIAL_FILING_IS_FREE,
  OPERATOR_LEGAL_NAME,
  feeEveryClaimCopy,
  filingFact,
  lawsuitAiMayFile,
  operatorLine,
  publicBetaFeeCopy,
} from '@/lib/copy';
import { HomeHero } from '@/components/home/HomeHero';
import type { HowStep } from '@/components/home/how-it-works-types';
import {
  catalogProofStats,
  HomeCatalogProof,
} from '@/components/home/HomeCatalogProof';
import { homeFaqItems } from '@/components/home/HomeFaq';
import type { Screen } from '@/components/home/DeviceFrame';
import { CaptureView } from '@/components/analytics/CaptureView';
import { flags } from '@/lib/flags';
import { oneClickLawsuitIdSet } from '@/lib/one-click-listings';
import { noticeCheckedOnLabel } from '@/lib/settlement-guides';
import { faqJsonLd } from '@/lib/settlement-seo';
import { publicPageMetadata } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

const HowItWorks = dynamic(() => import('@/components/home/HowItWorks').then((m) => m.HowItWorks), {
  ssr: true,
});
const HomeBrowseTeaser = dynamic(
  () => import('@/components/home/HomeBrowseTeaser').then((m) => m.HomeBrowseTeaser),
  { ssr: true },
);
const HomeSimplifyBelow = dynamic(
  () => import('@/components/home/HomeSimplifyBelow').then((m) => m.HomeSimplifyBelow),
  { ssr: true },
);
const Testimonials = dynamic(
  () => import('@/components/home/Testimonials').then((m) => m.Testimonials),
  { ssr: true },
);

/** Hero product shots only (above/near fold). */
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
} satisfies Record<string, Screen>;

const BROWSE_TEASER_LIMIT = 6;

/** Closing-soon first, then fill from remaining open rows up to the teaser limit. */
function pickBrowseTeaser(rows: readonly Lawsuit[], limit = BROWSE_TEASER_LIMIT): Lawsuit[] {
  const closing = pickClosingSoon(rows, limit);
  if (closing.length >= limit) return closing;
  const taken = new Set(closing.map((row) => row.id));
  const rest = rows.filter((row) => !taken.has(row.id)).slice(0, limit - closing.length);
  return [...closing, ...rest];
}

function howSteps(mayFile: boolean): HowStep[] {
  return [
    {
      title: 'Answer a few questions',
      body: 'State and simple yes/no answers — never your SSN or bank details.',
      points: [],
      illustration: 'questions',
    },
    {
      title: 'See matched settlements',
      body: 'Open listings that may fit, each with its official administrator link.',
      points: [],
      illustration: 'matches',
    },
    mayFile
      ? {
          title: 'File with Easy submit or our guide',
          body: `${FILE_OR_EASY_SUBMIT} Filing on the official site is always free.`,
          points: [],
          illustration: 'file',
        }
      : {
          title: 'File with our guide',
          body: 'Open the official form, copy in your saved details, and send it yourself — free.',
          points: [],
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

async function loadHomeCatalog(): Promise<{ lawsuits: Lawsuit[]; failed: boolean }> {
  try {
    // Always request the slim column set — home cards never render long text fields.
    const result = await lookupLawsuits({ columns: HOME_CATALOG_COLUMNS });
    if (result.error) return { lawsuits: [], failed: true };
    return { lawsuits: result.lawsuits, failed: false };
  } catch {
    return { lawsuits: [], failed: true };
  }
}

export default async function HomePage() {
  const catalog = await loadHomeCatalog();
  const teaserRows = catalog.failed ? [] : pickBrowseTeaser(catalog.lawsuits, BROWSE_TEASER_LIMIT);
  const teaserCards = slimHomeCards(teaserRows);
  const disclose = flags.feeDisclosure();
  const mayFile = lawsuitAiMayFile();
  const easySubmitIds = await oneClickLawsuitIdSet();
  const noticeChecked = Object.fromEntries(
    teaserCards.map((row) => [row.slug, noticeCheckedOnLabel(row.slug)]),
  );
  const accountFirst = flags.homeAccountFirstCta();
  const stats = !catalog.failed && catalog.lawsuits.length > 0 ? homeStats(catalog.lawsuits) : null;
  const payout = !catalog.failed && catalog.lawsuits.length > 0 ? payoutStats(catalog.lawsuits) : null;
  const proof = catalogProofStats(stats, payout);

  const browse = { href: '/lawsuits', label: 'See open settlements' };
  const account = { href: '/signup', label: 'Create a free account' };
  const primary = accountFirst ? account : browse;
  const secondary = accountFirst ? browse : account;
  const heroPrimary = { href: '/preview', label: HOME_HERO_PRIMARY_CTA };

  const filing = filingFact();
  const trustFacts = [
    { icon: 'file' as const, title: filing.title, body: filing.body },
    {
      icon: 'who' as const,
      title: 'Who we are',
      body: `${operatorLine(OPERATOR_LEGAL_NAME)} Lawsuit AI is a claim assistant, not a law firm, and does not give legal advice.`,
    },
    {
      icon: 'payout' as const,
      title: 'We never touch your payout',
      body: 'If a claim is paid, the settlement administrator pays you directly. The money never passes through Lawsuit AI.',
    },
    {
      icon: 'private' as const,
      title: 'Matching stays private',
      body: NO_SSN_OR_BANK_TO_MATCH,
    },
  ];
  const faqItems = homeFaqItems();
  const moneyPoints = disclose
    ? [
        'You can still file on the official administrator’s site yourself. Official filing there stays free.',
        feeEveryClaimCopy(),
        'We don’t sell your personal information.',
      ]
    : [
        'Filing on the official administrator’s site is always free. You never need Lawsuit AI to file.',
        publicBetaFeeCopy(),
        'We don’t sell your personal information.',
      ];

  return (
    <>
      <CaptureView event="landing_viewed" />

      <HomeHero
        primary={heroPrimary}
        browse={browse}
        stats={stats}
        desktop={SCREENS.catalogDesktop}
        mobile={SCREENS.catalog}
      />

      <HowItWorks
        steps={howSteps(mayFile)}
        caption="Matching is free. Lawsuit AI is a claim assistant, not a law firm. Every listing links to its official administrator site when we have that URL."
      />

      <HomeCatalogProof stats={proof} />

      <HomeBrowseTeaser
        cards={teaserCards}
        failed={catalog.failed}
        easySubmitIds={[...easySubmitIds]}
        closesInChips={flags.closesInChips()}
        claimActionCtas={flags.claimActionCtas()}
        verifiedFields={flags.verifiedFields()}
        catalogHideUnknowns={flags.catalogHideUnknowns()}
        noticeChecked={noticeChecked}
      />

      <Testimonials />

      <HomeSimplifyBelow
        trustFacts={trustFacts}
        moneyPoints={moneyPoints}
        faqItems={faqItems}
        faqLd={faqJsonLd(faqItems)}
        finalCta={{
          primary,
          secondary,
          openCount: stats?.open ?? null,
          costLine: disclose ? OFFICIAL_FILING_IS_FREE : `${publicBetaFeeCopy()} ${OFFICIAL_FILING_IS_FREE}`,
        }}
      />
    </>
  );
}
