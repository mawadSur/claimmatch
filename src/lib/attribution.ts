/**
 * First-touch campaign attribution: utm_source, utm_medium, utm_campaign,
 * utm_content, a `ref` code, and a sanitized document referrer. Existing
 * values win so a later click never overwrites the first one.
 */

import {
  classifyTrafficChannel,
  INITIAL_TRAFFIC_CHANNEL_PROPERTY,
  TRAFFIC_CHANNEL_PROPERTY,
} from '@/lib/analytics/referrer-channel';
import { flags } from '@/lib/flags';

export const REF_COOKIE = 'cm_ref';
export const ATTR_COOKIE = 'cm_attr';
export const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  ref: string | null;
  /** Origin + pathname of the first external document.referrer. No query. */
  referrer: string | null;
}

export const EMPTY_ATTRIBUTION: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  ref: null,
  referrer: null,
};

const UTM_SAFE = /[^a-zA-Z0-9._:-]/g;
const REF_SAFE = /[^a-zA-Z0-9_-]/g;

/**
 * First-touch HTTP referrer: https origin + pathname only. Drops query and
 * hash (those can hold emails). Same-site and non-http(s) values are ignored.
 */
export function sanitizeReferrer(raw: unknown, currentOrigin?: string | null, max = 200): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (currentOrigin) {
      try {
        if (url.origin === new URL(currentOrigin).origin) return null;
      } catch {
        /* ignore a bad current origin */
      }
    }
    const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
    const cleaned = `${url.origin}${path}`;
    return cleaned.slice(0, max) || null;
  } catch {
    return null;
  }
}

/** Campaign tag: letters, numbers, and . _ : - only. */
export function sanitizeUtm(raw: unknown, max = 80): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().slice(0, max).replace(UTM_SAFE, '');
  return cleaned || null;
}

/** Share / referral code: letters, numbers, _ and -. */
export function sanitizeRef(raw: unknown, max = 32): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().slice(0, max).replace(REF_SAFE, '');
  return cleaned || null;
}

export function emptyAttribution(): Attribution {
  return { ...EMPTY_ATTRIBUTION };
}

export function hasAttribution(attr: Attribution | null | undefined): boolean {
  if (!attr) return false;
  return Boolean(
    attr.ref ||
      attr.utm_source ||
      attr.utm_medium ||
      attr.utm_campaign ||
      attr.utm_content ||
      attr.referrer,
  );
}

function readParam(
  input: URLSearchParams | Record<string, string | null | undefined>,
  key: string,
): string | null {
  if (input instanceof URLSearchParams) return input.get(key);
  const value = input[key];
  return typeof value === 'string' ? value : null;
}

/** Read UTMs + ref from a query string or a plain object. */
export function parseAttribution(
  input: URLSearchParams | Record<string, string | null | undefined>,
): Attribution {
  return {
    utm_source: sanitizeUtm(readParam(input, 'utm_source')),
    utm_medium: sanitizeUtm(readParam(input, 'utm_medium')),
    utm_campaign: sanitizeUtm(readParam(input, 'utm_campaign')),
    utm_content: sanitizeUtm(readParam(input, 'utm_content')),
    ref: sanitizeRef(readParam(input, 'ref')),
    // Referrer is never taken from the query string (that would be spoofable
    // and could carry PII). Capture it from document.referrer instead.
    referrer: null,
  };
}

/** First-touch merge: each field on `existing` wins when it is already set. */
export function firstTouch(existing: Attribution, incoming: Attribution): Attribution {
  return {
    utm_source: existing.utm_source || incoming.utm_source,
    utm_medium: existing.utm_medium || incoming.utm_medium,
    utm_campaign: existing.utm_campaign || incoming.utm_campaign,
    utm_content: existing.utm_content || incoming.utm_content,
    ref: existing.ref || incoming.ref,
    referrer: existing.referrer || incoming.referrer,
  };
}

/** Incoming values fill only the blanks on `base` (share-link defaults). */
export function fillAttribution(base: Attribution, incoming: Attribution): Attribution {
  return firstTouch(base, incoming);
}

export function attributionQuery(attr: Attribution): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = attr[key];
    if (value) params.set(key, value);
  }
  if (attr.ref) params.set('ref', attr.ref);
  return params;
}

export function attributionSearch(attr: Attribution): string {
  const q = attributionQuery(attr).toString();
  return q ? `?${q}` : '';
}

/** Cookie payload for first-touch UTMs (ref stays on cm_ref). */
export function serializeAttrCookie(attr: Attribution): string {
  return JSON.stringify({
    utm_source: attr.utm_source,
    utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign,
    utm_content: attr.utm_content,
    referrer: attr.referrer,
  });
}

