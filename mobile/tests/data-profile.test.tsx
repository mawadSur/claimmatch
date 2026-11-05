import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { shared } from '@/copy/shared';
import { MATCHER_QUESTIONS } from '@shared/lib/profile-attributes';

import { fetchProfile, MATCHER_KEYS, PROFILE_COLUMNS, useDeleteAccount, useProfile, useSaveSettings } from '@/data/profile';
import { cancelAllReminders } from '@/lib/reminders';

type Call = { method: string; args: unknown[] };

const mockDb: { calls: Call[]; result: { data: unknown; error: unknown; status: number } } = {
  calls: [],
  result: { data: null, error: null, status: 200 },
};

/** PostgREST's answer to a select: plain columns, and `alias:attributes->key` paths into the stored attributes. */
function mockSelected(row: unknown, columns: string | undefined): unknown {
  if (!row || typeof row !== 'object' || !columns) return row;
  const stored = row as Record<string, unknown>;
  return Object.fromEntries(
    columns.split(',').map((column) => {
      const [alias, path] = column.trim().split(':');
      const key = path?.split('->')[1];
      return [alias, key ? ((stored.attributes as Record<string, unknown> | null)?.[key] ?? null) : stored[alias]];
    }),
  );
}

function mockBuilder() {
  const builder: Record<string, unknown> = {};
  let columns: string | undefined;
  for (const method of ['select', 'eq', 'setHeader', 'abortSignal', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      mockDb.calls.push({ method, args });
      if (method === 'select') columns = args[0] as string;
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ ...mockDb.result, data: mockSelected(mockDb.result.data, columns) }).then(resolve, reject);
  return builder;
}

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      mockDb.calls.push({ method: 'from', args: [table] });
      return mockBuilder();
    },
  }),
}));

const mockFetch = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      refreshAccessToken: async () => ({ status: 'ok', token: 'token-2', userId: 'user-1' }),
      signOutLocally: async () => undefined,
    },
  });
  return { ...actual, getApi: () => client };
});

const mockAuth: { status: string; user: { id: string } | null } = { status: 'signedIn', user: { id: 'user-1' } };
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

jest.mock('@/lib/reminders', () => ({
  reminderEpoch: () => 0,
  syncReminders: jest.fn(async () => ({ status: 'off' })),
  cancelAllReminders: jest.fn(async () => undefined),
}));

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

const storedProfile = {
  full_name: 'Ana Diaz',
  state: 'CA',
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  attributes: { owns_vehicle: true, vehicle_brands: ['Ford'], took_medication: true },
  email_opt_in: true,
  onboarded: true,
  prefill_consent_at: null,
  match_metrics_consent_at: null,
  referral_code: 'ANA123',
};

function setup() {
  // Infinite gcTime: no garbage-collection timers outlive the test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper };
}

beforeEach(() => {
  mockDb.calls = [];
  mockDb.result = { data: null, error: null, status: 200 };
  mockFetch.mockReset();
  (cancelAllReminders as jest.Mock).mockClear();
  mockAuth.status = 'signedIn';
  mockAuth.user = { id: 'user-1' };
});

