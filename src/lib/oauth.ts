/**
 * Google (issue #50, OAUTH_SIGN_IN_ENABLED) and Apple (APPLE_SIGN_IN_ENABLED)
 * sign-in on the web. Pure helpers shared by the "Continue with …" buttons,
 * the sign-in-again prompt before e-signing, and /auth/callback. No window,
 * no Next APIs. The native app's sign-in is on hold.
 */
import { onboardingPath, safeNextPath } from './safe-next';

/** The providers the web offers. */
export const OAUTH_PROVIDERS = ['google', 'apple'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** The first provider shipped; the default where a caller names none. */
export const OAUTH_PROVIDER = 'google' as const;

/**
 * Query flag on /auth/callback that says the code came from "Continue with
 * Google" or "Continue with Apple" (its value names which), not from an
 * email link. It only changes where the person lands (onboarding for new
 * accounts, no "email confirmed" banner); it grants nothing, so a hand-made
 * URL with it is harmless.
 */
export const OAUTH_CALLBACK_PARAM = 'oauth';

/** /login?oauth=failed: the provider came back without signing the person in. */
export const OAUTH_FAILED_PARAM = 'oauth';
export const OAUTH_FAILED_VALUE = 'failed';
/** /login?oauth=failed&provider=apple: which one, so the message names it. Absent means Google. */
export const OAUTH_FAILED_PROVIDER_PARAM = 'provider';

/** The provider named by ?oauth= on /auth/callback; anything else counts as Google (the first one shipped). */
export function oauthProviderFromParam(value: string | null | undefined): OAuthProvider {
  return value === 'apple' ? 'apple' : OAUTH_PROVIDER;
}

/**
 * Where the provider (through Supabase Auth) sends the browser back. It uses
 * this tab's origin, not the site URL that email links use: the PKCE code
 * verifier is a cookie on this origin, so a preview deployment must come back
 * to itself. Each origin must be on the Supabase redirect allow-list.
 */
export function oauthRedirectTo(origin: string, next: string | null, provider: OAuthProvider = OAUTH_PROVIDER): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set(OAUTH_CALLBACK_PARAM, provider);
  const safe = safeNextPath(next);
  if (safe) url.searchParams.set('next', safe);
  return url.toString();
}

/**
 * The provider-specific part of signInWithOAuth. Google always shows its
 * account chooser (a shared computer can't silently sign in as whoever used
 * Google last) and takes the account email as a hint. Apple has no chooser
 * or hint parameter; it asks for the name and email scopes (Apple shares the
 * name only on the very first sign-in, and may give a private relay address).
 */
export function oauthProviderOptions(
  provider: OAuthProvider,
  loginHint?: string | null,
): { queryParams?: Record<string, string>; scopes?: string } {
  if (provider === 'apple') return { scopes: 'name email' };
  return { queryParams: loginHint ? { prompt: 'select_account', login_hint: loginHint } : { prompt: 'select_account' } };
}

/**
 * Where /auth/callback sends someone after a Google or Apple sign-in. A
 * member who finished onboarding goes where they were headed (or the
 * dashboard); a new one goes to onboarding first, then on to that page.
 */
export function oauthDestination(wanted: string | null, onboarded: boolean): string {
  const safe = safeNextPath(wanted);
  if (onboarded) return safe ?? '/dashboard';
  if (safe && (safe === '/onboarding' || safe.startsWith('/onboarding?'))) return safe;
  return onboardingPath(safe);
}

const MAX_NAME = 200;

/**
 * The person's name from the provider's profile (Supabase copies it into
 * user_metadata as full_name and name). Null when there is none, which is
 * common with Apple: it shares the name only on the first sign-in, and the
 * web flow may not pass it on at all. An email address is never a name. The
 * handle_new_user trigger only reads full_name, so the callback fills an
 * empty profiles.full_name from this; onboarding asks for it otherwise.
 */
export function oauthDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as { full_name?: unknown; name?: unknown };
  for (const value of [m.full_name, m.name]) {
    if (typeof value !== 'string') continue;
    const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (name && !name.includes('@')) return name.slice(0, MAX_NAME);
  }
  return null;
}

/** Does this Supabase user have an identity with this provider (so it can sign them in again)? */
export function hasOAuthIdentity(user: unknown, provider: OAuthProvider): boolean {
  if (!user || typeof user !== 'object') return false;
  const u = user as { identities?: unknown; app_metadata?: { providers?: unknown; provider?: unknown } };
  if (Array.isArray(u.identities)) {
    if (u.identities.some((i) => i && typeof i === 'object' && (i as { provider?: unknown }).provider === provider)) {
      return true;
    }
  }
  const providers = u.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes(provider)) return true;
  return u.app_metadata?.provider === provider;
}

/** Does this Supabase user have a Google identity? */
export function hasGoogleIdentity(user: unknown): boolean {
  return hasOAuthIdentity(user, 'google');
}

/** Does this Supabase user have an Apple identity? */
export function hasAppleIdentity(user: unknown): boolean {
  return hasOAuthIdentity(user, 'apple');
}
