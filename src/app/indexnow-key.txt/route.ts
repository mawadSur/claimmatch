import { flags } from '@/lib/flags';
import { indexNowKey } from '@/lib/indexnow';

export const dynamic = 'force-dynamic';

/** IndexNow key file. Only served when the flag is on and a valid key is set. */
export function GET() {
  const key = indexNowKey();
  if (!flags.indexNow() || !key) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(key, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
