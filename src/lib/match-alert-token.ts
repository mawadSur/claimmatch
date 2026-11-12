/**
 * Signed, single-use, expiring tokens for match-alert "Start this claim" links.
 * The raw token is put in the URL; only a SHA-256 hash is stored.
 *
 * Format: base64url(json payload).base64url(hmac-sha256).
 * Payload: { v:1, e:email, l:lawsuitId, x:expUnix, n:nonce }.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const MATCH_ALERT_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
export const MATCH_ALERT_TOKEN_PARAM = 't';
export const MATCH_ALERT_START_PATH = '/match-alert/start';
export const MATCH_ALERT_START_API_PATH = '/api/match-alert/start';

const MAX_TOKEN_LENGTH = 800;

export type MatchAlertTokenError =
  | 'missing'
  | 'too_long'
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'not_an_email';

export type ParsedMatchAlertToken =
  | { ok: true; email: string; lawsuitId: string; expiresAt: Date; nonce: string }
  | { ok: false; error: MatchAlertTokenError };

export interface IssuedMatchAlertToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(body: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(body) || body.length % 4 === 1) return null;
  const padded = body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4);
  try {
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

/** HMAC secret: MATCH_ALERT_TOKEN_SECRET, else CRON_SECRET. */
export function matchAlertSigningSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const dedicated = env.MATCH_ALERT_TOKEN_SECRET?.trim();
  if (dedicated) return dedicated;
  const cron = env.CRON_SECRET?.trim();
  return cron || null;
}

export function hashMatchAlertToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function signPayload(payload: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(payload, 'utf8').digest());
}

function signaturesMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const EMAIL_SHAPE = /^[^\s@",()<>[\]\\;:]+@[^\s@",()<>[\]\\;:]+\.[^\s@",()<>[\]\\;:]+$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAlertEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function issueMatchAlertToken(input: {
  email: string;
  lawsuitId: string;
  now?: Date;
  ttlMs?: number;
  secret: string;
  nonce?: string;
}): IssuedMatchAlertToken {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? MATCH_ALERT_TOKEN_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const email = normalizeAlertEmail(input.email);
  const payload = JSON.stringify({
    v: 1,
    e: email,
    l: input.lawsuitId,
    x: Math.floor(expiresAt.getTime() / 1000),
    n: input.nonce ?? randomBytes(16).toString('hex'),
  });
  const body = toBase64Url(Buffer.from(payload, 'utf8'));
  const token = `${body}.${signPayload(body, input.secret)}`;
  return { token, tokenHash: hashMatchAlertToken(token), expiresAt };
}

export function parseMatchAlertToken(
  raw: unknown,
  secret: string,
  now: Date = new Date(),
): ParsedMatchAlertToken {
  if (typeof raw !== 'string') return { ok: false, error: 'missing' };
  const token = raw.trim();
  if (!token) return { ok: false, error: 'missing' };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, error: 'too_long' };
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return { ok: false, error: 'malformed' };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return { ok: false, error: 'malformed' };
  const expected = signPayload(body, secret);
  if (!signaturesMatch(sig, expected)) return { ok: false, error: 'bad_signature' };
  const bytes = fromBase64Url(body);
  if (!bytes) return { ok: false, error: 'malformed' };
  let parsed: { v?: unknown; e?: unknown; l?: unknown; x?: unknown; n?: unknown };
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as typeof parsed;
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (parsed.v !== 1) return { ok: false, error: 'malformed' };
  if (typeof parsed.e !== 'string' || !EMAIL_SHAPE.test(parsed.e) || parsed.e.length > 254) {
    return { ok: false, error: 'not_an_email' };
  }
  if (typeof parsed.l !== 'string' || !UUID_SHAPE.test(parsed.l)) {
    return { ok: false, error: 'malformed' };
  }
  if (typeof parsed.x !== 'number' || !Number.isFinite(parsed.x)) {
    return { ok: false, error: 'malformed' };
  }
  if (typeof parsed.n !== 'string' || parsed.n.length < 8) {
    return { ok: false, error: 'malformed' };
  }
  const expiresAt = new Date(parsed.x * 1000);
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, error: 'expired' };
  return {
    ok: true,
    email: normalizeAlertEmail(parsed.e),
    lawsuitId: parsed.l.toLowerCase(),
    expiresAt,
    nonce: parsed.n,
  };
}

export function matchAlertStartPath(token: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}${MATCH_ALERT_START_PATH}?${MATCH_ALERT_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}
