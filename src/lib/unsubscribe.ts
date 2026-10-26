/**
 * Unsubscribe links: the token format, how to read it, and the small decisions
 * behind the /unsubscribe page and POST /api/unsubscribe. Pure: no database, no
 * network, no Node-only APIs, so it runs anywhere and is easy to test.
 *
 * Flow. Email footers link to /unsubscribe?e=<token>. Opening that page (or a
 * mail scanner fetching it) changes nothing: the page shows the masked address
 * and a button. The button is a plain form POST to /api/unsubscribe, which
 * turns off profiles.email_opt_in and sends the reader to /unsubscribe?done=1.
 * GET /api/unsubscribe also changes nothing; it redirects to the page.
 *
 * Token formats.
 *  - unsigned-v0 (every email sent so far): the recipient's address as UTF-8,
 *    base64url-encoded without padding. It is not a secret (anyone can make
 *    one), which is why only the confirm POST acts on it.
 *  - signed tokens (a later PR): they will contain a '.', which base64url never
 *    does, so parseUnsubscribeToken can tell the formats apart and verify the
 *    signature here. The page, the API route and the email footer all go
 *    through this module, so changing the format touches only this file. A
 *    one-click List-Unsubscribe (RFC 8058) POST can reuse the API route as is:
 *    it already reads the token from the form body or from the `e` query param.
 *
 * Privacy. A token decodes to an email address. Never log a token, an address
 * or a URL that contains one.
 */
import { SITE } from '@/lib/utils';

export const UNSUBSCRIBE_PAGE_PATH = '/unsubscribe';
export const UNSUBSCRIBE_API_PATH = '/api/unsubscribe';
/** Query and form field that carries the token. */
export const TOKEN_PARAM = 'e';

/** RFC 5321 caps a forward path at 256 octets, so an address fits in 254. */
const MAX_EMAIL_LENGTH = 254;
/** base64url of 254 UTF-8 bytes is 339 characters; allow some slack. */
const MAX_TOKEN_LENGTH = 400;
const BASE64URL_BODY = /^[A-Za-z0-9_-]+$/;
/**
 * One '@', a dot in the domain, no whitespace, and none of the characters that
 * need quoting in an address or in a PostgREST filter value.
 */
