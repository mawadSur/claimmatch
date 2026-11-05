import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { common } from '@/copy/common';
import {
  claimLoadErrorWhat,
  fetchClaimScreen,
  savedFictionalClaims,
  useAcknowledgeFictional,
  useClaimAction,
  useClaimScreen,
  useStartTracking,
  type ClaimScreenResult,
} from '@/data/claims';
import { DASHBOARD_REFRESH_DELAY_MS } from '@/data/dashboard';

const mockFetch = jest.fn();
const mockSession: {
  token: { status: string; token?: string; userId?: string };
  refresh: { status: string; token?: string; userId?: string };
  signOuts: number;
} = {
  token: { status: 'ok', token: 'token-1', userId: 'user-1' },
  refresh: { status: 'ok', token: 'token-2', userId: 'user-1' },
  signOuts: 0,
};

// The real API client (auth, retry, error mapping, parsing) with a fake network and session.
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => mockSession.token,
      refreshAccessToken: async () => {
        if (mockSession.refresh.status === 'ok') mockSession.token = mockSession.refresh;
        return mockSession.refresh;
      },
      signOutLocally: async () => {
        mockSession.signOuts += 1;
        mockSession.token = { status: 'none' };
      },
    },
  });
  return { ...actual, getApi: () => client };
});

const mockAuth: { status: string; user: { id: string } | null } = { status: 'signedIn', user: { id: 'user-1' } };
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

jest.mock('@/lib/reminders', () => ({
  reminderEpoch: () => 0,
  syncReminders: jest.fn(async () => ({ status: 'off' })),
}));

const LAWSUIT_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

function claimView(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    lawsuit_title: 'Acme Data Breach',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const flowBody = {
  kind: 'flow',
  now: '2026-11-02T15:00:00.000Z',
  slug: 'acme-data-breach',
  title: 'Acme Data Breach',
  category: 'Data breach',
  settlement: {
    id: LAWSUIT_ID,
    slug: 'acme-data-breach',
    title: 'Acme Data Breach',
    deadline: '2026-12-01',
    officialUrl: 'https://acme.example/claim',
    sourceUrl: null,
    sourceHost: null,
    eligibility: 'People whose data was exposed.',
    proof: 'unknown',
    formFieldOrder: null,
    assistedFilingAllowed: false,
    payoutReportEnabled: false,
  },
  context: {
    known: true,
    fictional: false,
    published: true,
    closedByStatus: false,
    deadline: '2026-12-01',
    deadlinePassed: false,
    openForClaims: true,
    lateReportOpen: true,
  },
  claim: null,
  profile: {
    full_name: 'Ana Diaz',
    email: 'ana@example.com',
    phone: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: 'CA',
    prefill_consent_at: null,
  },
};

const closedBody = {
  kind: 'closed',
  slug: 'old-one',
  title: 'Old One',
  category: null,
  deadline: '2026-01-01',
  deadlinePassed: true,
  officialUrl: null,
};

function sent(call = 0): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = mockFetch.mock.calls[call] as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSession.token = { status: 'ok', token: 'token-1', userId: 'user-1' };
  mockSession.refresh = { status: 'ok', token: 'token-2', userId: 'user-1' };
  mockSession.signOuts = 0;
  mockAuth.status = 'signedIn';
  mockAuth.user = { id: 'user-1' };
});

