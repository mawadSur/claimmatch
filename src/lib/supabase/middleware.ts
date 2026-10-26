import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session on every request and guards
 * authenticated routes. Wired up from src/middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const protectedPaths = ['/dashboard', '/onboarding', '/claim', '/settings', '/admin'];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  // If Supabase isn't configured yet (e.g. first deploy on sample data), no
  // session is possible — send protected routes to /login instead of letting
  // the page construct a Supabase client and 500. Public routes pass through.
  // Back to the same page after logging in, query included (for example
  // /onboarding?next=/claim/x). Login and sign-up check it with safeNextPath.
  const nextAfterLogin = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const toLogin = () => {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', nextAfterLogin);
    return NextResponse.redirect(redirectUrl);
  };

  if (!url || !key) {
    if (isProtected) return toLogin();
    return supabaseResponse;
  }

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

  if (!user && isProtected) return toLogin();

  return supabaseResponse;
}
