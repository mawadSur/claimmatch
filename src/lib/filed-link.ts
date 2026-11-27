/**
 * Signed, expiring one-click "I filed this claim" links for the 24-hour
 * did-you-file email. GET is confirm-only; POST applies reported_filed.
 *
 * Format: base64url(json payload).base64url(hmac-sha256).
 * Payload: { v:1, u:userId, l:lawsuitId, c:claimId, x:expUnix, n:nonce }.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { matchAlertSigningSecret } from '@/lib/match-alert-token';

export const FILED_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const FILED_TOKEN_PARAM = 't';
export const FILED_PATH = '/filed';
export const FILED_API_PATH = '/api/filed';

const MAX_TOKEN_LENGTH = 800;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FiledTokenError = 'missing' | 'too_long' | 'malformed' | 'bad_signature' | 'expired';

export type ParsedFiledToken =
  | { ok: true; userId: string; lawsuitId: string; claimId: string; expiresAt: Date; nonce: string }
  | { ok: false; error: FiledTokenError };

export interface IssuedFiledToken {
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

export function filedSigningSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return matchAlertSigningSecret(env);
}

export function hashFiledToken(token: string): string {
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

export function issueFiledToken(input: {
  userId: string;
  lawsuitId: string;
  claimId: string;
  now?: Date;
  ttlMs?: number;
  secret: string;
  nonce?: string;
}): IssuedFiledToken {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? FILED_TOKEN_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const payload = JSON.stringify({
    v: 1,
    u: input.userId.toLowerCase(),
    l: input.lawsuitId.toLowerCase(),
    c: input.claimId.toLowerCase(),
    x: Math.floor(expiresAt.getTime() / 1000),
    n: input.nonce ?? randomBytes(16).toString('hex'),
  });
  const body = toBase64Url(Buffer.from(payload, 'utf8'));
  const token = `${body}.${signPayload(body, input.secret)}`;
  return { token, tokenHash: hashFiledToken(token), expiresAt };
}

export function parseFiledToken(raw: unknown, secret: string, now: Date = new Date()): ParsedFiledToken {
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
  let parsed: { v?: unknown; u?: unknown; l?: unknown; c?: unknown; x?: unknown; n?: unknown };
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as typeof parsed;
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (parsed.v !== 1) return { ok: false, error: 'malformed' };
  if (typeof parsed.u !== 'string' || !UUID_SHAPE.test(parsed.u)) return { ok: false, error: 'malformed' };
  if (typeof parsed.l !== 'string' || !UUID_SHAPE.test(parsed.l)) return { ok: false, error: 'malformed' };
  if (typeof parsed.c !== 'string' || !UUID_SHAPE.test(parsed.c)) return { ok: false, error: 'malformed' };
  if (typeof parsed.x !== 'number' || !Number.isFinite(parsed.x)) return { ok: false, error: 'malformed' };
  if (typeof parsed.n !== 'string' || parsed.n.length < 8) return { ok: false, error: 'malformed' };
  const expiresAt = new Date(parsed.x * 1000);
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, error: 'expired' };
  return {
    ok: true,
    userId: parsed.u.toLowerCase(),
    lawsuitId: parsed.l.toLowerCase(),
    claimId: parsed.c.toLowerCase(),
    expiresAt,
    nonce: parsed.n,
  };
}

export function filedPageUrl(token: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}${FILED_PATH}?${FILED_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

export type FiledLinkView =
  | { kind: 'confirm'; token: string }
  | { kind: 'done' }
  | { kind: 'invalid' }
  | { kind: 'missing' };

export function hasFiledTokenParam(params: Record<string, string | string[] | undefined>): boolean {
  const raw = params[FILED_TOKEN_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveFiledView(
  params: Record<string, string | string[] | undefined>,
  secret: string | null,
  now: Date = new Date(),
): FiledLinkView {
  if (params.done === '1' || params.done === 'true') return { kind: 'done' };
  const raw = params[FILED_TOKEN_PARAM];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (typeof token !== 'string' || !token.trim()) return { kind: 'missing' };
  if (!secret) return { kind: 'invalid' };
  const parsed = parseFiledToken(token, secret, now);
  if (!parsed.ok) return { kind: 'invalid' };
  return { kind: 'confirm', token: token.trim() };
}
