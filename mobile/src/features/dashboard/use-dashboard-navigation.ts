import { useRouter } from 'expo-router';

import { claimRoute, isClaimHref } from '@/features/shared';

export interface DashboardNavigation {
  /** Opens a claim, only for a checked "/claim/{slug}"; anything else is ignored (plan 3.1). */
  openClaim: (href: unknown) => void;
  /** The Settlements tab (the web's links to /lawsuits). */
  openSettlements: () => void;
  /** Onboarding ("Finish your profile"). */
  openOnboarding: () => void;
  /** The matching answers ("Edit profile", "Update your profile"): /settings/details, with Settings under it. */
  openProfileSettings: () => void;
}

/** Where the dashboard's buttons go. Server values never reach the router unchecked. */
export function useDashboardNavigation(): DashboardNavigation {
  const router = useRouter();
  return {
    openClaim: (href) => {
      if (isClaimHref(href)) router.push(claimRoute(href));
    },
    openSettlements: () => router.navigate('/lawsuits'),
    openOnboarding: () => router.push('/onboarding'),
    openProfileSettings: () => router.push('/settings/details', { withAnchor: true }),
  };
}
