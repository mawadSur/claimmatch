import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth / email-confirmation callback. Supabase redirects here with a ?code
 * which we exchange for a session cookie, then forward the user on to
 * onboarding (or a ?next path when one was supplied).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const nextParam = searchParams.get('next');
  // Only allow same-origin relative redirects.
  const next = nextParam && nextParam.startsWith('/') ? nextParam : '/onboarding';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
