import { NextResponse } from 'next/server';
import { applyFiledToken } from '@/lib/apply-filed';
import { FILED_PATH, FILED_TOKEN_PARAM } from '@/lib/filed-link';
import { flags } from '@/lib/flags';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectTo(req: Request, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.url), { status: 303 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** GET never mutates (mail scanners). Send the reader to the confirm page. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get(FILED_TOKEN_PARAM);
  const dest = token
    ? `${FILED_PATH}?${FILED_TOKEN_PARAM}=${encodeURIComponent(token)}`
    : FILED_PATH;
  return redirectTo(req, dest);
}

/** POST is the confirm button. Marks the claim reported_filed. */
export async function POST(req: Request) {
  if (!flags.didYouFileEmail()) return redirectTo(req, FILED_PATH);
  const limit = rateLimit(`filed:${ipKey(req)}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) {
    return redirectTo(req, `${FILED_PATH}?notice=busy`);
  }
  let raw: FormDataEntryValue | null = null;
  try {
    raw = (await req.formData()).get(FILED_TOKEN_PARAM);
  } catch {
    raw = new URL(req.url).searchParams.get(FILED_TOKEN_PARAM);
  }
  const result = await applyFiledToken(raw);
  if (!result.ok) {
    if (result.status === 400) return redirectTo(req, `${FILED_PATH}?notice=invalid`);
    if (result.status === 404) return redirectTo(req, `${FILED_PATH}?notice=missing`);
    return redirectTo(req, `${FILED_PATH}?notice=failed`);
  }
  return redirectTo(req, `${FILED_PATH}?done=1`);
}
