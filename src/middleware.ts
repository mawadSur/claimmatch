import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Build the Content-Security-Policy. It has to stay functional for Next.js
 * (App Router injects inline hydration/bootstrap scripts and styled-jsx emits
 * inline <style>, so we allow 'unsafe-inline' for both; 'unsafe-eval' keeps the
 * dev/webpack runtime working). connect-src is widened to Supabase so the
 * browser client can reach auth/storage/realtime. A CSP that white-screens the
 * app is worse than none — this errs toward working over maximally strict.
 */
function buildCsp(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let supabaseOrigin = '';
  if (supabaseUrl) {
    try {
      supabaseOrigin = new URL(supabaseUrl).origin;
    } catch {
      supabaseOrigin = '';
    }
  }

  const connectSrc = [
    "'self'",
    supabaseOrigin,
    'https://*.supabase.co',
    'wss://*.supabase.co',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** Set defense-in-depth security headers on the response we already built. */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp());
  // Belt-and-suspenders with frame-ancestors above for older browsers.
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  return response;
}

export async function middleware(request: NextRequest) {
  // Preserve the existing session-refresh / auth-redirect behavior exactly —
  // we only decorate whatever response updateSession returns with headers.
  const response = await updateSession(request);
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
