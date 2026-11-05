import { SITE } from '@shared/lib/utils';

/** The website (https://lawsuitai.org), without a trailing slash. */
const SITE_ORIGIN = SITE.url.replace(/\/+$/, '');

/** Web pages the app opens in the in-app browser. */
export const WEB_LINKS = {
  privacy: `${SITE_ORIGIN}/privacy`,
  terms: `${SITE_ORIGIN}/terms`,
  howWeMakeMoney: `${SITE_ORIGIN}/how-we-make-money`,
} as const;

/** The personal referral link (src/components/ReferralCard.tsx), or null before the account has a code. */
export function referralLink(code: string | null | undefined): string | null {
  const trimmed = code?.trim();
  return trimmed ? `${SITE_ORIGIN}/r/${encodeURIComponent(trimmed)}` : null;
}
