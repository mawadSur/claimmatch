import { safeNextPath } from '@/lib/safe-next';
import {
  type Attribution,
  attributionSearch,
  emptyAttribution,
  fillAttribution,
  parseAttribution,
  sanitizeRef,
  sanitizeUtm,
} from '@/lib/attribution';

export const PERSONAL_REFERRAL_UTM: Attribution = {
  utm_source: 'referral',
  utm_medium: 'user',
  utm_campaign: 'personal',
  utm_content: null,
  ref: null,
};

export interface ShareLinkRecord {
  code: string;
  destination: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  label: string | null;
}

export interface ShareLinkStats extends ShareLinkRecord {
  id: string;
  destination: string;
  created_at: string;
  clicks: number;
  signups: number;
}

/** Same-site path only. `/` when missing or unsafe (never a protocol-relative URL). */
export function sanitizeDestination(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.trim() === '/') return '/';
  return safeNextPath(raw.trim()) ?? '/';
}

export function newShareCode(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

export function shareLinkAttribution(link: ShareLinkRecord): Attribution {
  return {
    utm_source: sanitizeUtm(link.utm_source),
    utm_medium: sanitizeUtm(link.utm_medium),
    utm_campaign: sanitizeUtm(link.utm_campaign),
    utm_content: sanitizeUtm(link.utm_content),
    ref: sanitizeRef(link.code),
  };
}

/**
 * Resolve /r/:code to a same-origin URL that still carries UTMs and ref.
 * Campaign rows use their stored destination + UTMs (incoming fills blanks).
 * Personal referral codes go to /signup with referral UTMs, and keep any
 * UTMs that were already on the request.
 */
export function resolveShareRedirect(opts: {
  code: string;
  origin: string;
  incoming: Attribution;
  shareLink: ShareLinkRecord | null;
  isPersonalReferral: boolean;
}): { url: string; attribution: Attribution; logClick: boolean } | null {
  const code = sanitizeRef(opts.code);
  if (!code) return null;

  if (opts.shareLink) {
    const stored = shareLinkAttribution({ ...opts.shareLink, code });
    const attribution = fillAttribution(stored, { ...opts.incoming, ref: code });
    const dest = sanitizeDestination(opts.shareLink.destination);
    return {
      url: joinOrigin(opts.origin, dest, attribution),
      attribution,
      logClick: true,
    };
  }

  if (opts.isPersonalReferral) {
    // Incoming UTMs win; referral defaults only fill blanks so /r/code?utm_*
    // still reaches signup.
    const attribution = fillAttribution(
      { ...opts.incoming, ref: code },
      { ...PERSONAL_REFERRAL_UTM, ref: code },
    );
    return {
      url: joinOrigin(opts.origin, '/signup', attribution),
      attribution,
      logClick: true,
    };
  }

  // Unknown code: still keep ref + any incoming UTMs so a mistyped or
  // not-yet-provisioned link does not drop attribution on the way to signup.
  const attribution = fillAttribution(emptyAttribution(), { ...opts.incoming, ref: code });
  return {
    url: joinOrigin(opts.origin, '/signup', attribution),
    attribution,
    logClick: false,
  };
}

export function joinOrigin(origin: string, path: string, attr: Attribution): string {
  const base = origin.replace(/\/$/, '');
  const dest = path.startsWith('/') ? path : `/${path}`;
  const [pathname, existingQuery] = dest.split('?');
  const params = new URLSearchParams(existingQuery || '');
  const extra = parseAttribution(params);
  const merged = fillAttribution(attr, extra);
  return `${base}${pathname}${attributionSearch(merged)}`;
}

/** Long tracked URL: origin + destination + UTMs + ref. */
export function trackedCampaignUrl(
  origin: string,
  destination: string,
  attr: Attribution,
): string {
  return joinOrigin(origin, sanitizeDestination(destination), attr);
}

export function shortShareUrl(origin: string, code: string): string {
  const safe = sanitizeRef(code);
  return `${origin.replace(/\/$/, '')}/r/${safe ?? ''}`;
}
