import {
  isAuthApiError,
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { common } from '@/copy/common';

import { requireEnv } from './env';
import { getSupabase, signOutOnThisDevice } from './supabase';

/**
 * Client for the web API (plan 3.2). Every request goes to the API base
 * (default https://lawsuitai.org) with Content-Type: application/json and,
 * unless `auth: false`, the user's Supabase access token as a bearer.
 *
 * On a 401 it refreshes the session once and retries, only for the same user.
 * It signs out on this device only when Supabase Auth says the session is
 * dead (the refresh was rejected). A second 401 after a good refresh, a rate
 * limit or an unreachable Supabase Auth keeps the session and returns a
 * failure the user can retry. A request that cannot reach the server returns
 * the same network message as the web (claim-api.ts). `request` never
 * rejects, except for a path that could leak the token.
 */

export type TokenResult =
  /** A usable access token and the user it belongs to. */
  | { status: 'ok'; token: string; userId: string }
  /** No session on this device. */
  | { status: 'none' }
  /** Supabase Auth rejected the session for good (for example refresh_token_not_found). */
  | { status: 'invalid' }
  /** Supabase Auth could not be reached (network failure, or its 5xx). */
  | { status: 'offline' }
  /** A temporary problem: rate limit, unexpected answer, or a storage error. */
  | { status: 'unavailable' };

/** What the client needs from the auth session. */
export interface ApiSession {
  /** The current access token (Supabase may refresh an expired one first). */
  getAccessToken(): Promise<TokenResult>;
  /** Forces one refresh, after a 401. */
  refreshAccessToken(): Promise<TokenResult>;
  /** Signs out on this device only, keeping web sessions alive. */
  signOutLocally(): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  session: ApiSession;
  fetch?: typeof fetch;
  /** Abort a request that hangs (default 20 s); it then counts as a network error. */
  timeoutMs?: number;
}

export type ApiFailure = {
  ok: false;
  /** HTTP status of the API's answer, or 0 when there is none (network, aborted, session could not be read). */
  status: number;
  /**
   * The server's `code`, or one of: 'network', 'aborted', 'logged_out',
   * 'invalid_response', 'session_error' (the session could not be read or
   * refreshed right now; retry), 'session_rejected' (the API refused a
   * session Supabase Auth had just confirmed; retry).
   */
  code: string | null;
  /** Text to show the user. */
  error: string;
  /** True when this request signed the user out. */
  loggedOut: boolean;
  /**
   * The API's JSON answer (null when empty or not JSON); absent when there was
   * no answer to read (network, aborted, no session). For the extra fields some
   * errors carry, such as the claim screen's `what` or the claims that
   * acknowledge-fictional saved before failing. Never shown as is.
   */
  body?: unknown;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Serialized as JSON. acknowledge-fictional expects `{}`. */
  body?: unknown;
  /** Send the bearer token (default true). Public endpoints such as /api/mobile/config set false. */
  auth?: boolean;
  /** Validates a 2xx JSON body, for example a zod schema's `parse`. Throwing makes the request fail. */
  parse?: (json: unknown) => T;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ApiResult<T>>;
}

/** Web-only advice: the app has no page to refresh. */
const REFRESH_THE_PAGE = /\brefresh\s+the\s+page\b/i;

/**
 * Server error text is shown as sent (plan 3.2, rule 6), except the texts of
 * claim_changed and not_allowed that say "Refresh the page" (src/lib/claims.ts
 * NOT_ALLOWED_MESSAGE, src/lib/claim-input.ts claimWriteFailure), which get
 * the app's "Pull down to refresh" wording. Every other not_allowed text,
 * such as "Tell us you filed first. Then you can add your confirmation
 * number.", is specific and shows as sent.
 */
export function errorMessageFor(code: string | null, serverMessage: string | null): string {
  const pageAdvice = !serverMessage || REFRESH_THE_PAGE.test(serverMessage);
  if (code === 'claim_changed' && pageAdvice) return common.claimChanged.text;
  if (code === 'not_allowed' && pageAdvice) return common.notAllowed.text;
  return serverMessage || common.genericError.text;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** A finished exchange: status plus the parsed JSON body (null when empty or not JSON). */
type Received = { status: number; ok: boolean; json: unknown };
type Sent = ({ kind: 'response' } & Received) | { kind: 'network' } | { kind: 'aborted' };

function failure(status: number, code: string | null, error: string, loggedOut = false): ApiFailure {
  return { ok: false, status, code, error, loggedOut };
}

const networkFailure = (): ApiFailure => failure(0, 'network', common.networkError.text);
const abortedFailure = (): ApiFailure => failure(0, 'aborted', common.networkError.text);
const sessionFailure = (): ApiFailure => failure(0, 'session_error', common.genericError.text);
/** Signed out, but not by this request (no session, or another account signed in meanwhile). */
const notSignedIn = (): ApiFailure => failure(401, 'logged_out', common.loggedOut.text);

function parseJson(text: string): unknown {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function field(json: unknown, name: 'error' | 'code'): string | null {
  if (json && typeof json === 'object' && name in json) {
    const value = (json as Record<string, unknown>)[name];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** A session call that rejects (for example a storage error) is a temporary problem, never a sign-out. */
async function readSession(call: () => Promise<TokenResult>): Promise<TokenResult> {
  try {
    return await call();
  } catch {
    return { status: 'unavailable' };
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { session } = options;

  // Concurrent 401s share one refresh.
  let refreshing: Promise<TokenResult> | null = null;
  function refreshOnce(): Promise<TokenResult> {
    refreshing ??= readSession(() => session.refreshAccessToken()).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function send(url: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Sent> {
    if (signal?.aborted) return { kind: 'aborted' };
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(onAbort, timeoutMs);
    try {
      const response = await doFetch(url, { ...init, signal: controller.signal });
      // The body is read inside the same timeout: a stalled download is a network error too.
      const text = await response.text();
      return { kind: 'response', status: response.status, ok: response.ok, json: parseJson(text) };
    } catch {
      return signal?.aborted ? { kind: 'aborted' } : { kind: 'network' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function signedOutByThisRequest(): Promise<ApiFailure> {
    try {
      await session.signOutLocally();
    } catch {
      // The local session is gone or unreachable either way.
    }
    return failure(401, 'logged_out', common.loggedOut.text, true);
  }

  function toResult<T>({ status, ok, json }: Received, parse: ((json: unknown) => T) | undefined): ApiResult<T> {
    if (ok) {
      if (!parse) return { ok: true, status, data: json as T };
      try {
        return { ok: true, status, data: parse(json) };
      } catch {
        return failure(status, 'invalid_response', common.genericError.text);
      }
    }
    const code = field(json, 'code');
    return { ...failure(status, code, errorMessageFor(code, field(json, 'error'))), body: json };
  }

  /** The answer when no usable token could be had (never signs out). */
  function withoutToken(result: Exclude<TokenResult, { status: 'ok' }>): ApiFailure {
    if (result.status === 'offline') return networkFailure();
    if (result.status === 'unavailable') return sessionFailure();
    return notSignedIn();
  }

  async function request<T = unknown>(path: string, opts: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    // Only same-origin API paths: an absolute or protocol-relative URL would leak the token.
    if (!/^\/(?!\/)/.test(path)) throw new Error(`API path must start with a single "/": ${path}`);
    const url = `${baseUrl}${path}`;
    const useAuth = opts.auth ?? true;
    const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    // A fresh RequestInit per attempt, so a retry never shares headers with the first try.
    const init = (token?: string): RequestInit => ({
      method,
      body,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
    });

    if (!useAuth) {
      const sent = await send(url, init(), opts.signal);
      if (sent.kind === 'aborted') return abortedFailure();
      if (sent.kind === 'network') return networkFailure();
      return toResult(sent, opts.parse);
    }

    const current = await readSession(() => session.getAccessToken());
    if (current.status !== 'ok') return withoutToken(current);

    const first = await send(url, init(current.token), opts.signal);
    if (first.kind === 'aborted') return abortedFailure();
    if (first.kind === 'network') return networkFailure();
    if (first.status !== 401) return toResult(first, opts.parse);

    // 401: use a token another request already refreshed, or refresh once.
    const latest = await readSession(() => session.getAccessToken());
    const refreshedElsewhere = latest.status === 'ok' && latest.token !== current.token;
    const next = refreshedElsewhere || latest.status === 'none' ? latest : await refreshOnce();
    if (next.status === 'invalid') return signedOutByThisRequest();
    if (next.status !== 'ok') return withoutToken(next);
    // Another account signed in meanwhile: never resend this body with its token.
    if (next.userId !== current.userId) return notSignedIn();

    const retry = await send(url, init(next.token), opts.signal);
    if (retry.kind === 'aborted') return abortedFailure();
    if (retry.kind === 'network') return networkFailure();
    // Supabase Auth has just confirmed this session, so a second 401 means the
    // API could not check it (for example a Supabase Auth outage), not a sign-out.
    if (retry.status === 401) return failure(401, 'session_rejected', common.genericError.text);
    return toResult(retry, opts.parse);
  }

  return { request };
}

/** Thrown by `unwrap`, so React Query sees failed requests as errors. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly loggedOut: boolean;
  /** The API's JSON answer (ApiFailure.body), or null. */
  readonly body: unknown;

  constructor(failed: ApiFailure) {
    super(failed.error);
    this.name = 'ApiRequestError';
    this.status = failed.status;
    this.code = failed.code;
    this.loggedOut = failed.loggedOut;
    this.body = failed.body ?? null;
  }
}

/** Returns the data, or throws ApiRequestError (for query functions). */
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.ok) return result.data;
  throw new ApiRequestError(result);
}

/**
 * Sorts an auth-js error. Only a rejection by Supabase Auth itself (400, 401
 * or 403, such as refresh_token_not_found, refresh_token_already_used,
 * session_expired, or session_not_found, which auth-js reports as
 * AuthSessionMissingError) means the session is dead. A rate limit (429 is
 * not retryable in auth-js), an unexpected answer or a discarded refresh is
 * temporary.
 */
export function classifyAuthError(error: unknown): 'invalid' | 'offline' | 'unavailable' {
  if (isAuthRetryableFetchError(error)) return 'offline';
  if (isAuthSessionMissingError(error)) return 'invalid';
  if (isAuthApiError(error) && (error.status === 400 || error.status === 401 || error.status === 403)) return 'invalid';
  return 'unavailable';
}

export function tokenFrom(session: Pick<Session, 'access_token' | 'user'> | null, error: unknown): TokenResult {
  if (error) return { status: classifyAuthError(error) };
  return session ? { status: 'ok', token: session.access_token, userId: session.user.id } : { status: 'none' };
}

/** Connects the client to a Supabase auth session. */
export function supabaseSession(
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'refreshSession'>,
  signOutLocally: () => Promise<unknown>,
): ApiSession {
  return {
    async getAccessToken() {
      const { data, error } = await auth.getSession();
      return tokenFrom(data.session, error);
    },
    async refreshAccessToken() {
      const { data, error } = await auth.refreshSession();
      if (isAuthRefreshDiscardedError(error)) {
        // Storage changed during the refresh (a sign-out, or another refresh that won): use what is stored now.
        const now = await auth.getSession();
        return tokenFrom(now.data.session, now.error);
      }
      return tokenFrom(data.session, error);
    },
    async signOutLocally() {
      await signOutLocally();
    },
  };
}

let shared: ApiClient | null = null;

/** The app's API client. */
export function getApi(): ApiClient {
  shared ??= createApiClient({
    baseUrl: requireEnv().apiBaseUrl,
    session: supabaseSession(getSupabase().auth, signOutOnThisDevice),
  });
  return shared;
}
