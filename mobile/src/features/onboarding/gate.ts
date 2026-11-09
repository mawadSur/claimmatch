import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { dataKeys } from '@/data/keys';
import { fetchProfile } from '@/data/profile';
import { isClaimHref } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';

import { onboardingHref } from './hrefs';

/** Screens the onboarding modal may open over; elsewhere (the sign-in sheet, other modals) it waits. */
const OPENS_OVER: ReadonlySet<string> = new Set(['(tabs)', 'claim']);

/**
 * The onboarding gate (plan 3.3): after someone signs in, when the profile
 * says `onboarded` is false (or there is no profile row yet, as the web
 * dashboard reads it), opens the onboarding modal once for that sign-in. It
 * waits until the sign-in sheet has closed, and passes the claim the person
 * returned to as `next`, so onboarding ends back on it. A session restored at
 * launch is not a sign-in: like the web, which sends people to onboarding
 * only after signing up, the app then leaves it to the dashboard's "Finish
 * your profile", which opens onboarding whenever the person wants.
 * Mount once, in the root layout.
 */
export function useOnboardingGate(): void {
  const router = useRouter();
  const { status, user } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  // Users the gate has finished with in this sign-in session: opened onboarding for, or found onboarded.
  const handled = useRef(new Set<string>());
  // Signed in when the app started (a stored session), and not signed out since.
  const restoredSession = useRef(status === 'signedIn');
  const userId = status === 'signedIn' ? (user?.id ?? null) : null;

  // The profile query the Settings screens share. This observer never refetches on its
  // own (no staleTime expiry, focus or reconnect): at most one read per signed-in session.
  const profile = useQuery({
    queryKey: dataKeys.profile(userId ?? ''),
    queryFn: ({ signal }) => fetchProfile(userId ?? '', signal),
    enabled: userId !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const known = profile.isSuccess;
  const onboarded = profile.data?.onboarded === true;
  const top: string = segments[0] ?? '';

  useEffect(() => {
    if (status !== 'signedOut') return;
    // The next sign-in is a new session: ask again then.
    restoredSession.current = false;
    handled.current.clear();
  }, [status]);

  useEffect(() => {
    if (!userId || handled.current.has(userId) || !known) return;
    if (restoredSession.current || onboarded || top === 'onboarding') {
      handled.current.add(userId);
      return;
    }
    if (!OPENS_OVER.has(top)) return;
    handled.current.add(userId);
    router.push(onboardingHref(isClaimHref(pathname) ? pathname : null));
  }, [userId, known, onboarded, top, pathname, router]);
}
