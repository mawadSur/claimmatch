import { flags } from './flags';
import { safeNextPath } from './safe-next';

const CLAIM_PATH = /^\/claim\/[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const CLAIM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** sessionStorage key: the claim path the person started from. */
export const SIGNUP_CONTEXT_STORAGE_KEY = 'cm_signup_context';

function pathnameOf(path: string): string {
  return path.split('#')[0]?.split('?')[0] ?? path;
}

/** A same-site /claim/{slug} path, after safeNextPath. */
export function isClaimReturnPath(raw: unknown): boolean {
  const safe = safeNextPath(raw);
  if (!safe) return false;
  return CLAIM_PATH.test(pathnameOf(safe));
}

export function claimReturnPath(slug: string): string | null {
  if (!CLAIM_SLUG.test(slug)) return null;
  return safeNextPath(`/claim/${slug}`);
}

/**
 * Where a signed-out visitor goes when they hit a protected claim URL.
 * Flag off: /login (today). Flag on: /signup, with the validated claim path.
 */
export function signedOutClaimHref(nextPath: string): string {
  const next = safeNextPath(nextPath);
  if (!next) return '/login';
  const dest = flags.signupContext() && isClaimReturnPath(next) ? '/signup' : '/login';
  return `${dest}?next=${encodeURIComponent(next)}`;
}

export function rememberSignupContext(next: string | null): void {
  if (typeof window === 'undefined') return;
  if (!isClaimReturnPath(next) || !next) {
    try {
      window.sessionStorage.removeItem(SIGNUP_CONTEXT_STORAGE_KEY);
    } catch {
      /* private mode */
    }
    return;
  }
  const safe = safeNextPath(next);
  if (!safe) return;
  try {
    window.sessionStorage.setItem(SIGNUP_CONTEXT_STORAGE_KEY, pathnameOf(safe));
  } catch {
    /* private mode */
  }
}

export function consumeSignupContext(expectedPath: string): boolean {
  if (typeof window === 'undefined') return false;
  const expected = safeNextPath(expectedPath);
  if (!expected) return false;
  try {
    const stored = window.sessionStorage.getItem(SIGNUP_CONTEXT_STORAGE_KEY);
    if (stored !== pathnameOf(expected)) return false;
    window.sessionStorage.removeItem(SIGNUP_CONTEXT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