const EMAIL_SHAPE = /^[^\s@",()<>[\]\\;:]+@[^\s@",()<>[\]\\;:]+\.[^\s@",()<>[\]\\;:]+$/;
const MASK = String.fromCodePoint(0x2022).repeat(3);

export type UnsubscribeTokenError =
  | 'missing'
  | 'too_long'
  | 'unsupported'
  | 'malformed'
  | 'not_an_email';

export type ParsedUnsubscribeToken =
  | { ok: true; kind: 'unsigned-v0'; email: string }
  | { ok: false; error: UnsubscribeTokenError };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(body: string): Uint8Array {
  const padded =
    body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hasControlCharacter(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** True when `s` looks like an address we could have sent email to. */
export function isPlausibleEmail(s: string): boolean {
  return s.length <= MAX_EMAIL_LENGTH && !hasControlCharacter(s) && EMAIL_SHAPE.test(s);
}

/**
 * The unsigned-v0 token for an address: base64url of its UTF-8 bytes, no
 * padding. Byte for byte what Buffer.from(email).toString('base64url') gives,
 * which is what every email sent so far used.
 */
export function encodeUnsubscribeToken(email: string): string {
  return toBase64Url(new TextEncoder().encode(email));
}

/**
 * Read a token from a link or form. Forgiving about how links get mangled in
 * transit (surrounding whitespace, line breaks, '=' padding, a second round of
 * percent-encoding, the standard base64 alphabet, a '+' turned into a space),
 * strict about the result: it must decode as UTF-8 to one plausible address.
 */
export function parseUnsubscribeToken(raw: unknown): ParsedUnsubscribeToken {
  if (typeof raw !== 'string') return { ok: false, error: 'missing' };
  let token = raw.trim();
  if (!token) return { ok: false, error: 'missing' };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, error: 'too_long' };
  // Signed tokens (a later PR) carry a '.'; none are issued yet.
  if (token.includes('.')) return { ok: false, error: 'unsupported' };

  if (token.includes('%')) {
    try {
      token = decodeURIComponent(token);
    } catch {
      return { ok: false, error: 'malformed' };
    }
  }
  token = token
    .replace(/[\t\r\n]/g, '')
    .replace(/ /g, '+')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/={1,2}$/, '');
  if (!BASE64URL_BODY.test(token) || token.length % 4 === 1) {
    return { ok: false, error: 'malformed' };
  }

  let email: string;
  try {
    email = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(token)).trim();
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (!isPlausibleEmail(email)) return { ok: false, error: 'not_an_email' };
  return { ok: true, kind: 'unsigned-v0', email };
}

/** Absolute link for an email footer: opens the confirm page for `email`. */
export function unsubscribePageUrl(email: string, siteUrl: string = SITE.url): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}${UNSUBSCRIBE_PAGE_PATH}?${TOKEN_PARAM}=${encodeURIComponent(encodeUnsubscribeToken(email))}`;
}

/**
 * Show enough of an address for its owner to recognize it, and no more:
 * "jo•••@example.com". The mask has a fixed length, so it never reveals how
 * long the hidden part is.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return MASK;
  const local = Array.from(email.slice(0, at));
  const domain = email.slice(at + 1).toLowerCase();
  const keep = local.length >= 6 ? 2 : 1;
  return `${local.slice(0, keep).join('')}${MASK}@${domain}`;
}

/**
 * profiles.email values to opt out for a token's address: the address exactly
 * as it was sent (the token was built from the stored value) and its lowercase
 * form (Supabase Auth stores addresses lowercased).
 */
export function emailMatchCandidates(email: string): string[] {
  return Array.from(new Set([email, email.toLowerCase()]));
}

/**
 * Why the opt-out can't be saved, or null when it can. Without the service
 * role key the server client falls back to the anon key, and row-level
 * security would silently skip the update.
 */
export function unsubscribeBackendProblem(env: Record<string, string | undefined>): string | null {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) return 'NEXT_PUBLIC_SUPABASE_URL is not set';
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return 'SUPABASE_SERVICE_ROLE_KEY is not set';
  return null;
}

/** Where POST /api/unsubscribe sends the reader afterwards. */
export type UnsubscribeOutcome = 'done' | 'invalid' | 'failed' | 'busy';

/**
 * Page path for an outcome. A retryable error ('failed', 'busy') reopens the
 * confirm form for the same address so the reader can try again in one tap.
 * The token is always re-encoded from the parsed address, never echoed.
 */
export function unsubscribeResultPath(outcome: UnsubscribeOutcome, email?: string): string {
  if (outcome === 'done') return `${UNSUBSCRIBE_PAGE_PATH}?done=1`;
  if (outcome === 'invalid' || !email) return `${UNSUBSCRIBE_PAGE_PATH}?error=${outcome}`;
  return `${UNSUBSCRIBE_PAGE_PATH}?${TOKEN_PARAM}=${encodeUnsubscribeToken(email)}&error=${outcome}`;
}

/** Where GET /api/unsubscribe (which changes nothing) sends the reader. */
export function pageLocationForGet(raw: string | null): string {
  if (!raw) return UNSUBSCRIBE_PAGE_PATH;
  const parsed = parseUnsubscribeToken(raw);
  if (!parsed.ok) return unsubscribeResultPath('invalid');
  return `${UNSUBSCRIBE_PAGE_PATH}?${TOKEN_PARAM}=${encodeUnsubscribeToken(parsed.email)}`;
}

export type UnsubscribeNotice = 'failed' | 'busy';

/** What the /unsubscribe page shows. */
export type UnsubscribeView =
  | { kind: 'confirm'; token: string; maskedEmail: string; notice?: UnsubscribeNotice }
  | { kind: 'done' }
  | { kind: 'invalid' }
  | { kind: 'failed' }
  | { kind: 'missing' };

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * True when the query string carries a token, valid or not. Even a garbled
 * token can hold most of an address, so the page then clears it from the
 * address bar before analytics loads.
 */
export function hasTokenParam(params: SearchParams): boolean {
  return !!firstParam(params[TOKEN_PARAM]);
}

/** Decide which /unsubscribe view to render from its query string. */
export function resolveUnsubscribeView(params: SearchParams): UnsubscribeView {
  const done = firstParam(params.done);
  const error = firstParam(params.error);
  const raw = firstParam(params[TOKEN_PARAM]);

  if (done === '1') return { kind: 'done' };

  if (raw) {
    const parsed = parseUnsubscribeToken(raw);
    if (!parsed.ok) return { kind: 'invalid' };
    const notice: UnsubscribeNotice | undefined =
      error === 'failed' || error === 'busy' ? error : undefined;
    return {
      kind: 'confirm',
      token: encodeUnsubscribeToken(parsed.email),
      maskedEmail: maskEmail(parsed.email),
      ...(notice ? { notice } : {}),
    };
  }

  if (error === 'invalid') return { kind: 'invalid' };
  // done=0 is what the old GET handler sent for any failure.
  if (error === 'failed' || error === 'busy' || done === '0') return { kind: 'failed' };
  return { kind: 'missing' };
}
