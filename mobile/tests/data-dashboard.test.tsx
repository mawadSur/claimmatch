import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DASHBOARD_REFRESH_DELAY_MS, fetchDashboard, refreshDashboardSoon, useDashboard } from '@/data/dashboard';
import { syncReminders } from '@/lib/reminders';

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

const mockAuth: { status: string } = { status: 'signedIn' };
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

const mockEpoch = { value: 3 };
jest.mock('@/lib/reminders', () => ({
  reminderEpoch: () => mockEpoch.value,
  syncReminders: jest.fn(async () => ({ status: 'scheduled', count: 2 })),
}));

const sync = syncReminders as jest.Mock;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const reminders = [{ claimId: 'c1', slug: 'acme-data-breach', title: 'Acme Data Breach', deadline: '2026-12-01' }];

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    serverTime: '2026-11-02T15:00:00.000Z',
    profile: { firstName: 'Ana', onboarded: true, needsProfile: false },
    claims: {
      failed: false,
      rows: [
        {
          claimId: 'c1',
          title: 'Acme Data Breach',
          label: 'Not filed yet',
          tone: 'amber',
          group: 'needs_filing',
          deadlineText: 'Deadline Dec 1, 2026 · 29 days left',
          nextStep: 'If you qualify, file on the official site before the deadline, then tell us.',
          action: { label: 'How to file', href: '/claim/acme-data-breach' },
        },
      ],
      notices: [
        {
          claimId: 'c2',
          title: 'Old Settlement',
          kind: 'legacy',
          deadline: null,
          deadlinePassed: false,
          filing: 'open',
          officialUrl: null,
        },
      ],
    },
    matches: {
      failed: false,
      strong: [
        {
          id: 'm1',
          slug: 'beta',
          title: 'Beta',
          deadlineText: 'No deadline listed',
          reasons: ['You live in CA'],
          strength: 'strong',
          label: 'Strong match',
          officialUrl: null,
          score: 0.93,
        },
      ],
      possible: [],
      possibleHidden: 0,
    },
    closingSoon: { failed: false, items: [] },
    reminders,
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  sync.mockClear();
  mockAuth.status = 'signedIn';
});

describe('fetchDashboard', () => {
  it('reads GET /api/mobile/dashboard and reschedules the reminders with the epoch from before the request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, dashboard()));
    const data = await fetchDashboard();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.test/api/mobile/dashboard');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(data.profile.firstName).toBe('Ana');
    expect(sync).toHaveBeenCalledWith(reminders, { epoch: 3 });
  });

  it('keeps the scheduled reminders when the claims could not be read', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, dashboard({ claims: { failed: true, rows: [], notices: [] }, reminders: [] })),
    );
    const data = await fetchDashboard();
    expect(data.claims.failed).toBe(true);
    expect(sync).not.toHaveBeenCalled();
  });

  it('never passes a score on, and labels matches only Strong or Possible', async () => {
    const strong = (dashboard().matches as { strong: Record<string, unknown>[] }).strong[0];
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        200,
        dashboard({
          matches: {
            failed: false,
            strong: [strong],
            possible: [{ ...strong, id: 'm2', strength: 'possible', label: '87% match' }],
            possibleHidden: 3,
          },
        }),
      ),
    );
    const data = await fetchDashboard();
    expect(data.matches.strong[0]).not.toHaveProperty('score');
    expect(data.matches.strong[0].label).toBe('Strong match');
    expect(data.matches.possible[0].label).toBe('Possible match');
    expect(data.matches.possibleHidden).toBe(3);
  });

  it('drops a row action that is not a claim href and shows an unknown tone as neutral', async () => {
    const base = dashboard();
    const row = base.claims.rows[0];
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        200,
        dashboard({
          claims: {
            failed: false,
            notices: [],
            rows: [
              { ...row, claimId: 'a', action: { label: 'View', href: 'https://evil.example/claim' } },
              { ...row, claimId: 'b', tone: 'purple', group: 'later' },
            ],
          },
        }),
      ),
    );
    const data = await fetchDashboard();
    expect(data.claims.rows[0].action).toBeNull();
    expect(data.claims.rows[1]).toMatchObject({
      tone: 'gray',
      group: 'other',
      action: { label: 'How to file', href: '/claim/acme-data-breach' },
    });
  });

  it('fails on a malformed answer instead of rendering it', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ...dashboard(), claims: undefined }));
    await expect(fetchDashboard()).rejects.toMatchObject({ name: 'ApiRequestError', code: 'invalid_response' });
    expect(sync).not.toHaveBeenCalled();
  });
});

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

describe('useDashboard', () => {
  it('loads under ["dashboard"] while signed in', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, dashboard()));
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const query = useDashboard();
        return { data: query.data, isSuccess: query.isSuccess };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['dashboard'])).toBe(result.current.data);
    client.clear();
  });

  it('sends nothing while signed out', async () => {
    mockAuth.status = 'signedOut';
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const query = useDashboard();
        return { fetchStatus: query.fetchStatus };
      },
      { wrapper },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
    client.clear();
  });
});

describe('refreshDashboardSoon', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('marks the dashboard stale at once and reloads it once after a burst of writes', async () => {
    const { client } = setup();
    client.setQueryData(['dashboard'], dashboard());
    const refetch = jest.spyOn(client, 'refetchQueries');

    refreshDashboardSoon(client);
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_DELAY_MS - 100);
    });
    refreshDashboardSoon(client);
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_DELAY_MS - 1);
    });
    expect(refetch).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['dashboard'], type: 'active' });
    client.clear();
  });
});
