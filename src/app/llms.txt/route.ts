import { flags } from '@/lib/flags';
import { getLawsuits } from '@/lib/lawsuits';
import { catalogHubLinks, fallbackLlmsTxt, renderLlmsTxt } from '@/lib/llms-txt';

export const revalidate = 3600;

/**
 * /llms.txt — short machine-readable summary (llmstxt.org).
 * Google ignores this file; other tools may read it.
 * Off (LLMS_TXT_ENABLED not exactly "1"): 404.
 */
export async function GET() {
  if (!flags.llmsTxt()) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  let body = fallbackLlmsTxt();
  try {
    const lawsuits = await getLawsuits();
    body = renderLlmsTxt({ categoryHubs: catalogHubLinks(lawsuits) });
  } catch (err) {
    console.warn('[llms.txt] catalog read failed; using fallback hubs', err);
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
