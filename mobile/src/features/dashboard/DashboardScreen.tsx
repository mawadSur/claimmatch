import { useFocusEffect, useLocalSearchParams, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Screen } from '@/components/ui';
import { useDashboard } from '@/data/dashboard';
import { userFacingError } from '@/data/errors';
import { useRefetchOnFocus } from '@/data/focus';
import { firstParam, SignedOutPrompt, usePullToRefresh } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';

import { DashboardList } from './DashboardList';
import { DashboardLoadError, DashboardSkeleton } from './DashboardStates';
import { buildDashboardItems } from './items';
import type { DashboardParams, DashboardResponse, DashboardStackParams } from './types';
import { useDashboardNavigation } from './use-dashboard-navigation';
import { useNoticeAnswers } from './use-notice-answers';

const NO_NOTICES: DashboardResponse['claims']['notices'] = [];

/**
 * "Your claims", /dashboard (plan 3.3). Signed out: the log-in prompt.
 * Signed in: GET /api/mobile/dashboard, loaded again on focus, on return to
 * the app and on pull to refresh (each load also reschedules the deadline
 * reminders, in the data layer).
 */
export function DashboardScreen() {
  const { status, user, sessionEnded } = useAuth();
  if (status === 'signedOut') {
    return (
      <Screen centered restKey={status} testID="dashboard-signed-out">
        <SignedOutPrompt next="/dashboard" loggedOut={sessionEnded} />
      </Screen>
    );
  }
  if (status !== 'signedIn') return <DashboardSkeleton restKey={status} />;
  // A new account starts with a fresh screen (answers, open groups).
  return <SignedInDashboard key={user?.id ?? 'signed-in'} />;
}

function SignedInDashboard() {
  const { status } = useAuth();
  const query = useDashboard();
  const { refetch } = query;
  const nav = useDashboardNavigation();
  const navigation = useNavigation<NativeStackNavigationProp<DashboardStackParams, 'index'>>();
  const params = useLocalSearchParams<DashboardParams>();
  const notices = useNoticeAnswers(query.data?.claims.notices ?? NO_NOTICES);
  const { endVisit } = notices;
  // A pull ends the visit too, like reloading the page on the web.
  const pull = usePullToRefresh(refetch, endVisit);
  const [possibleOpen, setPossibleOpen] = useState(false);

  useRefetchOnFocus(refetch);

  // Read on blur. Kept out of the focus effect's dependencies: re-running
  // that effect runs its cleanup, which must happen on blur only.
  const latest = useRef({ navigation, params });
  useEffect(() => {
    latest.current = { navigation, params };
  }, [navigation, params]);

  // Leaving the screen ends the visit, as leaving the page does on the web:
  // answered notice rows go, and the one-time welcome card and banners clear.
  useFocusEffect(
    useCallback(
      () => () => {
        endVisit();
        const { navigation: screen, params: shown } = latest.current;
        if (shown.welcome !== undefined || shown.password !== undefined || shown.denied !== undefined) {
          screen.setParams({ welcome: undefined, password: undefined, denied: undefined });
        }
      },
      [endVisit],
    ),
  );

  function retry() {
    void refetch();
  }

  const { data } = query;
  if (!data) {
    if (query.isError) {
      return (
        <DashboardLoadError
          error={query.error}
          retrying={query.isFetching}
          onRetry={retry}
          pulling={pull.refreshing}
          onPull={pull.onRefresh}
          onBrowse={nav.openSettlements}
          restKey={status}
        />
      );
    }
    return <DashboardSkeleton restKey={status} />;
  }

  const items = buildDashboardItems(data, {
    welcome: firstParam(params.welcome) === '1',
    deniedAdmin: firstParam(params.denied) === 'admin',
    passwordUpdated: firstParam(params.password) === 'updated',
    hasNotices: notices.rows.length > 0,
    refetchError: query.isRefetchError ? (userFacingError(query.error)?.message ?? null) : null,
  });

  return (
    <Screen scroll={false} testID="dashboard">
      <DashboardList
        data={data}
        items={items}
        notices={notices}
        possibleOpen={possibleOpen}
        onTogglePossible={() => setPossibleOpen((open) => !open)}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        retrying={query.isFetching && !pull.refreshing}
        onRetry={retry}
        nav={nav}
        restKey={status}
      />
    </Screen>
  );
}
