/**
 * Google sign-in on the web (issue #50, OAUTH_SIGN_IN_ENABLED). Pure helpers
 * shared by the "Continue with Google" button, the sign-in-again prompt
 * before e-signing, and /auth/callback. No window, no Next APIs.
 */
import { onboardingPath, safeNextPath } from './safe-next';

/** The one provider offered this round. Apple, iOS and Android are on hold. */
export const OAUTH_PROVIDER = 'google' as const;

/**
 * Query flag on /auth/callback that says the code came from "Continue with
 * Google", not from an email link. It only changes where the person lands
 * (onboarding for new accounts, no "email confirmed" banner); it grants
 * nothing, so a hand-made URL with it is harmless.
 */
export const OAUTH_CALLBACK_PARAM = 'oauth';

/** /login?oauth=failed: Google came back without signing the person in. */
export const OAUTH_FAILED_PARAM = 'oauth';
export const OAUTH_FAILED_VALUE = 'failed';

/**
 * Where Google (through Supabase Auth) sends the browser back. It uses this
 * tab's origin, not the site URL that email links use: the PKCE code
 * verifier is a cookie on this origin, so a preview deployment must come back
 * to itself. Each origin must be on the Supabase redirect allow-list.
 */
export function oauthRedirectTo(origin: string, next: string | null): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set(OAUTH_CALLBACK_PARAM, OAUTH_PROVIDER);
  const safe = safeNextPath(next);
  if (safe) url.searchParams.set('next', safe);
  return url.toString();
}

/**
 * Where /auth/callback sends someone after a Google sign-in. A member who
 * finished onboarding goes where they were headed (or the dashboard); a new
 * one goes to onboarding first, then on to that page.
 */
export function oauthDestination(wanted: string | null, onboarded: boolean): string {
  const safe = safeNextPath(wanted);
  if (onboarded) return safe ?? '/dashboard';
  if (safe && (safe === '/onboarding' || safe.startsWith('/onboarding?'))) return safe;
  return onboardingPath(safe);
}

const MAX_NAME = 200;

/**
 * The person's name from Google's profile (Supabase copies it into
 * user_metadata as full_name and name). Null when there is none. The
 * handle_new_user trigger only reads full_name, so the callback fills an
 * empty profiles.full_name from this.
 */
export function oauthDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as { full_name?: unknown; name?: unknown };
  for (const value of [m.full_name, m.name]) {
    if (typeof value !== 'string') continue;
    const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (name) return name.slice(0, MAX_NAME);
  }
  return null;
}

/** Does this Supabase user have a Google identity (so Google can sign them in again)? */
export function hasGoogleIdentity(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false;
  const u = user as { identities?: unknown; app_metadata?: { providers?: unknown; provider?: unknown } };
  if (Array.isArray(u.identities)) {
    if (u.identities.some((i) => i && typeof i === 'object' && (i as { provider?: unknown }).provider === OAUTH_PROVIDER)) {
      return true;
    }
  }
  const providers = u.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes(OAUTH_PROVIDER)) return true;
  return u.app_metadata?.provider === OAUTH_PROVIDER;
}
