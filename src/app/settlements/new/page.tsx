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
import { flags } from '@/lib/flags';
import { relatedSettlements } from '@/lib/related-settlements';
import { HubChrome } from '@/components/settlement/HubChrome';
import { JsonLd } from '@/components/settlement/JsonLd';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { SITE } from '@/lib/utils';
import {
  LAWSUITS_PAGE_SIZE,
  paginateCatalog,
  paginatedPath,
  parsePage,
} from '@/lib/catalog-page';

export const revalidate = 3600;

const TITLE = 'New settlements';
const DESCRIPTION =
  'The newest open class-action settlements in the Lawsuit AI catalog. Check who qualifies on the official notice and file there for free.';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = parsePage(firstParam(params.page));
  const canonical = paginatedPath(NEW_SETTLEMENTS_PATH, page);
  const title = page > 1 ? `${TITLE} (page ${page})` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: pageUrl(canonical) },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: pageUrl(canonical),
      siteName: SITE.name,
      type: 'website',
      images: [SITE_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description: DESCRIPTION, images: [SITE_OG_IMAGE.url] },
  };
}

export default async function NewSettlementsHubPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = parsePage(firstParam(params.page));
  const catalog = await lookupLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const lawsuits = hubNewest(catalog.lawsuits);
  const paged = paginateCatalog(lawsuits, page, true, LAWSUITS_PAGE_SIZE);
  const categories = categoriesOf(catalog.lawsuits);
  const listed = new Set(paged.items.map((row) => row.slug));
  const related = flags.relatedSettlements()
    ? relatedSettlements({ slug: 'hub-new', category: '' }, catalog.lawsuits)
        .filter((item) => !listed.has(item.slug))
    : [];
  const prevHref = paged.page > 1 ? paginatedPath(NEW_SETTLEMENTS_PATH, paged.page - 1) : null;
  const nextHref =
    paged.page < paged.totalPages ? paginatedPath(NEW_SETTLEMENTS_PATH, paged.page + 1) : null;

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
          path: paginatedPath(NEW_SETTLEMENTS_PATH, paged.page),
          items: paged.items.map((l) => ({ name: l.title, path: settlementPath(l.slug) })),
        })}
      />
      <HubChrome
        title={TITLE}
        lede="Open settlements added to the catalog most recently. Listings are unverified — confirm every detail on the official site before you file."
        current="new"
        categories={categories}
        lawsuits={paged.items}
        emptyTitle="No new open settlements to show"
        emptyBody="The catalog has no open listings right now. Check back soon, or browse by category when cases appear."
        related={related}
        relatedFromSlug="hub-new"
        pagination={{
          page: paged.page,
          totalPages: paged.totalPages,
          total: paged.total,
          prevHref,
          nextHref,
        }}
      />
    </>
  );
}
