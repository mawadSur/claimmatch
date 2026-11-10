/**
 * UTM pair that marks a share_links row as a soft-beta invite.
 * Kept off the server-only beta-invite module so client capture can import it.
 */

export const BETA_INVITE_UTM_SOURCE = 'beta';
export const BETA_INVITE_UTM_MEDIUM = 'invite';
export const BETA_INVITE_UTM_CAMPAIGN = 'soft-beta';

export function isBetaInviteLink(link: {
  utm_source?: string | null;
  utm_medium?: string | null;
}): boolean {
  return link.utm_source === BETA_INVITE_UTM_SOURCE && link.utm_medium === BETA_INVITE_UTM_MEDIUM;
}
