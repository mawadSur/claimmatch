import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { captureServerEvent } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  OAUTH_CALLBACK_PARAM,
  OAUTH_FAILED_PARAM,
  OAUTH_FAILED_PROVIDER_PARAM,
  OAUTH_FAILED_VALUE,
  oauthDestination,
  oauthDisplayName,
  oauthProviderFromParam,
} from '@/lib/oauth';
import { PENDING_NEXT_COOKIE, callbackDestination, safeNextPath } from '@/lib/safe-next';
import { applySessionFlags } from '@/lib/session-flags';
import { createClient } from '@/lib/supabase/server';

/** An account this young, not yet onboarded, was just created by this sign-in. */
const NEW_ACCOUNT_MS = 10 * 60 * 1000;

function pendingPath(cookie: string | undefined): string | null {
  if (!cookie) return null;
  try {
    return safeNextPath(decodeURIComponent(cookie));
  } catch {
    return null;
  }
}

/**
 * After "Continue with Google" or "Continue with Apple": fill an empty
 * profiles.full_name from the provider's name (handle_new_user only copies
 * full_name), and report whether onboarding is done. Apple often shares no
 * name, so the name stays empty and onboarding asks for it. A read failure
 * counts as not onboarded, so a new member is never skipped past onboarding.
 */
async function oauthProfile(supabase: SupabaseClient, user: User): Promise<{ onboarded: boolean }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, onboarded')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) return { onboarded: false };
    const row = data as { full_name?: string | null; onboarded?: boolean | null };
    const name = oauthDisplayName(user.user_metadata);
    if (name && !(row.full_name ?? '').trim()) {
      await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
    }
    return { onboarded: row.onboarded === true };
  } catch {
    return { onboarded: false };
  }
}

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
 *
 * "Continue with Google" or "Continue with Apple" (?oauth=google or
 * ?oauth=apple, src/lib/oauth.ts) lands differently: a member who finished
 * onboarding goes straight to ?next (or the dashboard), a new one goes to
 * onboarding first, and a canceled or failed sign-in goes back to log in with
 * ?oauth=failed (plus &provider=apple for Apple) instead of "link expired".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const viaOauth = searchParams.has(OAUTH_CALLBACK_PARAM);
  const provider = oauthProviderFromParam(searchParams.get(OAUTH_CALLBACK_PARAM));
  const pendingCookie = request.cookies.get(PENDING_NEXT_COOKIE)?.value;
  const destination = callbackDestination(searchParams.get('next'), pendingCookie);
  const toLogin = (flag: string) =>
    `${origin}/login?next=${encodeURIComponent(destination)}&${flag}`;
  // Google or Apple: only where the person was headed; onboarding is decided after sign-in.
  const wanted = safeNextPath(searchParams.get('next')) ?? pendingPath(pendingCookie);
  const failedFlag = `${OAUTH_FAILED_PARAM}=${OAUTH_FAILED_VALUE}${
    provider === 'apple' ? `&${OAUTH_FAILED_PROVIDER_PARAM}=apple` : ''
  }`;
  const oauthFailed = wanted
    ? `${origin}/login?next=${encodeURIComponent(wanted)}&${failedFlag}`
    : `${origin}/login?${failedFlag}`;

  let target = `${origin}${destination}`;
  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      target = viaOauth ? oauthFailed : toLogin('confirmed=1');
    } else if (viaOauth && data?.user) {
      const user = data.user;
      await applySessionFlags({ userId: user.id, email: user.email });
      const { onboarded } = await oauthProfile(supabase, user);
      target = `${origin}${oauthDestination(wanted, onboarded)}`;
      const created = Date.parse(user.created_at ?? '');
      const isNew = !onboarded && Number.isFinite(created) && Date.now() - created < NEW_ACCOUNT_MS;
      // The account id only, never the email or name.
      await captureServerEvent({
        event: isNew ? ANALYTICS_EVENTS.signup_completed : ANALYTICS_EVENTS.login_completed,
        distinctId: user.id,
        properties: { evidence: 'oauth_sign_in', provider },
      });
    } else {
      if (data?.user) {
        await applySessionFlags({ userId: data.user.id, email: data.user.email });
      }
      const landed = new URL(target);
      landed.searchParams.set('confirmed', '1');
      target = landed.toString();
    }
  } else if (searchParams.get('error') || searchParams.get('error_code')) {
    target = viaOauth ? oauthFailed : toLogin('link=expired');
  }

  const response = NextResponse.redirect(target);
  // Used up: the destination is in the redirect now.
  response.cookies.delete(PENDING_NEXT_COOKIE);
  return response;
}
