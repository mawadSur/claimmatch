import { SITE } from '@shared/lib/utils';
import type { AuthError, AuthResponse, AuthTokenResponsePassword, Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearPersonalQueries } from '@/lib/query-client';
import { cancelAllReminders } from '@/lib/reminders';
import { getSupabase, signOutOnThisDevice } from '@/lib/supabase';

/**
 * Email links finish on the website in v1, exactly as for web sign-ups
 * (plan section 4): no app redirect URLs are needed in Supabase.
 */
const SITE_URL = SITE.url.replace(/\/+$/, '');
export const EMAIL_CONFIRM_REDIRECT = `${SITE_URL}/auth/callback`;
export const PASSWORD_RESET_REDIRECT = `${SITE_URL}/auth/confirm?type=recovery`;

/** If the stored session cannot be read in time, show the signed-out app instead of waiting. */
const INITIAL_SESSION_TIMEOUT_MS = 4_000;

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /**
   * True once a session ended without signOut() being called here: Supabase
   * Auth refused it (for example after a password change on the web), or an
   * API request found it dead and signed out on this device. Signed-out
   * screens then say "You were logged out." (the web's ClaimError). Cleared
   * by the next sign-in and by signOut().
   */
  sessionEnded: boolean;
  signInWithPassword(email: string, password: string): Promise<AuthTokenResponsePassword>;
  /** Without email confirmation turned off, `data.session` is null until the link in the email is opened. */
  signUp(input: SignUpInput): Promise<AuthResponse>;
  /** Never reveals whether an account exists; show the same message either way. */
  resetPasswordForEmail(email: string): Promise<{ error: AuthError | null }>;
  /**
   * Signs out on this device only; web sessions stay signed in. Works offline
   * too: the stored session is removed even when Supabase cannot be reached.
   * The app shows the signed-out state either way; `error` is set only when
   * the session could not be removed from this device.
   */
  signOut(): Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ status: AuthStatus; session: Session | null; sessionEnded: boolean }>({
    status: 'loading',
    session: null,
    sessionEnded: false,
  });
  const userIdRef = useRef<string | null>(null);
  /** True while signOut() runs, so its own SIGNED_OUT is not taken for an ended session. */
  const signingOut = useRef(false);

  useEffect(() => {
    const supabase = getSupabase();
    const timer = setTimeout(() => {
      setState((current) =>
        current.status === 'loading' ? { status: 'signedOut', session: null, sessionEnded: false } : current,
      );
    }, INITIAL_SESSION_TIMEOUT_MS);

    // Fires INITIAL_SESSION first, then sign-in, refresh and sign-out events.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(timer);
      const userId = session?.user.id ?? null;
      // Drop personal data from memory when the user signs out or another account signs in.
      if (event === 'SIGNED_OUT' || (userIdRef.current && userId && userId !== userIdRef.current)) {
        clearPersonalQueries(queryClient);
        // Reminders name the settlements this account tracks (plan 5).
        void cancelAllReminders();
      }
      // A signed-in user lost the session without asking to sign out here.
      const ended = event === 'SIGNED_OUT' && userIdRef.current !== null && !signingOut.current;
      userIdRef.current = userId;
      setState((current) => ({
        status: session ? 'signedIn' : 'signedOut',
        session,
        sessionEnded: session ? false : ended || current.sessionEnded,
      }));
    });

    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      session: state.session,
      user: state.session?.user ?? null,
      sessionEnded: state.sessionEnded,
      signInWithPassword: (email, password) =>
        getSupabase().auth.signInWithPassword({ email: email.trim(), password }),
      signUp: ({ email, password, fullName }) =>
        getSupabase().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: EMAIL_CONFIRM_REDIRECT },
        }),
      resetPasswordForEmail: (email) =>
        getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: PASSWORD_RESET_REDIRECT }),
      signOut: async () => {
        signingOut.current = true;
        let result: { error: Error | null };
        try {
          result = await signOutOnThisDevice();
        } finally {
          signingOut.current = false;
        }
        // SIGNED_OUT normally does this. Do it here too, so nothing personal stays
        // in memory or on screen even when auth-js could not fire it.
        clearPersonalQueries(queryClient);
        void cancelAllReminders();
        userIdRef.current = null;
        setState({ status: 'signedOut', session: null, sessionEnded: false });
        return result;
      },
    }),
    [state, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
