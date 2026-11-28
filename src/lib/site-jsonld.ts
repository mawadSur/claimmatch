/**
 * Site-wide Organization + WebSite JSON-LD, rendered once in the root layout.
 *
 * - Organization uses the 180×180 apple icon as its logo (Google wants a
 *   square-ish logo; the 1200×630 OG card stays as `image`).
 * - legalName is the operator already disclosed on /terms and /about.
 * - WebSite carries a SearchAction for the public catalog search
 *   (/lawsuits?q=…), which already reads the `q` parameter.
 * - Stable @id values let page-level nodes (Article publisher, etc.) point at
 *   the same entity instead of repeating it.
 */
import { OPERATOR_LEGAL_NAME } from './copy';
import { SITE } from './utils';

function origin(): string {
  return SITE.url.replace(/\/$/, '');
}

export function organizationId(): string {
  return `${origin()}/#organization`;
}

export function websiteId(): string {
  return `${origin()}/#website`;
}

export function organizationNode() {
  const base = origin();
  return {
    '@type': 'Organization',
    '@id': organizationId(),
    name: SITE.name,
    legalName: OPERATOR_LEGAL_NAME,
    url: base,
    logo: {
      '@type': 'ImageObject',
      url: `${base}/apple-icon`,
      width: 180,
      height: 180,
    },
    image: `${base}/opengraph-image`,
    description: SITE.description,
  };
}

export function websiteNode() {
  const base = origin();
  return {
    '@type': 'WebSite',
    '@id': websiteId(),
    name: SITE.name,
    url: base,
    description: SITE.description,
    inLanguage: 'en-US',
    publisher: { '@id': organizationId() },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/lawsuits?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationNode(), websiteNode()] as const,
  };
}
