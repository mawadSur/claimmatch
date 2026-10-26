import { SITE } from '@/lib/utils';
import { CLOSING_SOON_PATH, NEW_SETTLEMENTS_PATH, pageUrl } from '@/lib/settlement-seo';

export const dynamic = 'force-static';
export const revalidate = 3600;

/**
 * /llms.txt — short machine-readable summary (llmstxt.org).
 * Google ignores this file; other tools may read it.
 */
export function GET() {
  const body = `# ClaimMatch

> US class-action settlement finder. ClaimMatch lists open settlements, links the official claim form, and helps you keep track. You review and submit every claim yourself on the administrator’s site. Filing there is always free.

ClaimMatch is a free claim assistant, not a law firm, and is not the settlement administrator.

## Hubs

- [Open settlements](${pageUrl('/lawsuits')})
- [Settlements closing soon](${pageUrl(CLOSING_SOON_PATH)})
- [New settlements](${pageUrl(NEW_SETTLEMENTS_PATH)})
- [Data breach settlements](${pageUrl('/settlements/category/data-breach')})
- [Consumer product settlements](${pageUrl('/settlements/category/consumer-products')})
- [Privacy settlements](${pageUrl('/settlements/category/privacy')})
- [Financial & banking settlements](${pageUrl('/settlements/category/financial-banking')})

## Other pages

- [How it works](${pageUrl('/how-it-works')})
- [Is ClaimMatch legit?](${pageUrl('/trust')})
- [About](${pageUrl('/about')})
- [Pricing](${pageUrl('/pricing')})

## Data source

Settlement catalog data includes [SettleSignal](https://settlesignal.com/data/), CC BY 4.0. Listings are unverified — check the official notice before you file.

## Contact

Contact details are configured via environment variables and shown on /terms and /privacy when provided.

Site: ${SITE.url}
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
