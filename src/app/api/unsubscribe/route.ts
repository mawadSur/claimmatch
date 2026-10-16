import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, ipKey } from '@/lib/ratelimit';
import {
  TOKEN_PARAM,
  emailMatchCandidates,
  pageLocationForGet,
  parseUnsubscribeToken,
  unsubscribeBackendProblem,
  unsubscribeResultPath,
} from '@/lib/unsubscribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unsubscribe endpoint (see @/lib/unsubscribe for the whole flow).
 *
 * GET changes nothing. Mail scanners and link previews open links in emails,
 * so a GET only redirects to the /unsubscribe confirm page.
 *
 * POST is the confirm button on that page: a plain form post that works
 * without JavaScript. It turns off profiles.email_opt_in for the token's
 * address and redirects (303) back to the page with the outcome.
 *
 * Never log the token, the address, or a URL or error that might contain them.
 */

/** Per-IP attempts allowed per minute. */
const POST_LIMIT = 10;

function redirectTo(req: Request, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.url), { status: 303 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get(TOKEN_PARAM);
  return redirectTo(req, pageLocationForGet(raw));
}

export async function POST(req: Request) {
  let fromBody: FormDataEntryValue | null = null;
  try {
    fromBody = (await req.formData()).get(TOKEN_PARAM);
  } catch {
    // Not a form post; the token may still be in the query string.
  }
  const raw = typeof fromBody === 'string' ? fromBody : new URL(req.url).searchParams.get(TOKEN_PARAM);

  const parsed = parseUnsubscribeToken(raw);
  if (!parsed.ok) return redirectTo(req, unsubscribeResultPath('invalid'));
  const { email } = parsed;

  if (!rateLimit(`unsubscribe:${ipKey(req)}`, { limit: POST_LIMIT, windowMs: 60_000 }).ok) {
    return redirectTo(req, unsubscribeResultPath('busy', email));
  }

  const problem = unsubscribeBackendProblem(process.env);
  if (problem) {
    console.error(`[unsubscribe] cannot save opt-outs: ${problem}`);
    return redirectTo(req, unsubscribeResultPath('failed', email));
  }

  try {
    const { error } = await createServiceClient()
      .from('profiles')
      .update({ email_opt_in: false })
      .in('email', emailMatchCandidates(email))
      .select('id');
    if (error) {
      // The code only: messages and details can quote the filter, which holds the address.
      console.error(`[unsubscribe] update failed (code ${error.code ?? 'unknown'})`);
      return redirectTo(req, unsubscribeResultPath('failed', email));
    }
  } catch (err) {
    console.error(`[unsubscribe] update threw (${err instanceof Error ? err.name : 'unknown'})`);
    return redirectTo(req, unsubscribeResultPath('failed', email));
  }

  // Same answer whether or not an account uses this address, so the page never
  // reveals who has one. Either way, no match or digest email goes to it.
  return redirectTo(req, unsubscribeResultPath('done'));
}
