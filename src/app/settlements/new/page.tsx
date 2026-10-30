import type { Metadata } from 'next';
import { categoriesOf, lookupLawsuits } from '@/lib/lawsuits';
import { hubNewest } from '@/lib/settlement-hubs';
import {
  breadcrumbJsonLd,
  collectionJsonLd,
  NEW_SETTLEMENTS_PATH,
  pageUrl,
  settlementPath,
} from '@/lib/settlement-seo';
import { HubChrome } from '@/components/settlement/HubChrome';
import { JsonLd } from '@/components/settlement/JsonLd';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';

export const revalidate = 3600;
export const dynamic = 'force-static';

const TITLE = 'New settlements';
const DESCRIPTION =
  'The newest open class-action settlements in the ClaimMatch catalog. Check who qualifies on the official notice and file there for free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: pageUrl(NEW_SETTLEMENTS_PATH) },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: pageUrl(NEW_SETTLEMENTS_PATH),
    siteName: SITE.name,
    type: 'website',
    images: [SITE_OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [SITE_OG_IMAGE.url] },
};

export default async function NewSettlementsHubPage() {
  const catalog = await lookupLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const lawsuits = hubNewest(catalog.lawsuits);
  const categories = categoriesOf(catalog.lawsuits);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open settlements', path: '/lawsuits' },
          { name: TITLE, path: NEW_SETTLEMENTS_PATH },
        ])}
      />
      <JsonLd
        data={collectionJsonLd({
          name: TITLE,
          description: DESCRIPTION,
          path: NEW_SETTLEMENTS_PATH,
          items: lawsuits.map((l) => ({ name: l.title, path: settlementPath(l.slug) })),
        })}
      />
      <HubChrome
        title={TITLE}
        lede="Open settlements added to the catalog most recently. Listings are unverified — confirm every detail on the official site before you file."
        current="new"
        categories={categories}
        lawsuits={lawsuits}
        emptyTitle="No new open settlements to show"
        emptyBody="The catalog has no open listings right now. Check back soon, or browse by category when cases appear."
      />
    </>
  );
}
