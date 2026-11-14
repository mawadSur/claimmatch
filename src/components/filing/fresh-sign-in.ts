/**
 * Does the session have a real sign-in recent enough for "File my claim"?
 * The claim page asks once when it loads (it sets actions.needs_fresh_sign_in
 * through loadClaimFilingView); the sign route and filing_sign_packet (0039)
 * decide again on every signature. Rule (docs/designs/one-click-filing.md,
 * section 5): an amr entry of the verified token, for this user, whose method
 * is in FRESH_SIGN_IN_METHODS with a timestamp within REAUTH_MAX_AGE_SECONDS.
 * Email links (otp, magiclink, recovery, invite) and string-only amr never
 * count. Same rule as B2's src/lib/filing/v2/fresh-sign-in.ts (not a contract
 * file, so it is not imported here).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FRESH_SIGN_IN_METHODS, REAUTH_MAX_AGE_SECONDS } from '@/lib/filing/v2/contract';

const FRESH = new Set<string>(FRESH_SIGN_IN_METHODS);
/** Allowed clock skew between Supabase Auth and this server (as the sign route allows). */
const FUTURE_SKEW_SECONDS = 5 * 60;

export function hasFreshSignIn(claims: unknown, userId: string, now: Date): boolean {
  if (!claims || typeof claims !== 'object') return false;
  const { sub, amr } = claims as { sub?: unknown; amr?: unknown };
  if (sub !== userId || !Array.isArray(amr)) return false;
  const nowSeconds = now.getTime() / 1000;
  return amr.some((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== 'string' || !FRESH.has(method)) return false;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return false;
    const age = nowSeconds - timestamp;
    return age <= REAUTH_MAX_AGE_SECONDS && age >= -FUTURE_SKEW_SECONDS;
  });
}

/** Reads the cookie session's verified claims; false whenever it can't. */
export async function sessionHasFreshSignIn(supabase: SupabaseClient, userId: string, now: Date): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return false;
    return hasFreshSignIn(data.claims, userId, now);
  } catch {
    return false;
  }
}
