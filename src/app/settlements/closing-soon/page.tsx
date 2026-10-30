import type { Metadata } from 'next';
import { categoriesOf, lookupLawsuits } from '@/lib/lawsuits';
import { hubClosingSoon } from '@/lib/settlement-hubs';
import {
  breadcrumbJsonLd,
  CLOSING_SOON_PATH,
  collectionJsonLd,
  pageUrl,
  settlementPath,
} from '@/lib/settlement-seo';
import { HubChrome } from '@/components/settlement/HubChrome';
import { JsonLd } from '@/components/settlement/JsonLd';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

export const revalidate = 3600;
export const dynamic = 'force-static';

const TITLE = 'Settlements closing soon';
const DESCRIPTION =
  'Open class-action settlements with the nearest claim deadlines. Check who qualifies on the official notice and file there for free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: pageUrl(CLOSING_SOON_PATH) },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: pageUrl(CLOSING_SOON_PATH),
    siteName: SITE.name,
    type: 'website',
    images: [SITE_OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [SITE_OG_IMAGE.url] },
};

export default async function ClosingSoonHubPage() {
  const catalog = await lookupLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const lawsuits = hubClosingSoon(catalog.lawsuits);
  const categories = categoriesOf(catalog.lawsuits);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open settlements', path: '/lawsuits' },
          { name: TITLE, path: CLOSING_SOON_PATH },
        ])}
      />
      <JsonLd
        data={collectionJsonLd({
          name: TITLE,
          description: DESCRIPTION,
          path: CLOSING_SOON_PATH,
          items: lawsuits.map((l) => ({ name: l.title, path: settlementPath(l.slug) })),
        })}
      />
      <HubChrome
        title={TITLE}
        lede="Open settlements with the nearest claim deadlines. Deadlines often end at 11:59 pm in the settlement’s time zone — check the official site for the exact cutoff."
        current="closing-soon"
        categories={categories}
        lawsuits={lawsuits}
        emptyTitle="No upcoming deadlines in the catalog"
        emptyBody="Nothing open has a listed deadline right now. Browse every open settlement, or check new listings."
      />
    </>
  );
}