describe('profile read', () => {
  it('reads the own profile row, only the matcher answers of its attributes, and never a health answer', async () => {
    mockDb.result.data = storedProfile;
    const profile = await fetchProfile('user-1');

    expect(MATCHER_KEYS).toEqual(MATCHER_QUESTIONS.map((question) => question.key));
    // Safe in a PostgREST select, and never the health question.
    for (const key of MATCHER_KEYS) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(PROFILE_COLUMNS.split(', ')).toEqual([
      'full_name',
      'state',
      'phone',
      'address_line1',
      'address_line2',
      'city',
      ...MATCHER_KEYS.map((key) => `answer_${key}:attributes->${key}`),
      'email_opt_in',
      'onboarded',
      'prefill_consent_at',
      'match_metrics_consent_at',
      'referral_code',
    ]);
    expect(PROFILE_COLUMNS).not.toMatch(/(^|, )attributes(,|$)/);
    expect(PROFILE_COLUMNS).not.toContain('took_medication');

    expect(mockDb.calls.map((call) => call.method)).toEqual(['from', 'select', 'eq', 'setHeader', 'maybeSingle']);
    expect(mockDb.calls[0].args).toEqual(['profiles']);
    expect(mockDb.calls[1].args).toEqual([PROFILE_COLUMNS]);
    expect(mockDb.calls[2].args).toEqual(['id', 'user-1']);
    // Personal data: kept out of the platform HTTP cache on disk.
    expect(mockDb.calls[3].args).toEqual(['Cache-Control', 'no-store']);
    expect(profile?.attributes).toEqual({ owns_vehicle: true, vehicle_brands: ['Ford'] });
    expect(profile).toMatchObject({ full_name: 'Ana Diaz', referral_code: 'ANA123' });
    expect(profile).not.toHaveProperty('answer_owns_vehicle');
  });

  it('reads a profile without attributes as no answers', async () => {
    mockDb.result.data = { ...storedProfile, attributes: null };
    await expect(fetchProfile('user-1')).resolves.toMatchObject({ attributes: {} });
  });

  it('is null before the profile row exists, and an error when the read fails', async () => {
    await expect(fetchProfile('user-1')).resolves.toBeNull();

    mockDb.result = { data: null, error: { code: '42501' }, status: 403 };
    await expect(fetchProfile('user-1')).rejects.toMatchObject({ name: 'ApiRequestError', status: 403 });

    mockDb.result = { data: { ...storedProfile, onboarded: 'yes' }, error: null, status: 200 };
    await expect(fetchProfile('user-1')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('caches it under ["profile", userId] and only while signed in', async () => {
    mockDb.result.data = storedProfile;
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const query = useProfile();
        return { data: query.data, isSuccess: query.isSuccess };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['profile', 'user-1'])).toBe(result.current.data);
    client.clear();

    mockAuth.status = 'signedOut';
    mockAuth.user = null;
    mockDb.calls = [];
    const signedOut = setup();
    await renderHook(() => useProfile().fetchStatus, { wrapper: signedOut.wrapper });
    expect(mockDb.calls).toEqual([]);
    signedOut.client.clear();
  });
});

describe('useSaveSettings', () => {
  it('refuses input the server would refuse, with its message, without sending', async () => {
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useSaveSettings(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync({ phone: 'call me' }).catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({
      code: 'invalid_input',
      status: 400,
      message: 'Use only numbers, spaces and + - ( ) in your phone number.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
    client.clear();
  });

  it('posts the settings without any health answer and reloads profile, dashboard and claims', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { client, wrapper } = setup();
    client.setQueryData(['profile', 'user-1'], storedProfile);
    client.setQueryData(['dashboard'], { cached: true });
    client.setQueryData(['claim', 'acme'], { kind: 'closed' });
    client.setQueryData(['catalog'], []);
    const { result } = await renderHook(() => useSaveSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        full_name: 'Ana María Díaz',
        onboarded: true,
        attributes: { owns_vehicle: true, vehicle_brands: ['Ford'], took_medication: false },
      });
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/settings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      full_name: 'Ana María Díaz',
      onboarded: true,
      attributes: { owns_vehicle: true, vehicle_brands: ['Ford'] },
    });
    expect(client.getQueryState(['profile', 'user-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['claim', 'acme'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['catalog'])?.isInvalidated).toBe(false);
    client.clear();
  });

  it('shows the server error text when saving fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: 'We couldn’t save your settings. Please try again.' }));
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useSaveSettings(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync({ email_opt_in: false }).catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({ status: 500, message: 'We couldn’t save your settings. Please try again.' });
    client.clear();
  });
});

describe('useDeleteAccount', () => {
  it('sends nothing unless DELETE was typed', async () => {
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync({ confirm: 'delete' }).catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({ code: 'invalid_input', message: shared.typeDeleteToConfirm.text });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(cancelAllReminders).not.toHaveBeenCalled();
    client.clear();
  });

  it('posts {confirm: "DELETE"} and cancels the reminders', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ confirm: 'DELETE' });
    });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/account/delete');
    expect(init.body).toBe('{"confirm":"DELETE"}');
    expect(cancelAllReminders).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('keeps the reminders when the server could not delete the account', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: 'Could not finish deleting the account.' }));
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync({ confirm: 'DELETE' }).catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({ status: 500, message: 'Could not finish deleting the account.' });
    expect(cancelAllReminders).not.toHaveBeenCalled();
    client.clear();
  });
});
