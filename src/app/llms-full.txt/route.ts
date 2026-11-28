import { flags } from '@/lib/flags';
import { getLawsuits } from '@/lib/lawsuits';
import { renderLlmsFullTxt } from '@/lib/llms-txt';

export const revalidate = 3600;

/**
 * /llms-full.txt — every open, non-thin settlement with its answer facts
 * (deadline, listed payout, proof, who qualifies, official site). Same flag
 * as /llms.txt (LLMS_TXT_ENABLED=1); off → 404. A catalog read failure is a
 * 503 so crawlers retry instead of caching an empty list.
 */
export async function GET() {
  if (!flags.llmsTxt()) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  try {
    const lawsuits = await getLawsuits();
    return new Response(renderLlmsFullTxt(lawsuits), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.warn('[llms-full.txt] catalog read failed', err);
    return new Response('Catalog temporarily unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' },
    });
  }
}
