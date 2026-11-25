import type { Metadata } from 'next';
import { categoriesOf, lookupLawsuits } from '@/lib/lawsuits';
import { hubClosingThisMonth } from '@/lib/settlement-hubs';
import {
  breadcrumbJsonLd,
  CLOSING_THIS_MONTH_PATH,
  collectionJsonLd,
  pageUrl,
  settlementPath,
} from '@/lib/settlement-seo';
import { flags } from '@/lib/flags';
import { relatedSettlements } from '@/lib/related-settlements';
import { HubChrome } from '@/components/settlement/HubChrome';
import { JsonLd } from '@/components/settlement/JsonLd';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

export const revalidate = 3600;
export const dynamic = 'force-static';

const TITLE = 'Settlements closing this month';
const DESCRIPTION =
  'Open class-action settlements whose listed claim deadline falls in this calendar month. Check who qualifies on the official notice and file there for free.';

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await lookupLawsuits();
  const lawsuits = hubClosingThisMonth(catalog.lawsuits);
  const url = pageUrl(CLOSING_THIS_MONTH_PATH);
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: url },
    robots: lawsuits.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url,
      siteName: SITE.name,
      type: 'website',
      images: [SITE_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [SITE_OG_IMAGE.url] },
  };
}

export default async function ClosingThisMonthHubPage() {
  const catalog = await lookupLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const lawsuits = hubClosingThisMonth(catalog.lawsuits);
  const categories = categoriesOf(catalog.lawsuits);
  const listed = new Set(lawsuits.map((row) => row.slug));
  const related = flags.relatedSettlements()
    ? relatedSettlements({ slug: 'hub-closing-this-month', category: '' }, catalog.lawsuits)
        .filter((item) => !listed.has(item.slug))
    : [];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open settlements', path: '/lawsuits' },
          { name: TITLE, path: CLOSING_THIS_MONTH_PATH },
        ])}
      />
      <JsonLd
        data={collectionJsonLd({
          name: TITLE,
          description: DESCRIPTION,
          path: CLOSING_THIS_MONTH_PATH,
          items: lawsuits.map((l) => ({ name: l.title, path: settlementPath(l.slug) })),
        })}
      />
      <HubChrome
        title={TITLE}
        lede="Open settlements whose listed claim deadline falls in this calendar month (US Eastern). Deadlines often end at 11:59 pm in the settlement’s time zone — check the official site for the exact cutoff."
        current="closing-this-month"
        categories={categories}
        lawsuits={lawsuits}
        emptyTitle="No listed deadlines this month"
        emptyBody="Nothing open has a listed claim deadline in this calendar month. Browse settlements closing soon, or every open settlement."
        related={related}
        relatedFromSlug="hub-closing-this-month"
      />
    </>
  );
}
