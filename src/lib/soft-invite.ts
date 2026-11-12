/**
 * Soft-invite landing helpers. /invite is private (noindex) and 404s unless
 * SOFT_INVITE_LANDING_ENABLED=1.
 */
import { attributionQuery, parseAttribution, sanitizeRef } from '@/lib/attribution';
import { flags } from '@/lib/flags';
import { safeNextPath } from '@/lib/safe-next';

export function isInviteLandingEnabled(): boolean {
  return flags.softInviteLanding();
}

/**
 * /signup with the same safe next path, ref, and UTMs the invite page received.
 * Extra query keys are dropped.
 */
/**
 * First-touch ref from the invite page. `ref` wins; `code` is the per-tester
 * alias used on `/invite?code=…` so share-link codes survive signup.
 */
export function inviteRefFromSearch(
  params: URLSearchParams,
  mapCode = flags.betaInviteCodes(),
): string | null {
  const attr = parseAttribution(params);
  if (attr.ref) return attr.ref;
  if (!mapCode) return null;
  return sanitizeRef(params.get('code'));
}

export function inviteSignupHref(search: string | URLSearchParams | null | undefined): string {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === 'string' ? search.replace(/^\?/, '') : '');
  const attr = parseAttribution(params);
  if (!attr.ref) {
    // Always keep ?code= as ref on this landing so signup still gets it even
    // when the capture helper is off. The page itself 404s unless the invite
    // landing flag is on.
    const code = sanitizeRef(params.get('code'));
    if (code) attr.ref = code;
  }
  const query = attributionQuery(attr);
  const next = safeNextPath(params.get('next'));
  if (next) query.set('next', next);
  const serialized = query.toString();
  return serialized ? `/signup?${serialized}` : '/signup';
}
