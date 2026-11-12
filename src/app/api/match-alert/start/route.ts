import { NextResponse } from 'next/server';
import {
  MATCH_ALERT_TOKEN_PARAM,
  consumeMatchAlertToken,
  matchAlertStartFailurePath,
} from '@/lib/match-alert-start';
import { MATCH_ALERT_START_PATH } from '@/lib/match-alert-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectTo(req: Request, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.url), { status: 303 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** GET changes nothing (mail scanners). Send the reader to the confirm page. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get(MATCH_ALERT_TOKEN_PARAM);
  const dest = raw
    ? `${MATCH_ALERT_START_PATH}?${MATCH_ALERT_TOKEN_PARAM}=${encodeURIComponent(raw)}`
    : MATCH_ALERT_START_PATH;
  return redirectTo(req, dest);
}

export async function POST(req: Request) {
  let fromBody: FormDataEntryValue | null = null;
  try {
    fromBody = (await req.formData()).get(MATCH_ALERT_TOKEN_PARAM);
  } catch {
    // Token may still be in the query string.
  }
  const raw =
    typeof fromBody === 'string' ? fromBody : new URL(req.url).searchParams.get(MATCH_ALERT_TOKEN_PARAM);

  const result = await consumeMatchAlertToken({ token: raw, req });
  if (!result.ok) return redirectTo(req, matchAlertStartFailurePath(result.error));
  return redirectTo(req, result.path);
}
