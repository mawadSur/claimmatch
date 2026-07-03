import { NextResponse } from 'next/server';

/**
 * GET /r/:code — referral landing. Drops a 30-day `cm_ref` cookie so the code
 * survives the signup flow, then redirects to signup with the code in the URL.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const safe = (code || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);

  const origin = new URL(req.url).origin;
  const dest = safe
    ? `${origin}/signup?ref=${encodeURIComponent(safe)}`
    : `${origin}/signup`;

  const res = NextResponse.redirect(dest);
  if (safe) {
    res.cookies.set('cm_ref', safe, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
    });
  }
  return res;
}
