/**
 * First-touch campaign attribution: utm_source, utm_medium, utm_campaign,
 * utm_content and a `ref` code. Existing values win so a later click never
 * overwrites the first one.
 */

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
}

export const EMPTY_ATTRIBUTION: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  ref: null,
};

const UTM_SAFE = /[^a-zA-Z0-9._:-]/g;
const REF_SAFE = /[^a-zA-Z0-9_-]/g;

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
  return Boolean(attr.ref || attr.utm_source || attr.utm_medium || attr.utm_campaign || attr.utm_content);
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
  });
}

export function parseAttrCookie(raw: string | null | undefined): Attribution {
  if (!raw) return emptyAttribution();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseAttribution({
      utm_source: typeof parsed.utm_source === 'string' ? parsed.utm_source : null,
      utm_medium: typeof parsed.utm_medium === 'string' ? parsed.utm_medium : null,
      utm_campaign: typeof parsed.utm_campaign === 'string' ? parsed.utm_campaign : null,
      utm_content: typeof parsed.utm_content === 'string' ? parsed.utm_content : null,
    });
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
  if (attr.utm_source || attr.utm_medium || attr.utm_campaign || attr.utm_content) {
    cookies.push(
      `${ATTR_COOKIE}=${encodeURIComponent(serializeAttrCookie(attr))}; ${cookieFlags(maxAge, secure)}`,
    );
  }
  return cookies;
}

export function writeBrowserCookies(attr: Attribution): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:';
  for (const cookie of attributionSetCookies(attr, secure)) {
    document.cookie = cookie;
  }
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
  return props;
}

export function attributionMetadata(attr: Attribution): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    if (attr[key]) data[key] = attr[key] as string;
  }
  if (attr.ref) data.ref = attr.ref;
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