describe('fetchClaimScreen', () => {
  it('returns the flow body for a 200 and sends the bearer token', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, flowBody));
    const result = await fetchClaimScreen('acme-data-breach');
    expect(result).toEqual(flowBody);
    expect(sent().url).toBe('https://api.test/api/mobile/claim/acme-data-breach');
    expect(sent().init.method).toBe('GET');
    expect(sent().init.headers.Authorization).toBe('Bearer token-1');
  });

  it('returns the closed body for a 200', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, closedBody));
    await expect(fetchClaimScreen('old-one')).resolves.toEqual(closedBody);
  });

  it('returns not_found for a 404', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { code: 'not_found' }));
    await expect(fetchClaimScreen('nope')).resolves.toEqual({ kind: 'not_found' });
  });

  it('throws a 503 load_error with the server\'s `what`, so a reload that fails keeps the screen', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { code: 'load_error', what: 'your claim' }));
    const first = await fetchClaimScreen('acme-data-breach').catch((caught: unknown) => caught);
    expect(first).toMatchObject({ name: 'ApiRequestError', status: 503, code: 'load_error' });
    expect(claimLoadErrorWhat(first)).toBe('your claim');
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { code: 'load_error', what: 'this settlement' }));
    expect(claimLoadErrorWhat(await fetchClaimScreen('acme-data-breach').catch((caught: unknown) => caught))).toBe(
      'this settlement',
    );
  });

  it('reads no `what` from a load_error that names neither, and none from other errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { code: 'load_error', what: '<b>anything</b>' }));
    expect(claimLoadErrorWhat(await fetchClaimScreen('acme-data-breach').catch((caught: unknown) => caught))).toBeNull();
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { code: 'load_error' }));
    expect(claimLoadErrorWhat(await fetchClaimScreen('acme-data-breach').catch((caught: unknown) => caught))).toBeNull();
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { code: 'auth_unavailable', error: 'Try again.' }));
    expect(claimLoadErrorWhat(await fetchClaimScreen('acme-data-breach').catch((caught: unknown) => caught))).toBeUndefined();
    expect(claimLoadErrorWhat(new Error('boom'))).toBeUndefined();
  });

  it('throws the server text for a 503 auth_unavailable and keeps the session', async () => {
    const text = 'We couldn’t confirm you’re logged in right now. Please try again in a minute.';
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { error: text, code: 'auth_unavailable' }));
    await expect(fetchClaimScreen('acme-data-breach')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 503,
      code: 'auth_unavailable',
      message: text,
      loggedOut: false,
    });
    expect(mockSession.signOuts).toBe(0);
  });

  it('returns signed_out without a request when there is no session', async () => {
    mockSession.token = { status: 'none' };
    await expect(fetchClaimScreen('acme-data-breach')).resolves.toEqual({ kind: 'signed_out', loggedOut: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns signed_out with loggedOut when Supabase Auth rejected the session', async () => {
    mockSession.refresh = { status: 'invalid' };
    mockFetch.mockResolvedValue(jsonResponse(401, { error: 'Please log in again.' }));
    await expect(fetchClaimScreen('acme-data-breach')).resolves.toEqual({ kind: 'signed_out', loggedOut: true });
    expect(mockSession.signOuts).toBe(1);
  });

  it('throws on a malformed 200 instead of rendering it', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ...flowBody, context: undefined }));
    await expect(fetchClaimScreen('acme-data-breach')).rejects.toMatchObject({
      code: 'invalid_response',
      message: common.genericError.text,
    });
  });

  it('never leaves the claim path', async () => {
    await expect(fetchClaimScreen('..')).resolves.toEqual({ kind: 'not_found' });
    expect(mockFetch).not.toHaveBeenCalled();

    mockFetch.mockResolvedValueOnce(jsonResponse(404, { code: 'not_found' }));
    await fetchClaimScreen('a/b?c');
    expect(sent().url).toBe('https://api.test/api/mobile/claim/a%2Fb%3Fc');
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

describe('useClaimScreen', () => {
  it('loads the screen under ["claim", slug] and again for the new session after logging in', async () => {
    mockAuth.status = 'signedOut';
    mockAuth.user = null;
    mockSession.token = { status: 'none' };
    const { client, wrapper } = setup();
    // Read during render: React Query re-renders only for the fields a render used.
    const { result, rerender } = await renderHook(
      () => {
        const query = useClaimScreen('acme-data-breach');
        return { data: query.data, status: query.status };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual({ kind: 'signed_out', loggedOut: false }));

    mockAuth.status = 'signedIn';
    mockAuth.user = { id: 'user-1' };
    mockSession.token = { status: 'ok', token: 'token-1', userId: 'user-1' };
    mockFetch.mockResolvedValueOnce(jsonResponse(200, flowBody));
    await rerender({});

    await waitFor(() => expect(result.current.data?.kind).toBe('flow'));
    expect(client.getQueryData(['claim', 'acme-data-breach'])).toEqual(flowBody);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

describe('claim writes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function seeded() {
    const { client, wrapper } = setup();
    client.setQueryData<ClaimScreenResult>(['claim', 'acme-data-breach'], flowBody as ClaimScreenResult);
    client.setQueryData<ClaimScreenResult>(['claim', 'old-one'], closedBody as ClaimScreenResult);
    client.setQueryData(['dashboard'], { cached: true });
    const refetch = jest.spyOn(client, 'refetchQueries');
    return { client, wrapper, refetch };
  }

  function flowClaim(client: QueryClient) {
    const data = client.getQueryData<ClaimScreenResult>(['claim', 'acme-data-breach']);
    return data?.kind === 'flow' ? data.claim : undefined;
  }

  it('starts tracking, shows the new claim, and reloads the dashboard once the writes settle', async () => {
    const { client, wrapper, refetch } = seeded();
    mockFetch.mockResolvedValueOnce(jsonResponse(201, { claim: claimView(), created: true }));
    const { result } = await renderHook(() => useStartTracking(), { wrapper });

    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync({ lawsuitId: LAWSUIT_ID });
    });

    expect(answer).toEqual({ claim: claimView(), changed: true });
    expect(sent().url).toBe('https://api.test/api/claims');
    expect(sent().init.method).toBe('POST');
    expect(JSON.parse(String(sent().init.body))).toEqual({ lawsuit_id: LAWSUIT_ID, intent: 'track' });
    expect(sent().init.headers['Content-Type']).toBe('application/json');
    expect(flowClaim(client)).toEqual(claimView());
    expect(client.getQueryData(['claim', 'old-one'])).toEqual(closedBody);
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);

    expect(refetch).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_DELAY_MS);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['dashboard'], type: 'active' });
    client.clear();
  });

  it('refuses a settlement id that is not a UUID without sending it', async () => {
    const { client, wrapper } = seeded();
    const { result } = await renderHook(() => useStartTracking(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync({ lawsuitId: 'acme', intent: 'report_filed' }).catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({
      code: 'invalid_input',
      status: 400,
      message: "That settlement link isn't valid. Go back and pick the settlement again.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
    client.clear();
  });

  it('reports filing with a normalized confirmation number and shows the answer', async () => {
    const { client, wrapper } = seeded();
    const submitted = claimView({ status: 'submitted', confirmation_number: 'ABC 123' });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { claim: submitted, changed: true }));
    const { result } = await renderHook(() => useClaimAction(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        claimId: CLAIM_ID,
        body: { action: 'report_filed', confirmation_number: '  ABC   123 ', filed_on: '2026-10-30' },
      });
    });

    expect(sent().url).toBe(`https://api.test/api/claims/${CLAIM_ID}`);
    expect(sent().init.method).toBe('PATCH');
    expect(JSON.parse(String(sent().init.body))).toEqual({
      action: 'report_filed',
      confirmation_number: 'ABC 123',
      filed_on: '2026-10-30',
    });
    expect(flowClaim(client)).toEqual(submitted);
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    client.clear();
  });

  it('keeps the server code and maps "Refresh the page" text for the app', async () => {
    const { client, wrapper } = seeded();
    mockFetch.mockResolvedValueOnce(
      jsonResponse(409, {
        error: 'This claim just changed, maybe in another tab. Refresh the page and try again.',
        code: 'claim_changed',
      }),
    );
    const { result } = await renderHook(() => useClaimAction(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current
        .mutateAsync({ claimId: CLAIM_ID, body: { action: 'undo_report' } })
        .catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({ code: 'claim_changed', status: 409, message: common.claimChanged.text });
    expect(flowClaim(client)).toBeNull();
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(false);
    client.clear();
  });

  it('keeps the claim a write answered with when a reload that started before it answers later', async () => {
    const { client, wrapper } = seeded();
    const submitted = claimView({ status: 'submitted', confirmation_number: 'ABC123' });
    // The reload's answer still has no claim (read before the write was saved), and arrives last.
    let answerReload: (response: Response) => void = () => undefined;
    mockFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerReload = resolve)));
    const reload = client
      .fetchQuery({
        queryKey: ['claim', 'acme-data-breach'],
        queryFn: ({ signal }) => fetchClaimScreen('acme-data-breach', signal),
        staleTime: 0,
      })
      .catch((caught: unknown) => caught);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockResolvedValueOnce(jsonResponse(200, { claim: submitted, changed: true }));
    const { result } = await renderHook(() => useClaimAction(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ claimId: CLAIM_ID, body: { action: 'report_filed', confirmation_number: 'ABC123' } });
    });
    expect(flowClaim(client)).toEqual(submitted);

    await act(async () => {
      answerReload(jsonResponse(200, flowBody));
      await reload;
    });
    expect(flowClaim(client)).toEqual(submitted);
    client.clear();
  });

  it('refuses an invalid confirmation number on the device', async () => {
    const { client, wrapper } = seeded();
    const { result } = await renderHook(() => useClaimAction(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current
        .mutateAsync({ claimId: CLAIM_ID, body: { action: 'add_confirmation', confirmation_number: '##' } })
        .catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({ code: 'invalid_input' });
    expect(mockFetch).not.toHaveBeenCalled();
    client.clear();
  });

  it('acknowledges every fictional claim with an empty JSON body', async () => {
    const { client, wrapper, refetch } = seeded();
    const closedOut = claimView({ status: 'withdrawn', corrective_notice_answered_at: '2026-11-02T15:00:00.000Z' });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { claims: [closedOut], acknowledged: 1 }));
    const { result } = await renderHook(() => useAcknowledgeFictional(), { wrapper });

    let claims: unknown;
    await act(async () => {
      claims = await result.current.mutateAsync();
    });

    expect(claims).toEqual([closedOut]);
    expect(sent().url).toBe('https://api.test/api/claims/acknowledge-fictional');
    expect(sent().init.body).toBe('{}');
    expect(flowClaim(client)).toEqual(closedOut);
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_DELAY_MS);
    });
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['dashboard'], type: 'active' });
    client.clear();
  });

  it('shows the claims a partly failed acknowledge saved before failing', async () => {
    const { client, wrapper } = seeded();
    const closedOut = claimView({ status: 'withdrawn', corrective_notice_answered_at: '2026-11-02T15:00:00.000Z' });
    mockFetch.mockResolvedValueOnce(
      jsonResponse(500, {
        error: "Some of these couldn't be saved. Please try again in a minute.",
        claims: [closedOut],
        acknowledged: 1,
      }),
    );
    const { result } = await renderHook(() => useAcknowledgeFictional(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync().catch((caught: unknown) => caught);
    });
    expect(savedFictionalClaims(error)).toEqual([closedOut]);
    expect(flowClaim(client)).toEqual(closedOut);
    client.clear();
  });

  it('finds no saved claims in other failures', () => {
    expect(savedFictionalClaims(new Error('boom'))).toEqual([]);
    expect(savedFictionalClaims(undefined)).toEqual([]);
  });

  it('reloads the dashboard after a partly failed acknowledge too', async () => {
    const { client, wrapper, refetch } = seeded();
    mockFetch.mockResolvedValueOnce(
      jsonResponse(500, { error: "Some of these couldn't be saved. Please try again in a minute.", claims: [] }),
    );
    const { result } = await renderHook(() => useAcknowledgeFictional(), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync().catch((caught: unknown) => caught);
    });
    expect(error).toMatchObject({ status: 500, message: "Some of these couldn't be saved. Please try again in a minute." });
    expect(client.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_DELAY_MS);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
