import type { Href } from 'expo-router';

import { checkedHref } from '@/features/auth/navigation';

/** Where onboarding ends without a `next`: Your claims with the welcome card (src/app/onboarding/page.tsx). */
export const ONBOARDING_DONE_HREF: Href = { pathname: '/dashboard', params: { welcome: '1' } };

/** The onboarding modal, carrying a checked `next` (the claim the person came from) when there is one. */
export function onboardingHref(next: string | null): Href {
  return next ? { pathname: '/onboarding', params: { next } } : '/onboarding';
}

/**
 * Where saving or "Skip for now" continues: the checked `next`, else
 * /dashboard?welcome=1 (safeNextOr in the web wizard). Open it with
 * router.dismissTo, which closes the modal onto that screen.
 */
export function onboardingDoneHref(next: string | null): Href {
  return next ? checkedHref(next) : ONBOARDING_DONE_HREF;
}
