import {
  AuthApiError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js';

import { common } from '@/copy/common';
import {
  ApiRequestError,
  classifyAuthError,
  createApiClient,
  errorMessageFor,
  supabaseSession,
  unwrap,
  type ApiSession,
  type TokenResult,
} from '@/lib/api';

const BASE = 'https://lawsuitai.test';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

interface FakeSession extends ApiSession {
  getAccessToken: jest.Mock<Promise<TokenResult>, []>;
  refreshAccessToken: jest.Mock<Promise<TokenResult>, []>;
  signOutLocally: jest.Mock<Promise<void>, []>;
}

const USER = 'user-1';

/** A session holding `token` for USER; refreshing swaps in `refreshed` (or fails). */
function fakeSession(
  token: string | null,
  refreshed: TokenResult = { status: 'ok', token: 'fresh-token', userId: USER },
): FakeSession {
  let current: TokenResult = token ? { status: 'ok', token, userId: USER } : { status: 'none' };
  return {
    getAccessToken: jest.fn(async () => current),
    refreshAccessToken: jest.fn(async () => {
      if (refreshed.status === 'ok') current = refreshed;
      return refreshed;
    }),
    signOutLocally: jest.fn(async () => {
      current = { status: 'none' };
    }),
  };
}

function authHeader(fetchMock: jest.Mock, call: number): string | undefined {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

describe('createApiClient', () => {
  it('sends a JSON request with the bearer token to the API base', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { claim: { id: 'c1' } }));
    const api = createApiClient({ baseUrl: `${BASE}/`, session: fakeSession('token-1'), fetch: fetchMock });

    const result = await api.request('/api/claims', { body: { lawsuit_id: 'l1', intent: 'track' } });

    expect(result).toEqual({ ok: true, status: 200, data: { claim: { id: 'c1' } } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/claims`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"lawsuit_id":"l1","intent":"track"}');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  });

  it('on a 401, refreshes once and retries with the new token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const session = fakeSession('stale-token');
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/mobile/dashboard');

    expect(result).toEqual({ ok: true, status: 200, data: { ok: true } });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.signOutLocally).not.toHaveBeenCalled();
    expect(authHeader(fetchMock, 0)).toBe('Bearer stale-token');
    expect(authHeader(fetchMock, 1)).toBe('Bearer fresh-token');
  });

  it('keeps the session when the retry is still 401 after a good refresh', async () => {
    // Supabase Auth has just confirmed the session, so the API failed to check it (for example an outage).
    const fetchMock = jest.fn(async () => jsonResponse(401, { error: 'Please log in again.' }));
    const session = fakeSession('token-1');
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/mobile/dashboard');

    expect(result).toEqual({
      ok: false,
      status: 401,
      code: 'session_rejected',
      error: common.genericError.text,
      loggedOut: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.signOutLocally).not.toHaveBeenCalled();
  });

  it('signs out on this device, without retrying, when Supabase Auth rejects the refresh', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-1', { status: 'invalid' });
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/settings', { body: { full_name: 'Ana' } });

    expect(result).toEqual({ ok: false, status: 401, code: 'logged_out', error: common.loggedOut.text, loggedOut: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.signOutLocally).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails for a temporary reason such as a rate limit', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-1', { status: 'unavailable' });
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/mobile/dashboard');

    expect(result).toEqual({ ok: false, status: 0, code: 'session_error', error: common.genericError.text, loggedOut: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.signOutLocally).not.toHaveBeenCalled();
  });

  it('does not sign out again when the session was already removed during the request', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-1');
    session.getAccessToken
      .mockResolvedValueOnce({ status: 'ok', token: 'token-1', userId: USER })
      .mockResolvedValueOnce({ status: 'none' });
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/mobile/dashboard');

    expect(result).toEqual({ ok: false, status: 401, code: 'logged_out', error: common.loggedOut.text, loggedOut: false });
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(session.signOutLocally).not.toHaveBeenCalled();
  });

  it('never resends a request with the token of an account that signed in meanwhile', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-a');
    session.getAccessToken
      .mockResolvedValueOnce({ status: 'ok', token: 'token-a', userId: 'user-a' })
      .mockResolvedValueOnce({ status: 'ok', token: 'token-b', userId: 'user-b' });
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/settings', { body: { phone: '555-0100' } });

    expect(result).toEqual({ ok: false, status: 401, code: 'logged_out', error: common.loggedOut.text, loggedOut: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.signOutLocally).not.toHaveBeenCalled();
  });

  it('does not retry when the refresh comes back for another account', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-a', { status: 'ok', token: 'token-b', userId: 'user-b' });
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/settings', { body: { phone: '555-0100' } });

    expect(result).toMatchObject({ ok: false, code: 'logged_out', loggedOut: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a failure instead of rejecting when the session cannot be read or refreshed', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const unreadable = fakeSession('token-1');
    unreadable.getAccessToken.mockRejectedValue(new Error('AsyncStorage is unavailable'));
    const failingRefresh = fakeSession('token-1');
    failingRefresh.refreshAccessToken.mockRejectedValue(new Error('SecureStore write failed'));

    const read = await createApiClient({ baseUrl: BASE, session: unreadable, fetch: fetchMock }).request('/api/mobile/dashboard');
    const refreshed = await createApiClient({ baseUrl: BASE, session: failingRefresh, fetch: fetchMock }).request(
      '/api/mobile/dashboard',
    );

    expect(read).toEqual({ ok: false, status: 0, code: 'session_error', error: common.genericError.text, loggedOut: false });
    expect(refreshed).toEqual({ ok: false, status: 0, code: 'session_error', error: common.genericError.text, loggedOut: false });
    expect(unreadable.signOutLocally).not.toHaveBeenCalled();
    expect(failingRefresh.signOutLocally).not.toHaveBeenCalled();
  });

  it('returns the network message, and keeps the session, when the refresh cannot reach Supabase', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-1', { status: 'offline' });
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/mobile/dashboard');

    expect(result).toEqual({ ok: false, status: 0, code: 'network', error: common.networkError.text, loggedOut: false });
    expect(session.signOutLocally).not.toHaveBeenCalled();
  });

  it('maps a failed fetch to the web network message', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const session = fakeSession('token-1');
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/claims/abc', { method: 'PATCH', body: { action: 'report_filed' } });

    expect(result).toEqual({
      ok: false,
      status: 0,
      code: 'network',
      error: "We couldn't reach ClaimMatch. Check your internet connection and try again.",
      loggedOut: false,
    });
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(() => unwrap(result)).toThrow(ApiRequestError);
  });

  it('treats a hung request as a network error after the timeout', async () => {
    const fetchMock = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const api = createApiClient({ baseUrl: BASE, session: fakeSession('token-1'), fetch: fetchMock, timeoutMs: 10 });

    await expect(api.request('/api/mobile/dashboard')).resolves.toMatchObject({ status: 0, code: 'network' });
  });

  it('treats a body that stops downloading as a network error', async () => {
    const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const stalled = new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
      return { ok: true, status: 200, text: () => stalled } as unknown as Response;
    });
    const api = createApiClient({ baseUrl: BASE, session: fakeSession('token-1'), fetch: fetchMock, timeoutMs: 10 });

    await expect(api.request('/api/mobile/dashboard')).resolves.toMatchObject({ ok: false, status: 0, code: 'network' });
  });

  it('shares one refresh between concurrent 401s', async () => {
    const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer fresh-token' ? jsonResponse(200, { ok: true }) : jsonResponse(401, {});
    });
    const session = fakeSession('stale-token');
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const results = await Promise.all([api.request('/api/mobile/dashboard'), api.request('/api/mobile/claim/x')]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('shows server error text as sent, except the two "Refresh the page" codes', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(409, { code: 'claim_changed', error: 'This claim just changed, maybe in another tab. Refresh the page and try again.' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(409, { code: 'not_allowed', error: "That change isn't possible for this claim. Refresh the page and try again." }),
      )
      .mockResolvedValueOnce(
        jsonResponse(409, { code: 'settlement_closed', error: 'This settlement is closed to new claims. Check the official site to be sure.' }),
      )
      .mockResolvedValueOnce(jsonResponse(500, undefined));
    const api = createApiClient({ baseUrl: BASE, session: fakeSession('token-1'), fetch: fetchMock });

    const changed = await api.request('/api/claims/1', { method: 'PATCH', body: {} });
    const notAllowed = await api.request('/api/claims/1', { method: 'PATCH', body: {} });
    const closed = await api.request('/api/claims', { body: {} });
    const crashed = await api.request('/api/claims', { body: {} });

    expect(changed).toMatchObject({ status: 409, code: 'claim_changed', error: common.claimChanged.text });
    expect(notAllowed).toMatchObject({ status: 409, code: 'not_allowed', error: common.notAllowed.text });
    expect(closed).toMatchObject({
      status: 409,
      error: 'This settlement is closed to new claims. Check the official site to be sure.',
    });
    expect(crashed).toMatchObject({ status: 500, code: null, error: common.genericError.text });
  });

  it.each([
    // The planner's specific refusals (src/lib/claims.ts) show as sent: they say what to do instead.
    'This claim already has a confirmation number. You can correct it instead.',
    'Tell us you filed first. Then you can add your confirmation number.',
    "A claim with a confirmation number can't be undone. You can correct the number instead.",
  ])('shows the specific not_allowed text "%s" as sent', (text) => {
    expect(errorMessageFor('not_allowed', text)).toBe(text);
  });

  it('rewords only the texts that say "Refresh the page", and fills in a missing one', () => {
    expect(errorMessageFor('not_allowed', 'That change isn’t possible. Refresh the page and try again.')).toBe(
      common.notAllowed.text,
    );
    expect(errorMessageFor('claim_changed', 'This claim just changed, maybe in another tab. Refresh the page and try again.')).toBe(
      common.claimChanged.text,
    );
    expect(errorMessageFor('not_allowed', null)).toBe(common.notAllowed.text);
    expect(errorMessageFor('claim_changed', null)).toBe(common.claimChanged.text);
    expect(errorMessageFor('claim_changed', 'Someone else changed it. Try again.')).toBe('Someone else changed it. Try again.');
    expect(errorMessageFor(null, null)).toBe(common.genericError.text);
  });

  it('sends public requests without a token and never refreshes them', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, {}));
    const session = fakeSession('token-1');
    const api = createApiClient({ baseUrl: BASE, session, fetch: fetchMock });

    const result = await api.request('/api/mobile/config', { auth: false });

    expect(result).toMatchObject({ ok: false, status: 401, loggedOut: false });
    expect(authHeader(fetchMock, 0)).toBeUndefined();
    expect(session.getAccessToken).not.toHaveBeenCalled();
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('fails a 2xx response that does not match the expected shape', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { apiVersion: 'one' }));
    const api = createApiClient({ baseUrl: BASE, session: fakeSession(null), fetch: fetchMock });

    const result = await api.request('/api/mobile/config', {
      auth: false,
      parse: (json) => {
        if (typeof (json as { apiVersion?: unknown }).apiVersion !== 'number') throw new Error('bad shape');
        return json;
      },
    });

    expect(result).toMatchObject({ ok: false, status: 200, code: 'invalid_response', error: common.genericError.text });
  });

  it('refuses paths that could send the token to another host', async () => {
    const api = createApiClient({ baseUrl: BASE, session: fakeSession('token-1'), fetch: jest.fn() });
    await expect(api.request('https://evil.example/api')).rejects.toThrow();
    await expect(api.request('//evil.example/api')).rejects.toThrow();
  });
});

describe('classifyAuthError', () => {
  it.each([
    ['a network failure', new AuthRetryableFetchError('Failed to fetch', 0), 'offline'],
    ['a Supabase Auth 503', new AuthRetryableFetchError('Service Unavailable', 503), 'offline'],
    ['a rate limit (not retryable in auth-js)', new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'), 'unavailable'],
    ['an unexpected answer', new AuthUnknownError('Unexpected token <', new SyntaxError('bad json')), 'unavailable'],
    ['a refresh discarded by the commit guard', new AuthRefreshDiscardedError(), 'unavailable'],
    ['a revoked refresh token', new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'), 'invalid'],
    ['a reused refresh token', new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used'), 'invalid'],
    ['a banned user', new AuthApiError('User is banned', 403, 'user_banned'), 'invalid'],
    ['a missing session (also session_not_found)', new AuthSessionMissingError(), 'invalid'],
  ])('treats %s as %s', (_label, error, expected) => {
    expect(classifyAuthError(error)).toBe(expected);
  });
});

describe('supabaseSession', () => {
  const session = { access_token: 'token-1', user: { id: USER } };

  function fakeAuth() {
    return {
      getSession: jest.fn(async () => ({ data: { session }, error: null })),
      refreshSession: jest.fn(async () => ({ data: { session: null, user: null }, error: new AuthRefreshDiscardedError() })),
    };
  }

  it('returns the token with the user it belongs to', async () => {
    const auth = fakeAuth();
    const api = supabaseSession(auth as never, jest.fn());
    await expect(api.getAccessToken()).resolves.toEqual({ status: 'ok', token: 'token-1', userId: USER });
  });

  it('uses the stored session when a concurrent change discarded the refresh', async () => {
    const auth = fakeAuth();
    const api = supabaseSession(auth as never, jest.fn());
    await expect(api.refreshAccessToken()).resolves.toEqual({ status: 'ok', token: 'token-1', userId: USER });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('signs out through the given local sign-out', async () => {
    const signOut = jest.fn(async () => ({ error: null }));
    await supabaseSession(fakeAuth() as never, signOut).signOutLocally();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
