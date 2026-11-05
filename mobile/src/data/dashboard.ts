import type { DashboardResponse } from '@shared/lib/mobile-contract';
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';

import { getApi, unwrap } from '@/lib/api';
import { reminderEpoch, syncReminders } from '@/lib/reminders';
import { useAuth } from '@/providers/AuthProvider';

import { dataKeys } from './keys';
import { parseDashboardResponse } from './schemas';

export type { DashboardResponse } from '@shared/lib/mobile-contract';

/**
 * GET /api/mobile/dashboard (plan S5): claims and notices, matches without
 * scores, closing soon, and the deadline reminders. Every successful load
 * reschedules the reminders, except when the claims could not be read
 * (claims.failed sends none: the ones already scheduled stay).
 */
export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardResponse> {
  // Read before the request: a sign-out while it runs must not schedule this account's reminders.
  const startedIn = reminderEpoch();
  const data = unwrap(await getApi().request('/api/mobile/dashboard', { parse: parseDashboardResponse, signal }));
  if (!data.claims.failed) void syncReminders(data.reminders, { epoch: startedIn });
  return data;
}

/** Query options for the dashboard (for prefetching). */
export function dashboardQueryOptions() {
  return queryOptions({
    queryKey: dataKeys.dashboard,
    queryFn: ({ signal }) => fetchDashboard(signal),
  });
}

/** The dashboard (key ['dashboard']); runs only while signed in. Errors are ApiRequestError. */
export function useDashboard() {
  const { status } = useAuth();
  return useQuery({ ...dashboardQueryOptions(), enabled: status === 'signedIn' });
}

/** The web waits this long after the last claim answer before reloading (CorrectiveNoticeList REFRESH_DELAY_MS). */
export const DASHBOARD_REFRESH_DELAY_MS = 1500;

const pendingRefresh = new WeakMap<QueryClient, ReturnType<typeof setTimeout>>();

/**
 * After a claim write: marks the dashboard stale at once, and reloads it once
 * a burst of answers settles, not once per tap (each load re-reads the claims
 * and the catalog).
 */
export function refreshDashboardSoon(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: dataKeys.dashboard, refetchType: 'none' });
  const pending = pendingRefresh.get(client);
  if (pending) clearTimeout(pending);
  pendingRefresh.set(
    client,
    setTimeout(() => {
      pendingRefresh.delete(client);
      void client.refetchQueries({ queryKey: dataKeys.dashboard, type: 'active' });
    }, DASHBOARD_REFRESH_DELAY_MS),
  );
}
