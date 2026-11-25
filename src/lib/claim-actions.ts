/**
 * Per-settlement claim action types and the public CTA each type may show.
 * Types are stored on lawsuits.claim_action_type (0051). Unset/null keeps the
 * existing "Start your claim" path so tests and unreviewed rows do not change.
 *
 * Never invent a payout or a filing path. Captcha / OTP / identity checks stay
 * hard stops. Desk filing still needs an approved policy + legal reviewer.
 */

export const CLAIM_ACTION_TYPES = [
  'desk_file',
  'online_form',
  'needs_notice_id',
  'mail_in',
  'automatic_payment',
  'not_open',
] as const;
export type ClaimActionType = (typeof CLAIM_ACTION_TYPES)[number];

export function isClaimActionType(value: string | null | undefined): value is ClaimActionType {
  return typeof value === 'string' && (CLAIM_ACTION_TYPES as readonly string[]).includes(value);
}

/** Extra, optional facts for mail-in / automatic-payment CTAs. Stored as lawsuits.claim_action. */
export interface ClaimActionDetails {
  form_url?: string | null;
  mail_to?: string | null;
  postmark?: boolean;
  received_by?: boolean;
  proof?: string | null;
  address_update_url?: string | null;
  notes?: string | null;
}

export const EASY_SUBMIT_BADGE = 'Easy submit';
export const SUBMIT_CLAIM_CTA = 'Submit a claim';
export const START_CLAIM_CTA = 'Start your claim';
export const FILE_ON_OFFICIAL_CTA = 'File on the official site';
export const ADD_NOTICE_ID_CTA = 'Add your notice ID';
export const PRINT_AND_MAIL_CTA = 'Print and mail instructions';
export const NO_CLAIM_NEEDED_HEADING = 'No claim needed — you get paid automatically';
export const KEEP_ADDRESS_CURRENT =
  'Make sure your address is current with the settlement administrator so they can reach you.';
export const NOT_OPEN_ALERT = 'This settlement is not open for claims on Lawsuit AI.';
export const NOTICE_ID_WARNING =
  'This administrator asks for a notice ID or claim ID from the letter they mailed you. We cannot log into the official site for you.';
export const NOTICE_PIN_NOT_COLLECTED =
  'Lawsuit AI does not collect the official site’s login PIN or password. Use those only on the administrator’s site.';
export const COLLECT_ADMIN_PIN_NOTE =
  'Collecting an official-site login PIN or password stays off until counsel and security approve COLLECT_ADMIN_PIN_ENABLED.';

export interface ClaimActionCtaModel {
  type: ClaimActionType;
  /** Catalog / settlement-page badge. Null when none. */
  badge: string | null;
  heading: string;
  body: string;
  primary: { label: string; href: string } | null;
  secondary: { label: string; href: string } | null;
  /** True when this settlement should never show a file / submit button. */
  hideFileButton: boolean;
  alert: string | null;
}

export function claimActionOf(row: {
  claim_action_type?: string | null;
  claim_action?: ClaimActionDetails | null;
}): { type: ClaimActionType | null; details: ClaimActionDetails } {
  const type = isClaimActionType(row.claim_action_type) ? row.claim_action_type : null;
  const details =
    row.claim_action && typeof row.claim_action === 'object' && !Array.isArray(row.claim_action)
      ? row.claim_action
      : {};
  return { type, details };
}

/**
 * What a public page should show for this settlement. `claimHref` is the
 * in-app /claim/{slug} path. `officialHref` is the administrator site, if any.
 */
