import type { Metadata } from 'next';
import { SITE, canonicalUrl } from '@/lib/utils';

/** Site-wide Open Graph image (app/opengraph-image.tsx). */
export const SITE_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'ClaimMatch — find open class-action settlements',
} as const;

export function settlementOgImagePath(slug: string): string {
  return `/lawsuits/${slug}/opengraph-image`;
}

/** Public-page metadata: self-canonical on lawsuitai.org and a share image. */
export function publicPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  ogTitle?: string;
}): Metadata {
  const url = canonicalUrl(opts.path);
  const ogTitle = opts.ogTitle ?? opts.title;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: ogTitle,
      description: opts.description,
      url,
      siteName: SITE.name,
      type: 'website',
      images: [SITE_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: opts.description,
      images: [SITE_OG_IMAGE.url],
    },
  };
}