export function parseAttrCookie(raw: string | null | undefined): Attribution {
  if (!raw) return emptyAttribution();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const parsedAttr = parseAttribution({
      utm_source: typeof parsed.utm_source === 'string' ? parsed.utm_source : null,
      utm_medium: typeof parsed.utm_medium === 'string' ? parsed.utm_medium : null,
      utm_campaign: typeof parsed.utm_campaign === 'string' ? parsed.utm_campaign : null,
      utm_content: typeof parsed.utm_content === 'string' ? parsed.utm_content : null,
    });
    return {
      ...parsedAttr,
      referrer: sanitizeReferrer(typeof parsed.referrer === 'string' ? parsed.referrer : null),
    };
  } catch {
    return emptyAttribution();
  }
}

export function readBrowserCookies(): Attribution {
  if (typeof document === 'undefined') return emptyAttribution();
  const parts = document.cookie.split(';');
  let ref: string | null = null;
  let attr = emptyAttribution();
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (name === REF_COOKIE) ref = sanitizeRef(value);
    if (name === ATTR_COOKIE) attr = parseAttrCookie(value);
  }
  return { ...attr, ref: ref || attr.ref };
}

function cookieFlags(maxAge: number, secure: boolean): string {
  return `Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Set-Cookie values that persist first-touch UTMs and the ref code. */
export function attributionSetCookies(
  attr: Attribution,
  secure: boolean,
  maxAge = ATTRIBUTION_COOKIE_MAX_AGE,
): string[] {
  const cookies: string[] = [];
  if (attr.ref) {
    cookies.push(`${REF_COOKIE}=${encodeURIComponent(attr.ref)}; ${cookieFlags(maxAge, secure)}`);
  }
  if (attr.utm_source || attr.utm_medium || attr.utm_campaign || attr.utm_content || attr.referrer) {
    cookies.push(
      `${ATTR_COOKIE}=${encodeURIComponent(serializeAttrCookie(attr))}; ${cookieFlags(maxAge, secure)}`,
    );
  }
  return cookies;
}

/** First-touch referrer from this document, or empty attribution. */
export function documentReferrerAttribution(currentOrigin?: string | null): Attribution {
  if (typeof document === 'undefined') return emptyAttribution();
  const origin =
    currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : null);
  return { ...emptyAttribution(), referrer: sanitizeReferrer(document.referrer, origin) };
}

export function writeBrowserCookies(attr: Attribution): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:';
  for (const cookie of attributionSetCookies(attr, secure)) {
    document.cookie = cookie;
  }
}

function trafficChannelProperties(attr: Attribution): Record<string, string> {
  if (!flags.aiReferrerAttribution()) return {};
  const channel = classifyTrafficChannel({
    utmSource: attr.utm_source,
    utmMedium: attr.utm_medium,
    referrer: attr.referrer,
  });
  return channel ? { [TRAFFIC_CHANNEL_PROPERTY]: channel } : {};
}

/** PostHog set-once person properties. No email, name or other PII. */
export function attributionPersonProperties(attr: Attribution): Record<string, string> {
  const props: Record<string, string> = {};
  if (attr.utm_source) {
    props.utm_source = attr.utm_source;
    props.$initial_utm_source = attr.utm_source;
  }
  if (attr.utm_medium) {
    props.utm_medium = attr.utm_medium;
    props.$initial_utm_medium = attr.utm_medium;
  }
  if (attr.utm_campaign) {
    props.utm_campaign = attr.utm_campaign;
    props.$initial_utm_campaign = attr.utm_campaign;
  }
  if (attr.utm_content) {
    props.utm_content = attr.utm_content;
    props.$initial_utm_content = attr.utm_content;
  }
  if (attr.ref) {
    props.ref = attr.ref;
    props.initial_ref = attr.ref;
  }
  if (attr.referrer) {
    props.referrer = attr.referrer;
    props.$initial_referrer = attr.referrer;
  }
  const channel = trafficChannelProperties(attr);
  if (channel[TRAFFIC_CHANNEL_PROPERTY]) {
    props[TRAFFIC_CHANNEL_PROPERTY] = channel[TRAFFIC_CHANNEL_PROPERTY];
    props[INITIAL_TRAFFIC_CHANNEL_PROPERTY] = channel[TRAFFIC_CHANNEL_PROPERTY];
  }
  return props;
}

export function attributionMetadata(attr: Attribution): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    if (attr[key]) data[key] = attr[key] as string;
  }
  if (attr.ref) data.ref = attr.ref;
  Object.assign(data, trafficChannelProperties(attr));
  return data;
}

export function doNotTrackEnabled(
  nav: { doNotTrack?: string | null; msDoNotTrack?: string | null } | null | undefined,
  windowDnt?: string | null,
): boolean {
  if (!nav) return false;
  const flags = [nav.doNotTrack, nav.msDoNotTrack, windowDnt];
  return flags.some((v) => v === '1' || v === 'yes');
}
