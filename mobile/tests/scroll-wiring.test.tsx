import type { DashboardResponse } from '@shared/lib/mobile-contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CatalogScreen } from '@/features/catalog';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

/**
 * The scroll views that do not come from Screen take useHeaderScroll's props
 * and the keyboard prop themselves (DashboardList, CatalogScreen; ClaimScreen
 * in scroll-wiring-claim.test.tsx), and the tab roots replaced on sign-in and
 * sign-out pass the auth status as restKey (Your claims, Settings). The hook
 * itself is tested in keyboard-insets.test.tsx and header-scroll-rest.test.tsx;
 * here it records which scroll view got its props, and for which restKey.
 */

const mockHeaderScroll: { events: { event: string; restKey: string | undefined }[] } = { events: [] };
jest.mock('@/hooks/use-header-scroll', () => ({
  useHeaderScroll: ({ restKey }: { restKey?: string }) => {
    const record = (event: string) => () => {
      mockHeaderScroll.events.push({ event, restKey });
    };
    return {
      scrollToOverflowEnabled: true,
      onScroll: record('scroll'),
      onScrollBeginDrag: record('scrollBeginDrag'),
      onContentSizeChange: record('contentSizeChange'),
    };
  },
}));

const mockAuth: { status: string; user: { id: string; email: string } | null; sessionEnded: boolean; signOut: jest.Mock } = {
  status: 'signedIn',
  user: { id: 'user-1', email: 'ana@example.com' },
  sessionEnded: false,
  signOut: jest.fn(async () => ({ error: null })),
};
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    status: 'ready',
    isFlagOn: () => false,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short.', contactEmail: null, fromServer: true },
  }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
    useNavigation: () => ({ setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => unknown) => useEffect(() => effect() as undefined, [effect]),
  };
});

const mockQueries: { dashboard: Record<string, unknown>; catalog: Record<string, unknown> } = { dashboard: {}, catalog: {} };
jest.mock('@/data/dashboard', () => ({ ...jest.requireActual('@/data/dashboard'), useDashboard: () => mockQueries.dashboard }));
jest.mock('@/data/catalog', () => ({ ...jest.requireActual('@/data/catalog'), useCatalog: () => mockQueries.catalog }));
jest.mock('@/data/profile', () => ({
  ...jest.requireActual('@/data/profile'),
  useProfile: () => ({ data: { referral_code: 'ANA123' }, isPending: false }),
}));
jest.mock('@/data/reminder-setting', () => ({
  useReminderSetting: () => ({ ready: true, enabled: false, permission: 'granted', busy: false, setEnabled: jest.fn() }),
}));
jest.mock('@/data/focus', () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), signOutOnThisDevice: async () => ({ error: null }) }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), getApi: () => ({ request: jest.fn() }) }));
jest.mock('@/lib/reminders', () => ({
  cancelAllReminders: jest.fn(async () => undefined),
  reminderEpoch: () => 0,
  syncReminders: jest.fn(async () => ({ status: 'off' })),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '7' }));
// Static skeletons: no animation loop in tests.
jest.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };

const DASHBOARD: DashboardResponse = {
  serverTime: '2026-11-02T15:00:00.000Z',
  profile: { firstName: 'Ana', onboarded: true, needsProfile: false },
  claims: { failed: false, rows: [], notices: [] },
  matches: { failed: false, strong: [], possible: [], possibleHidden: 0 },
  closingSoon: { failed: false, items: [] },
  reminders: [],
};

function loaded(data: unknown) {
  return { data, status: 'success', error: null, isError: false, isFetching: false, isRefetchError: false, refetch: jest.fn() };
}

let client: QueryClient;

async function show(element: ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** Sends a scroll, the start of a drag and a content size change to the scroll view; returns what reached the hook's props. */
async function eventsFrom(testID: string) {
  const view = screen.getByTestId(testID);
  const nativeEvent = {
    contentOffset: { x: 0, y: 24 },
    contentSize: { width: 402, height: 2000 },
    layoutMeasurement: { width: 402, height: 812 },
  };
  mockHeaderScroll.events = [];
  await fireEvent.scroll(view, { nativeEvent });
  await fireEvent(view, 'scrollBeginDrag', { nativeEvent });
  await fireEvent(view, 'contentSizeChange', 402, 2000);
  return mockHeaderScroll.events;
}

function allEvents(restKey: string | undefined) {
  return ['scroll', 'scrollBeginDrag', 'contentSizeChange'].map((event) => ({ event, restKey }));
}

beforeEach(() => {
  mockAuth.status = 'signedIn';
  mockAuth.user = { id: 'user-1', email: 'ana@example.com' };
  mockQueries.dashboard = loaded(DASHBOARD);
  mockQueries.catalog = loaded([]);
});

afterEach(() => client.clear());

describe('Your claims', () => {
  it('gives the list the header-scroll props for the signed-in status, and the keyboard prop while focused', async () => {
    await show(<DashboardScreen />);
    const list = screen.getByTestId('dashboard-list');
    expect(list.props.scrollToOverflowEnabled).toBe(true);
    expect(list.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(await eventsFrom('dashboard-list')).toEqual(allEvents('signedIn'));
  });

  it('passes the status as restKey while loading and when signed out', async () => {
    mockQueries.dashboard = { ...loaded(undefined), status: 'pending' };
    await show(<DashboardScreen />);
    expect(await eventsFrom('dashboard-loading-scroll')).toEqual(allEvents('signedIn'));
    await screen.unmount();

    mockAuth.status = 'signedOut';
    mockAuth.user = null;
    await show(<DashboardScreen />);
    expect(await eventsFrom('dashboard-signed-out-scroll')).toEqual(allEvents('signedOut'));
  });
});

describe('Settings', () => {
  it('passes the status as restKey, signed in and signed out', async () => {
    await show(<SettingsScreen />);
    expect(await eventsFrom('settings-signed-in-scroll')).toEqual(allEvents('signedIn'));
    await screen.unmount();

    mockAuth.status = 'signedOut';
    mockAuth.user = null;
    await show(<SettingsScreen />);
    expect(await eventsFrom('settings-signed-out-scroll')).toEqual(allEvents('signedOut'));
  });
});

describe('Settlements', () => {
  it('gives the list the header-scroll props, and the keyboard prop for its search field while focused', async () => {
    await show(<CatalogScreen />);
    const list = screen.getByTestId('catalog-list');
    expect(list.props.scrollToOverflowEnabled).toBe(true);
    expect(list.props.automaticallyAdjustKeyboardInsets).toBe(true);
    // Not replaced on sign-in or sign-out: no restKey.
    expect(await eventsFrom('catalog-list')).toEqual(allEvents(undefined));
  });
});
