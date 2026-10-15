import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Public marketing routes skip session refresh so they can be cached.
 * Nav auth is resolved client-side in NavAuthLinks.
 */
const PUBLIC_CACHEABLE = new Set([
  '/',
  '/how-it-works',
  '/pricing',
  '/trust',
  '/about',
  '/terms',
  '/privacy',
  '/how-we-make-money',
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
]);

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_CACHEABLE.has(path)) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
