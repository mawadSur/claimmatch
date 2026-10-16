import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PENDING_NEXT_COOKIE, callbackDestination } from '@/lib/safe-next';

/**
 * OAuth / email-confirmation callback. Supabase redirects here with a ?code
 * which we exchange for a session cookie, then forward the user to a
 * same-site ?next path, or to onboarding followed by the page saved at
 * sign-up (the pending-next cookie), such as the claim they picked.
 *
 * When the code can't start a session here (the link was opened in another
 * browser, or used twice) the email is still confirmed, so the person is sent
 * to log in and then on to the same place. An expired or invalid link says so
 * on the login page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const destination = callbackDestination(
    searchParams.get('next'),
    request.cookies.get(PENDING_NEXT_COOKIE)?.value,
  );
  const toLogin = (flag: string) =>
    `${origin}/login?next=${encodeURIComponent(destination)}&${flag}`;

  let target = `${origin}${destination}`;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) target = toLogin('confirmed=1');
  } else if (searchParams.get('error') || searchParams.get('error_code')) {
    target = toLogin('link=expired');
  }

  const response = NextResponse.redirect(target);
  // Used up: the destination is in the redirect now.
  response.cookies.delete(PENDING_NEXT_COOKIE);
  return response;
}
