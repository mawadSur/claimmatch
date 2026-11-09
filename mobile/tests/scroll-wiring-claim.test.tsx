import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ClaimScreen } from '@/features/claim';

/**
 * The claim flow's own scroll view (not Screen's) takes useHeaderScroll's
 * props and the keyboard prop for its confirmation-number and address
 * fields. As in scroll-wiring.test.tsx, the hook records which scroll view
 * got its props.
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

const LAWSUIT_ID = '11111111-1111-4111-8111-111111111111';
const mockFlow = {
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
    officialUrl: 'https://www.acmesettlement.com/claim',
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
  profile: null,
};

jest.mock('@/data/claims', () => ({
  ...jest.requireActual('@/data/claims'),
  useClaimScreen: () => ({ data: mockFlow, error: null, isError: false, isFetching: false, refetch: jest.fn() }),
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' }, sessionEnded: false }),
}));
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    isFlagOn: () => false,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short.', contactEmail: null, fromServer: true },
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }),
  usePathname: () => '/claim/acme-data-breach',
}));
jest.mock('@/data/focus', () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock('@/data/dashboard', () => ({ refreshDashboardSoon: jest.fn() }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), getApi: () => ({ request: jest.fn() }) }));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@react-native-community/datetimepicker', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => createElement(View, props),
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };
let client: QueryClient;

afterEach(() => client.clear());

describe('the claim screen', () => {
  it('gives its scroll view the header-scroll props, and the keyboard prop while focused', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <ClaimScreen slug="acme-data-breach" />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    const view = screen.getByTestId('claim-scroll');
    expect(view.props.scrollToOverflowEnabled).toBe(true);
    expect(view.props.automaticallyAdjustKeyboardInsets).toBe(true);

    const nativeEvent = {
      contentOffset: { x: 0, y: 24 },
      contentSize: { width: 402, height: 2000 },
      layoutMeasurement: { width: 402, height: 812 },
    };
    mockHeaderScroll.events = [];
    await fireEvent.scroll(view, { nativeEvent });
    await fireEvent(view, 'scrollBeginDrag', { nativeEvent });
    await fireEvent(view, 'contentSizeChange', 402, 2000);
    // A pushed screen, not a tab root: no restKey.
    expect(mockHeaderScroll.events).toEqual(
      ['scroll', 'scrollBeginDrag', 'contentSizeChange'].map((event) => ({ event, restKey: undefined })),
    );
  });
});
