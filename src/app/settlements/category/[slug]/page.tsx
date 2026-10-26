import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { categoriesOf, lookupLawsuits } from '@/lib/lawsuits';
import { LAWSUIT_CATEGORIES } from '@/lib/types';
import {
  breadcrumbJsonLd,
  categoryHubPath,
  categorySlug,
  collectionJsonLd,
  lawsuitsInCategory,
  pageUrl,
  resolveCategoryName,
  SETTLEMENT_REVALIDATE_SECONDS,
  settlementPath,
} from '@/lib/settlement-seo';
import { HubChrome } from '@/components/settlement/HubChrome';
import { JsonLd } from '@/components/settlement/JsonLd';
import { SITE } from '@/lib/utils';

export const revalidate = SETTLEMENT_REVALIDATE_SECONDS;
export const dynamic = 'force-static';

type Params = { params: Promise<{ slug: string }> };

function categoryCopy(category: string) {
  const title = `${category} settlements`;
  const description = `Open ${category.toLowerCase()} class-action settlements taking claims now. See who may qualify, the claim deadline, and the official claim site.`;
  return { title, description };
}

export async function generateStaticParams() {
  const catalog = await lookupLawsuits();
  const live = categoriesOf(catalog.lawsuits);
  const slugs = new Set<string>([
    ...LAWSUIT_CATEGORIES.map((c) => categorySlug(c)),
    ...live.map((c) => categorySlug(c)),
  ]);
  return Array.from(slugs).filter(Boolean).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await lookupLawsuits();
  const category = resolveCategoryName(slug, categoriesOf(catalog.lawsuits));
  if (!category) {
    return { title: 'Settlements', robots: { index: false, follow: false } };
  }
  const { title, description } = categoryCopy(category);
  const url = pageUrl(categoryHubPath(category));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${SITE.name}`,
      description,
      url,
      siteName: SITE.name,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoryHubPage({ params }: Params) {
  const { slug } = await params;
  const catalog = await lookupLawsuits();
  if (catalog.error) throw new Error('Settlement catalog lookup failed');
  const liveCategories = categoriesOf(catalog.lawsuits);
  const category = resolveCategoryName(slug, liveCategories);
  if (!category) notFound();

  const lawsuits = lawsuitsInCategory(catalog.lawsuits, category);
  const { title, description } = categoryCopy(category);
  const path = categoryHubPath(category);

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open settlements', path: '/lawsuits' },
          { name: title, path },
        ])}
      />
      <JsonLd
        data={collectionJsonLd({
          name: title,
          description,
          path,
          items: lawsuits.map((l) => ({ name: l.title, path: settlementPath(l.slug) })),
        })}
      />
      <HubChrome
        title={title}
        lede={`Open ${category.toLowerCase()} settlements that are taking claims now. Check who qualifies on the official notice, then file there for free.`}
        current={category}
        categories={liveCategories}
        lawsuits={lawsuits}
        emptyTitle={`No open ${category.toLowerCase()} settlements right now`}
        emptyBody="Nothing in this category is taking claims today. Browse every open settlement, or see what is closing soon."
      />
    </>
  );
}
