/**
 * Soft-invite landing helpers. /invite is private (noindex) and 404s unless
 * SOFT_INVITE_LANDING_ENABLED=1.
 */
import { attributionQuery, parseAttribution } from '@/lib/attribution';
import { flags } from '@/lib/flags';
import { safeNextPath } from '@/lib/safe-next';

export function isInviteLandingEnabled(): boolean {
  return flags.softInviteLanding();
}

/**
 * /signup with the same safe next path, ref, and UTMs the invite page received.
 * Extra query keys are dropped.
 */
export function inviteSignupHref(search: string | URLSearchParams | null | undefined): string {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === 'string' ? search.replace(/^\?/, '') : '');
  const attr = parseAttribution(params);
  const query = attributionQuery(attr);
  const next = safeNextPath(params.get('next'));
  if (next) query.set('next', next);
  const serialized = query.toString();
  return serialized ? `/signup?${serialized}` : '/signup';
}
