import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { settings } from '@/copy/settings';
import { DeleteAccountScreen } from '@/features/settings/DeleteAccountScreen';
import { cancelAllReminders } from '@/lib/reminders';
import { AuthProvider } from '@/providers/AuthProvider';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

type AuthCallback = (event: string, session: Session | null) => void;
const mockAuth: { callback: AuthCallback | null } = { callback: null };
const mockSignOutOnThisDevice = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        mockAuth.callback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  }),
  signOutOnThisDevice: () => mockSignOutOnThisDevice(),
}));

// The real API client and useDeleteAccount, with the network mocked.
const mockFetch = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      refreshAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      signOutLocally: async () => undefined,
    },
  });
  return { ...actual, getApi: () => client };
});

jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const session = { access_token: 'token-1', user: { id: 'user-1' } } as unknown as Session;
let client: QueryClient;

async function renderDelete() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  client.setQueryData(['dashboard'], { claims: ['personal'] });
  client.setQueryData(['profile', 'user-1'], { full_name: 'Ana' });
  client.setQueryData(['catalog'], ['public']);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <DeleteAccountScreen />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await act(async () => mockAuth.callback?.('INITIAL_SESSION', session));
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => client.clear());

describe('Delete my account and data', () => {
  it('explains what is removed and keeps the button disabled until DELETE is typed exactly', async () => {
    const user = userEvent.setup();
    await renderDelete();
    expect(screen.getByText(settings.deleteBody.text)).toBeOnTheScreen();

    const button = screen.getByRole('button', { name: settings.deleteTitle.text });
    expect(button).toBeDisabled();
    const input = screen.getByLabelText(settings.deleteInputLabel.text);
    expect(input).toHaveProp('autoCapitalize', 'characters');

    await user.type(input, 'delete');
    expect(screen.getByRole('button', { name: settings.deleteTitle.text })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: settings.deleteTitle.text }));
    expect(mockFetch).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'DELETE');
    expect(screen.getByRole('button', { name: settings.deleteTitle.text })).toBeEnabled();
  });

  it('deletes with the bearer, then signs out, drops personal data, cancels reminders and opens the settlements', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await renderDelete();

    await user.type(screen.getByLabelText(settings.deleteInputLabel.text), 'DELETE');
    await user.press(screen.getByRole('button', { name: settings.deleteTitle.text }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/lawsuits'));
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/account/delete');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"confirm":"DELETE"}');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');

    expect(mockSignOutOnThisDevice).toHaveBeenCalledTimes(1);
    expect(cancelAllReminders).toHaveBeenCalled();
    expect(client.getQueryData(['dashboard'])).toBeUndefined();
    expect(client.getQueryData(['profile', 'user-1'])).toBeUndefined();
    expect(client.getQueryData(['catalog'])).toEqual(['public']);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    // Still the busy button, not the signed-out prompt, while the modal closes.
    expect(screen.getByRole('button', { name: settings.deleting.text })).toBeBusy();
  });

  it('shows the server error as sent, including the rate limit, and stays signed in', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(jsonResponse(429, { error: 'Too many attempts. Please try again in 10 minutes.' }));
    await renderDelete();

    await user.type(screen.getByLabelText(settings.deleteInputLabel.text), 'DELETE');
    await user.press(screen.getByRole('button', { name: settings.deleteTitle.text }));

    expect(await screen.findByText('Too many attempts. Please try again in 10 minutes.')).toBeOnTheScreen();
    expect(mockSignOutOnThisDevice).not.toHaveBeenCalled();
    expect(cancelAllReminders).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(client.getQueryData(['dashboard'])).toEqual({ claims: ['personal'] });

    // Editing clears the error; the next try can go through.
    await user.type(screen.getByLabelText(settings.deleteInputLabel.text), ' ');
    expect(screen.queryByText('Too many attempts. Please try again in 10 minutes.')).toBeNull();
  });

  it('shows the server message when the account could not be deleted', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: 'Could not finish deleting the account.' }));
    await renderDelete();
    await user.type(screen.getByLabelText(settings.deleteInputLabel.text), 'DELETE');
    await user.press(screen.getByRole('button', { name: settings.deleteTitle.text }));
    expect(await screen.findByText('Could not finish deleting the account.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: settings.deleteTitle.text })).toBeEnabled();
  });
});
