import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { signedOutClaimHref } from '@/lib/signup-context';

/**
 * Supabase SSR session cookies look like `sb-<ref>-auth-token` (and `.0`
 * chunks). Anonymous traffic has none — skip getUser() for those requests so
 * middleware does not burn Fluid Active CPU on every public hit.
 */
export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

/**
 * Refreshes the Supabase auth session when a session cookie is present and
 * guards authenticated routes. Wired up from src/middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const protectedPaths = ['/dashboard', '/onboarding', '/settings', '/admin'];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  // If Supabase isn't configured yet (e.g. first deploy on sample data), no
  // session is possible — send protected routes to /login instead of letting
  // the page construct a Supabase client and 500. Public routes pass through.
  // Back to the same page after logging in, query included (for example
  // /onboarding?next=/claim/x). Login and sign-up check it with safeNextPath.
  const nextAfterLogin = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const toAuth = () => NextResponse.redirect(new URL(signedOutClaimHref(nextAfterLogin), request.nextUrl.origin));

  if (!url || !key) {
    if (isProtected) return toAuth();
    return supabaseResponse;
  }

  const hasSessionCookie = hasSupabaseAuthCookie(request);

  // Protected + no cookie: redirect without a Supabase round-trip.
  if (isProtected && !hasSessionCookie) return toAuth();

  // Public + no cookie: pass through. No session to refresh.
  if (!hasSessionCookie) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) return toAuth();

  return supabaseResponse;
}
