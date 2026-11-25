import type { Metadata } from 'next';
import { categoriesOf, lookupLawsuits } from '@/lib/lawsuits';
import { hubNoProofRequired } from '@/lib/settlement-hubs';
import {
  breadcrumbJsonLd,
  collectionJsonLd,
  NO_PROOF_PATH,
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

const TITLE = 'Settlements with no proof required';
const DESCRIPTION =
  'Open class-action settlements the catalog marks as no proof required. Confirm on the official notice before you file — we never invent a proof rule.';

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await lookupLawsuits();
  const lawsuits = hubNoProofRequired(catalog.lawsuits);
  const url = pageUrl(NO_PROOF_PATH);
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

export default async function NoProofRequiredHubPage() {
  const catalog = await lookupLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const lawsuits = hubNoProofRequired(catalog.lawsuits);
  const categories = categoriesOf(catalog.lawsuits);
  const listed = new Set(lawsuits.map((row) => row.slug));
  const related = flags.relatedSettlements()
    ? relatedSettlements({ slug: 'hub-no-proof', category: '' }, catalog.lawsuits)
        .filter((item) => !listed.has(item.slug))
    : [];

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open settlements', path: '/lawsuits' },
          { name: TITLE, path: NO_PROOF_PATH },
        ])}
      />
      <JsonLd
        data={collectionJsonLd({
          name: TITLE,
          description: DESCRIPTION,
          path: NO_PROOF_PATH,
          items: lawsuits.map((l) => ({ name: l.title, path: settlementPath(l.slug) })),
        })}
      />
      <HubChrome
        title={TITLE}
        lede="Open settlements the catalog marks as no proof required. Unknown and optional proof stay off this list. Confirm what the official notice asks for before you file."
        current="no-proof"
        categories={categories}
        lawsuits={lawsuits}
        emptyTitle="No open no-proof settlements right now"
        emptyBody="The catalog has no open settlements marked as no proof required. Browse every open settlement, or see what is closing soon."
        related={related}
        relatedFromSlug="hub-no-proof"
      />
    </>
  );
}
