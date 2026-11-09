import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';

import { createQueryClient } from '@/lib/query-client';
import { AuthProvider, useAuth, type AuthContextValue } from '@/providers/AuthProvider';

type AuthCallback = (event: string, session: Session | null) => void;

const mockAuth: { callback: AuthCallback | null } = { callback: null };
const mockSignOutOnThisDevice = jest.fn(async (): Promise<{ error: Error | null }> => ({ error: null }));

// SIGNED_OUT never fires here, as when auth-js cannot load the session offline.
jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));

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

const session = { access_token: 'token-1', user: { id: 'user-1' } } as unknown as Session;

describe('AuthProvider', () => {
  it('shows the signed-out app and drops personal data on sign-out, even without SIGNED_OUT', async () => {
    const client = createQueryClient();
    client.setQueryData(['dashboard'], { claims: ['personal'] });
    client.setQueryData(['catalog'], ['public']);
    client.getMutationCache().build(client, { mutationKey: ['settings'], mutationFn: async () => 'saved' });

    let auth: AuthContextValue | null = null;
    function Probe() {
      auth = useAuth();
      return null;
    }
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      mockAuth.callback?.('INITIAL_SESSION', session);
    });
    expect(auth!.status).toBe('signedIn');

    let result: { error: Error | null } | undefined;
    await act(async () => {
      result = await auth!.signOut();
    });

    expect(mockSignOutOnThisDevice).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: null });
    expect(auth!.status).toBe('signedOut');
    expect(auth!.user).toBeNull();
    expect(client.getQueryData(['dashboard'])).toBeUndefined();
    expect(client.getQueryData(['catalog'])).toEqual(['public']);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    client.clear(); // stops the cache's garbage-collection timers
  });

  async function renderAuth() {
    const client = createQueryClient();
    const seen: { auth: AuthContextValue | null } = { auth: null };
    function Probe() {
      seen.auth = useAuth();
      return null;
    }
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    return { client, seen };
  }

  it('remembers that a session ended without signing out, until the next sign-in', async () => {
    const { client, seen } = await renderAuth();
    await act(async () => {
      mockAuth.callback?.('INITIAL_SESSION', session);
    });
    expect(seen.auth!.sessionEnded).toBe(false);

    // Supabase Auth refused the session, or the API client signed out a dead one.
    await act(async () => {
      mockAuth.callback?.('SIGNED_OUT', null);
    });
    expect(seen.auth!.status).toBe('signedOut');
    expect(seen.auth!.sessionEnded).toBe(true);

    await act(async () => {
      mockAuth.callback?.('SIGNED_IN', session);
    });
    expect(seen.auth!.sessionEnded).toBe(false);
    client.clear();
  });

  it('does not call it an ended session when the person signs out, or was never signed in', async () => {
    const { client, seen } = await renderAuth();
    await act(async () => {
      mockAuth.callback?.('INITIAL_SESSION', null);
      mockAuth.callback?.('SIGNED_OUT', null);
    });
    expect(seen.auth!.sessionEnded).toBe(false);

    await act(async () => {
      mockAuth.callback?.('SIGNED_IN', session);
    });
    // signOut() here: auth-js fires SIGNED_OUT while it runs.
    mockSignOutOnThisDevice.mockImplementationOnce(async () => {
      mockAuth.callback?.('SIGNED_OUT', null);
      return { error: null };
    });
    await act(async () => {
      await seen.auth!.signOut();
    });
    expect(seen.auth!.status).toBe('signedOut');
    expect(seen.auth!.sessionEnded).toBe(false);
    client.clear();
  });
});
