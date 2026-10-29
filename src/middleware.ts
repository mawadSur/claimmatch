import { NextResponse, type NextRequest } from 'next/server';
import { isCronApiPath } from '@/lib/cron-auth';
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
  if (isCronApiPath(pathname)) {
    return NextResponse.next({ request });
  }
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('error') || searchParams.has('error_code'))) {
    const dest = request.nextUrl.clone();
    dest.pathname = '/auth/callback';
    return NextResponse.redirect(dest);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