export function claimActionCta(input: {
  type: ClaimActionType | null;
  slug: string;
  officialHref?: string | null;
  details?: ClaimActionDetails;
  /** When true, desk_file uses the one-click submit path. */
  deskEligible?: boolean;
}): ClaimActionCtaModel {
  const claimHref = `/claim/${input.slug}`;
  const official = input.officialHref ?? null;
  const details = input.details ?? {};

  switch (input.type) {
    case 'desk_file':
      return {
        type: 'desk_file',
        badge: EASY_SUBMIT_BADGE,
        heading: 'Easy submit',
        body: 'Fill in anything still missing, review the official attestation, and e-sign. Staff then files it on the official site from your packet. Captcha, one-time codes and identity checks still stop us.',
        primary: { label: SUBMIT_CLAIM_CTA, href: claimHref },
        secondary: official ? { label: FILE_ON_OFFICIAL_CTA, href: official } : null,
        hideFileButton: false,
        alert: null,
      };
    case 'online_form':
      return {
        type: 'online_form',
        badge: null,
        heading: 'File on the official site',
        body: 'Use your claim profile to copy the details the form asks for, then submit on the administrator’s site. Lawsuit AI does not submit this one for you unless a later desk policy is approved.',
        primary: { label: START_CLAIM_CTA, href: claimHref },
        secondary: official ? { label: FILE_ON_OFFICIAL_CTA, href: official } : null,
        hideFileButton: false,
        alert: null,
      };
    case 'needs_notice_id':
      return {
        type: 'needs_notice_id',
        badge: null,
        heading: 'You need the ID from your notice',
        body: NOTICE_ID_WARNING,
        primary: { label: ADD_NOTICE_ID_CTA, href: `${claimHref}#missing-info` },
        secondary: official ? { label: FILE_ON_OFFICIAL_CTA, href: official } : null,
        hideFileButton: false,
        alert: NOTICE_PIN_NOT_COLLECTED,
      };
    case 'mail_in':
      return {
        type: 'mail_in',
        badge: null,
        heading: 'Print, sign and mail this claim',
        body: details.notes?.trim() || 'This administrator takes mailed claim forms. Download the form, fill it from your profile summary, sign it, and keep a copy.',
        primary: { label: PRINT_AND_MAIL_CTA, href: `${claimHref}#mail-in` },
        secondary: details.form_url
          ? { label: 'Download the claim form', href: details.form_url }
          : official
            ? { label: 'Official site', href: official }
            : null,
        hideFileButton: false,
        alert: null,
      };
    case 'automatic_payment':
      return {
        type: 'automatic_payment',
        badge: null,
        heading: NO_CLAIM_NEEDED_HEADING,
        body: KEEP_ADDRESS_CURRENT,
        primary: details.address_update_url
          ? { label: 'Update your address with the administrator', href: details.address_update_url }
          : official
            ? { label: 'Official administrator site', href: official }
            : null,
        secondary: { label: 'Keep your claim profile current', href: '/settings/claim-profile' },
        hideFileButton: true,
        alert: null,
      };
    case 'not_open':
      return {
        type: 'not_open',
        badge: null,
        heading: NOT_OPEN_ALERT,
        body: details.notes?.trim() || 'Check the official site if you already filed or need to update an address.',
        primary: official ? { label: 'Official site', href: official } : null,
        secondary: null,
        hideFileButton: true,
        alert: NOT_OPEN_ALERT,
      };
    default:
      return {
        type: 'online_form',
        badge: null,
        heading: 'Start your claim',
        body: 'Check who qualifies on the official notice, then file there.',
        primary: { label: START_CLAIM_CTA, href: claimHref },
        secondary: official ? { label: FILE_ON_OFFICIAL_CTA, href: official } : null,
        hideFileButton: false,
        alert: null,
      };
  }
}

export const MAIL_IN_STEPS = [
  'Download the official claim form.',
  'Fill it using the printable summary of your claim profile. Do not invent facts.',
  'Sign the form the way the notice says (wet ink unless it allows e-sign).',
  'Attach the proof the notice lists, if any.',
  'Mail it to the address on the form.',
  'Watch the deadline: postmark vs received-by is on the notice.',
  'Keep a copy of everything you send.',
  'Certified mail is optional and is your choice, not required by Lawsuit AI.',
] as const;
