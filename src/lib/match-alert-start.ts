/**
 * Consume a match-alert one-click token: sign in (or create) the account for
 * that email without setting a password, then land on /claim/{slug}.
 */
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent, subscriberDistinctId } from '@/lib/analytics/server';
import { applySessionFlags } from '@/lib/session-flags';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  MATCH_ALERT_TOKEN_PARAM,
  hashMatchAlertToken,
  matchAlertSigningSecret,
  normalizeAlertEmail,
  parseMatchAlertToken,
  type MatchAlertTokenError,
} from '@/lib/match-alert-token';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const MATCH_ALERT_START_LIMIT = 8;

export type MatchAlertStartError =
  | MatchAlertTokenError
  | 'used'
  | 'busy'
  | 'missing_secret'
  | 'missing_config'
  | 'claim_gone'
  | 'auth_failed';

export type MatchAlertStartResult =
  | { ok: true; path: string; createdUser: boolean }
  | { ok: false; error: MatchAlertStartError };

function claimPath(slug: string): string {
  return `/claim/${encodeURIComponent(slug)}`;
}

export function matchAlertStartFailurePath(error: MatchAlertStartError): string {
  if (error === 'busy') return `${'/match-alert/start'}?error=busy`;
  if (error === 'used' || error === 'expired') return `${'/match-alert/start'}?error=${error}`;
  return `${'/match-alert/start'}?error=invalid`;
}

export async function consumeMatchAlertToken(input: {
  token: unknown;
  req: Request;
  now?: Date;
}): Promise<MatchAlertStartResult> {
  const now = input.now ?? new Date();
  const secret = matchAlertSigningSecret();
  if (!secret) return { ok: false, error: 'missing_secret' };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'missing_config' };
  }

  const parsed = parseMatchAlertToken(input.token, secret, now);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (!rateLimit(`match-alert-start:${ipKey(input.req)}`, { limit: MATCH_ALERT_START_LIMIT, windowMs: 60_000 }).ok) {
    return { ok: false, error: 'busy' };
  }
  if (
    !rateLimit(`match-alert-start-email:${parsed.email}`, {
      limit: MATCH_ALERT_START_LIMIT,
      windowMs: 60_000,
    }).ok
  ) {
    return { ok: false, error: 'busy' };
  }

  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const tokenHash = hashMatchAlertToken(token);
  const svc = createServiceClient();

  const { data: tokenRow, error: tokenErr } = await svc
    .from('match_alert_tokens')
    .select('id, email, lawsuit_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (tokenErr || !tokenRow) return { ok: false, error: 'malformed' };

  const row = tokenRow as {
    id: string;
    email: string;
    lawsuit_id: string;
    expires_at: string;
    used_at: string | null;
  };
  if (row.used_at) return { ok: false, error: 'used' };
  if (Date.parse(row.expires_at) <= now.getTime()) return { ok: false, error: 'expired' };
  if (normalizeAlertEmail(row.email) !== parsed.email || row.lawsuit_id !== parsed.lawsuitId) {
    return { ok: false, error: 'malformed' };
  }

  const { data: used, error: useErr } = await svc
    .from('match_alert_tokens')
    .update({ used_at: now.toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id');
  if (useErr || !used?.length) return { ok: false, error: 'used' };

  const { data: lawsuit, error: lawsuitErr } = await svc
    .from('lawsuits')
    .select('id, slug')
    .eq('id', parsed.lawsuitId)
    .maybeSingle();
  if (lawsuitErr || !lawsuit?.slug) return { ok: false, error: 'claim_gone' };
  const slug = (lawsuit as { slug: string }).slug;
  const path = claimPath(slug);

  let createdUser = false;
  let userId: string | null = null;
  let link = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email: parsed.email,
  });

  if (link.error || !link.data?.properties?.hashed_token) {
    const created = await svc.auth.admin.createUser({
      email: parsed.email,
      email_confirm: true,
      user_metadata: { email_opt_in: true, match_alert_signup: true },
    });
    if (created.error && !/already/i.test(created.error.message ?? '')) {
      console.error('[match-alert] createUser failed');
      return { ok: false, error: 'auth_failed' };
    }
    if (!created.error) {
      createdUser = true;
      userId = created.data.user?.id ?? null;
    }
    link = await svc.auth.admin.generateLink({
      type: 'magiclink',
      email: parsed.email,
    });
  }
  if (link.error || !link.data?.properties?.hashed_token) {
    console.error('[match-alert] generateLink failed');
    return { ok: false, error: 'auth_failed' };
  }
  const signedIn = await signInWithHashedToken(
    link.data.properties.hashed_token,
    link.data.properties.verification_type || 'magiclink',
  );
  if (!signedIn.ok) return { ok: false, error: 'auth_failed' };
  userId = signedIn.userId ?? userId;

  if (userId) {
    await applySessionFlags({ userId, email: parsed.email });
    const { data: subscriber } = await svc
      .from('subscribers')
      .select('state')
      .eq('email', parsed.email)
      .maybeSingle();
    const state = (subscriber as { state?: string | null } | null)?.state;
    const patch: Record<string, unknown> = { email_opt_in: true };
    if (state) patch.state = state;
    await svc.from('profiles').update(patch).eq('id', userId);
  }

  const distinctId = userId || subscriberDistinctId(parsed.email);
  await captureServerEvent({
    event: ANALYTICS_EVENTS.match_alert_clicked,
    distinctId,
    properties: { created_user: createdUser },
  });
  if (createdUser) {
    await captureServerEvent({
      event: ANALYTICS_EVENTS.match_alert_signup_completed,
      distinctId,
      properties: { evidence: 'match_alert_token' },
    });
    await captureServerEvent({
      event: ANALYTICS_EVENTS.signup_completed,
      distinctId,
      properties: { evidence: 'match_alert_token' },
    });
  }

  return { ok: true, path, createdUser };
}

async function signInWithHashedToken(
  hashedToken: string,
  type: string,
): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const supabase = await createClient();
  const verifyType = type === 'signup' || type === 'invite' || type === 'email' ? type : 'magiclink';
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: verifyType as 'magiclink' | 'signup' | 'invite' | 'email',
  });
  if (error) return { ok: false };
  return { ok: true, userId: data.user?.id ?? null };
}

export { MATCH_ALERT_TOKEN_PARAM };
