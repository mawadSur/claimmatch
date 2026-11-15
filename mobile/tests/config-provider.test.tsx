import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { TokenResult } from '@/lib/api';
import { ConfigProvider, useConfig } from '@/providers/ConfigProvider';

// GET /api/mobile/config with the app's bearer token when signed in: in
// one-click test mode the server turns ONE_CLICK_FILING_ENABLED on for an
// INTERNAL_EMAILS tester only (src/lib/filing/one-click-access.ts). The app
// reads the config again on sign-in, sign-out and an account switch.

const mockAuth: { userId: string | null | undefined; token: TokenResult } = {
  userId: undefined,
  token: { status: 'none' },
};
/** The server: one-click on only for the tester's token. */
const mockServer = { authHeaders: [] as (string | undefined)[], failWith: null as number | null };

jest.mock('@/providers/AuthProvider', () => ({ useAuthUserId: () => mockAuth.userId }));
jest.mock('@/lib/clock', () => ({ recordServerTime: () => undefined }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const api = actual.createApiClient({
    baseUrl: 'https://api.test',
    session: {
      getAccessToken: async () => mockAuth.token,
      refreshAccessToken: async () => mockAuth.token,
      signOutLocally: async () => undefined,
    },
    fetch: async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      mockServer.authHeaders.push(auth);
      const body = {
        apiVersion: 1,
        serverTime: '2026-11-15T12:00:00.000Z',
        flags: { ONE_CLICK_FILING_ENABLED: auth === 'Bearer tester-token', VERIFIED_FIELDS_ENABLED: true },
      };
      const status = mockServer.failWith ?? 200;
      return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
    },
  });
  return { ...actual, getApi: () => api };
});

const TESTER: TokenResult = { status: 'ok', token: 'tester-token', userId: 'tester' };
const MEMBER: TokenResult = { status: 'ok', token: 'member-token', userId: 'member' };

let client: QueryClient;

beforeEach(() => {
  mockAuth.userId = undefined;
  mockAuth.token = { status: 'none' };
  mockServer.authHeaders = [];
  mockServer.failWith = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => client.clear());

async function renderConfig() {
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ConfigProvider>{children}</ConfigProvider>
      </QueryClientProvider>
    );
  }
  const view = await renderHook(
    () => {
      const config = useConfig();
      return { status: config.status, oneClick: config.isFlagOn('ONE_CLICK_FILING_ENABLED') };
    },
    { wrapper },
  );
  return view;
}

describe('ConfigProvider and the signed-in account', () => {
  it('sends the tester’s token, so test mode turns one-click on in the app', async () => {
    mockAuth.token = TESTER;
    const { result } = await renderConfig();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.oneClick).toBe(true);
    expect(mockServer.authHeaders).toEqual(['Bearer tester-token']);
  });

  it('sends no token when signed out, and one-click stays off', async () => {
    const { result } = await renderConfig();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.oneClick).toBe(false);
    expect(mockServer.authHeaders).toEqual([undefined]);
  });

  it('reads once when the stored session is found, then again on sign-in, an account switch and sign-out', async () => {
    const { result, rerender } = await renderConfig();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // The session read finishes: signed out, as the first request already knew. No second read.
    mockAuth.userId = null;
    await rerender({});
    await act(async () => undefined);
    expect(mockServer.authHeaders).toEqual([undefined]);

    mockAuth.token = TESTER;
    mockAuth.userId = 'tester';
    await rerender({});
    await waitFor(() => expect(result.current.oneClick).toBe(true));
    expect(mockServer.authHeaders).toEqual([undefined, 'Bearer tester-token']);

    // A token refresh for the same account changes nothing.
    await rerender({});
    await act(async () => undefined);
    expect(mockServer.authHeaders).toHaveLength(2);

    mockAuth.token = MEMBER;
    mockAuth.userId = 'member';
    await rerender({});
    await waitFor(() => expect(result.current.oneClick).toBe(false));
    expect(mockServer.authHeaders).toEqual([undefined, 'Bearer tester-token', 'Bearer member-token']);

    mockAuth.token = TESTER;
    mockAuth.userId = 'tester';
    await rerender({});
    await waitFor(() => expect(result.current.oneClick).toBe(true));

    mockAuth.token = { status: 'none' };
    mockAuth.userId = null;
    await rerender({});
    await waitFor(() => expect(result.current.oneClick).toBe(false));
    expect(mockServer.authHeaders.at(-1)).toBeUndefined();
  });

  it('keeps every flag off, and the app usable, when the config cannot be read', async () => {
    mockAuth.token = TESTER;
    mockServer.failWith = 503;
    const { result } = await renderConfig();
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.oneClick).toBe(false);
  });
});
