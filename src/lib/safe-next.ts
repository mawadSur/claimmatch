/**
 * Where to send someone after they log in, sign up, confirm their email or
 * finish onboarding. The value comes from ?next in a URL anyone can craft, so
 * it must only ever be a path on this site: a link like
 * /login?next=/%5Cevil.example (or /%09/evil.example) would otherwise send
 * people to a look-alike site right after they log in on the real one.
 *
 * Pure (no window, no Next APIs), so the same rule runs in the browser, in
 * route handlers and in server components.
 */

const BASE = 'https://claimmatch.invalid';
const MAX_LENGTH = 2048;
// Backslashes and control characters (tab, CR, LF...) are the bypasses: the
// URL parser turns "\" into "/" and drops tabs and newlines.
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/**
 * A same-site path ("/claim/abc?x=1#y") built from `raw`, or null when `raw`
 * is missing or could leave the site. Takes the first value of an array (a
 * repeated query parameter).
 */
export function safeNextPath(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//') || UNSAFE.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return url.pathname + url.search + url.hash;
}

/** safeNextPath(raw), or `fallback` when there is no safe path. */
export function safeNextOr(raw: unknown, fallback: string): string {
  return safeNextPath(raw) ?? fallback;
}

/**
 * Sign-up's email confirmation link leads to /auth/callback, which by
 * default continues to onboarding. This first-party cookie carries the page
 * the person started from (for example the claim they picked) through that
 * step on this device, so no Supabase redirect setting has to change.
 */
export const PENDING_NEXT_COOKIE = 'cm_next';

/** The Set-Cookie value AuthForm writes before sign-up (kept for 1 day). */
export function pendingNextCookie(next: string, secure: boolean): string {
  return `${PENDING_NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=86400; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;
}

/** Onboarding, then the page the person started from, when there is one. */
export function onboardingPath(next: string | null): string {
  return next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding';
}

/**
 * Where /auth/callback sends someone: its own ?next when safe, else
 * onboarding followed by the page saved in the pending-next cookie.
 */
export function callbackDestination(nextParam: unknown, pendingCookie: string | undefined): string {
  const fromQuery = safeNextPath(nextParam);
  if (fromQuery) return fromQuery;
  let pending: string | null = null;
  if (pendingCookie) {
    try {
      pending = safeNextPath(decodeURIComponent(pendingCookie));
    } catch {
      pending = null;
    }
  }
  return onboardingPath(pending);
}
