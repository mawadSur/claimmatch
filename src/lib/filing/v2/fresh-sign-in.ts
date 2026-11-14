/**
 * "File my claim" needs a real sign-in within REAUTH_MAX_AGE_SECONDS: an amr
 * entry of the verified access token whose method is in FRESH_SIGN_IN_METHODS.
 * Email links (otp, magiclink, recovery, invite; for example a match-alert
 * one-click start, src/lib/match-alert-start.ts) never count, and neither do
 * string-only amr entries (no time). filing_sign_packet (0039) checks the
 * same rule again (CM015). Server only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FRESH_SIGN_IN_METHODS, REAUTH_MAX_AGE_SECONDS } from './contract';

export type FreshSignIn =
  | { fresh: true; method: string; time: Date; sessionId: string | null }
  | { fresh: false; reason: 'stale' | 'unavailable' };

const BEARER = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/i;
/** Allowed clock skew between Supabase Auth and this server. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;
/** Supabase Auth's verdicts on the token itself; anything else says Auth could not check it. */
const TOKEN_REJECTED = new Set([400, 401, 403]);

/** The newest qualifying amr entry within the window, from already verified claims. */
export function freshSignInFromClaims(claims: unknown, userId: string, now: Date): FreshSignIn {
  if (!claims || typeof claims !== 'object') return { fresh: false, reason: 'stale' };
  const c = claims as { sub?: unknown; amr?: unknown; session_id?: unknown };
  if (c.sub !== userId || !Array.isArray(c.amr)) return { fresh: false, reason: 'stale' };
  let best: { method: string; ms: number } | null = null;
  for (const entry of c.amr) {
    if (!entry || typeof entry !== 'object') continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== 'string' || !(FRESH_SIGN_IN_METHODS as readonly string[]).includes(method)) continue;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
    const ms = timestamp * 1000;
    const age = now.getTime() - ms;
    if (age > REAUTH_MAX_AGE_SECONDS * 1000 || age < -FUTURE_SKEW_MS) continue;
    if (!best || ms > best.ms) best = { method, ms };
  }
  if (!best) return { fresh: false, reason: 'stale' };
  return {
    fresh: true,
    method: best.method,
    time: new Date(Math.min(best.ms, now.getTime())),
    sessionId: typeof c.session_id === 'string' ? c.session_id : null,
  };
}

/**
 * Reads the caller's verified claims: the bearer token from the request
 * (getClaims(jwt)), or the cookie session (getClaims()). The token was
 * already accepted by getRequestUser; this only reads when the sign-in was.
 * Server components pass the cookie client with via 'cookie' and no request.
 */
export async function readFreshSignIn(args: {
  supabase: SupabaseClient;
  req?: Request;
  via: 'bearer' | 'cookie';
  userId: string;
  now: Date;
}): Promise<FreshSignIn> {
  try {
    let jwt: string | undefined;
    if (args.via === 'bearer') {
      jwt = BEARER.exec(args.req?.headers.get('authorization') ?? '')?.[1];
      if (!jwt) return { fresh: false, reason: 'stale' };
    }
    const { data, error } = jwt ? await args.supabase.auth.getClaims(jwt) : await args.supabase.auth.getClaims();
    if (error) {
      const status = (error as { status?: number }).status ?? 0;
      return { fresh: false, reason: TOKEN_REJECTED.has(status) ? 'stale' : 'unavailable' };
    }
    return freshSignInFromClaims(data?.claims, args.userId, args.now);
  } catch {
    return { fresh: false, reason: 'unavailable' };
  }
}
