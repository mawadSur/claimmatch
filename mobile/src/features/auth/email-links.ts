import type { EmailOtpType } from '@supabase/supabase-js';
import type { Href } from 'expo-router';

import { checkedHref } from './navigation';

/**
 * The checks of src/lib/auth-confirm.ts for the M8 email links
 * (/auth/confirm and /auth/callback opened in the app). Re-implemented here
 * because that module imports the web's safe-next (plan section 4); keep them
 * the same.
 */

/** Email link types the scanner-safe confirm screen accepts. */
export const CONFIRM_TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'email_change'];

export function parseConfirmType(raw: unknown): EmailOtpType | null {
  return typeof raw === 'string' && (CONFIRM_TYPES as readonly string[]).includes(raw) ? (raw as EmailOtpType) : null;
}

/** token_hash values are opaque url-safe strings; reject anything else. */
export function parseTokenHash(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(raw) ? raw : null;
}

/** A PKCE code from /auth/callback: url-safe and bounded, like a token hash (the web passes it to Supabase as is). */
export function parseAuthCode(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,512}$/.test(raw) ? raw : null;
}

/** The log-in screen with flags for the banners it shows and an optional checked `next`. */
export function loginWith(flag: { confirmed: true } | { linkExpired: true }, next: string | null): Href {
  const params: Record<string, string> = 'confirmed' in flag ? { confirmed: '1' } : { link: 'expired' };
  if (next) params.next = next;
  return { pathname: '/login', params };
}

/** Where a verified sign-up or email-change link continues: the checked `next`, else onboarding. */
export function afterEmailConfirmed(next: string | null): Href {
  return next ? checkedHref(next) : { pathname: '/onboarding', params: { confirmed: '1' } };
}

/** Where an invalid, expired or used link goes (confirmFailure in src/lib/auth-confirm.ts). */
export function confirmFailureHref(type: EmailOtpType | null): Href {
  return type === 'recovery'
    ? { pathname: '/forgot-password', params: { link: 'expired' } }
    : { pathname: '/login', params: { link: 'expired' } };
}
