import { NextResponse, type NextRequest } from 'next/server';
import { jsonApiNotFound } from '@/lib/api-not-found';
import { isMalformedApiPath } from '@/lib/analytics/traffic';
import { isCronApiPath } from '@/lib/cron-auth';
import { indexNowKeyFileRequest } from '@/lib/indexnow';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Confirmation emails sometimes land on /?code=... when the project Site URL
 * is the homepage. Forward that to /auth/callback so the code can be
 * exchanged and the person is signed in.
 *
 * /api/cron/* is a pass-through: Vercel Cron sends no cookies, and a
 * Supabase session refresh (or any host redirect) would hide the scheduled
 * run before the handler can record a jobs row.
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (isMalformedApiPath(pathname)) {
    return jsonApiNotFound();
  }
  if (isCronApiPath(pathname)) {
    return NextResponse.next({ request });
  }
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('error') || searchParams.has('error_code'))) {
    const dest = request.nextUrl.clone();
    dest.pathname = '/auth/callback';
    return NextResponse.redirect(dest);
  }
  // IndexNow's standard key file is /{key}.txt; serve the same body as /indexnow-key.txt.
  if (indexNowKeyFileRequest(pathname)) {
    const dest = request.nextUrl.clone();
    dest.pathname = '/indexnow-key.txt';
    return NextResponse.rewrite(dest);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - static assets and image files;
     * - /ingest/* (PostHog proxy rewrite; no session needed);
     * - /lawsuits/<slug>/* and /settlements/<hub>/* (public SEO pages, mostly
     *   force-static, so a session cookie cannot change what they render);
     * - robots.txt, sitemap.xml, llms.txt (crawler files).
     * Each skipped request saves a middleware run plus a Supabase getUser
     * call. These paths were about half of the requests that reached
     * middleware in a recent 11 hour sample, so this cuts Vercel Active CPU
     * on the Hobby team. /lawsuits (the index) still runs middleware.
     */
    '/((?!_next/static|_next/image|favicon.ico|ingest/|lawsuits/|settlements/|robots\\.txt$|sitemap\\.xml$|llms\\.txt$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
