import type { EmailOtpType } from '@supabase/supabase-js';
import { callbackDestination } from '@/lib/safe-next';

/** Email link types the scanner-safe confirm page accepts. */
export const CONFIRM_TYPES: readonly EmailOtpType[] = ['signup', 'email', 'magiclink', 'recovery', 'invite', 'email_change'];

export function parseConfirmType(raw: unknown): EmailOtpType | null {
  return typeof raw === 'string' && (CONFIRM_TYPES as readonly string[]).includes(raw)
    ? (raw as EmailOtpType)
    : null;
}

/** token_hash values are opaque url-safe strings; reject anything else. */
export function parseTokenHash(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(raw) ? raw : null;
}

/**
 * PKCE auth code. Supabase's default email templates link through its own
 * /verify endpoint and then redirect here with ?code=..., not ?token_hash=.
 * Codes are opaque url-safe strings (a UUID today); reject anything else.
 */
export function parseAuthCode(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(raw) ? raw : null;
}

/** Supabase redirects with ?error= / ?error_code= when a link is expired or already used. */
export function hasLinkError(sp: Record<string, string | string[] | undefined>): boolean {
  return Boolean(sp.error || sp.error_code || sp.error_description);
}

/** Where to go after a link is verified. Recovery always sets a new password. */
export function confirmDestination(
  type: EmailOtpType,
  nextParam: unknown,
  pendingCookie: string | undefined,
): string {
  if (type === 'recovery') return '/reset-password';
  const dest = new URL(callbackDestination(nextParam, pendingCookie), 'https://x.invalid');
  dest.searchParams.set('confirmed', '1');
  return `${dest.pathname}${dest.search}`;
}

/** Where to go when the link is invalid, expired or already used. */
export function confirmFailure(type: EmailOtpType | null): string {
  return type === 'recovery' ? '/forgot-password?link=expired' : '/login?link=expired';
}
