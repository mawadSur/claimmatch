import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { claim as copy, undoWarning, undoneMessage } from '@/copy/claim';
import { common } from '@/copy/common';
import { ClaimScreen } from '@/features/claim';
import { endOfDay, latestFilingDay, startOfDay } from '@/features/claim/dates';
import { openExternalUrl } from '@/lib/external-link';

const mockFetch = jest.fn();
const mockSession: { token: Record<string, string>; refresh: Record<string, string> } = {
  token: { status: 'ok', token: 'token-1', userId: 'user-1' },
  refresh: { status: 'ok', token: 'token-2', userId: 'user-1' },
};

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => mockSession.token,
      refreshAccessToken: async () => mockSession.refresh,
      signOutLocally: async () => {
        mockSession.token = { status: 'none' };
      },
    },
  });
  return { ...actual, getApi: () => client };
});
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' } }) }));
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    isFlagOn: () => false,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short.', contactEmail: null, fromServer: true },
  }),
}));
const mockRouter = { push: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => '/claim/acme-data-breach' }));
jest.mock('expo-router/react-navigation', () => ({
  HeaderHeightContext: require('react').createContext(undefined),
  NavigationContext: require('react').createContext(undefined),
  NavigationRouteContext: require('react').createContext(undefined),
}));
jest.mock('@/data/focus', () => ({ useRefetchOnFocus: jest.fn() }));
jest.mock('@/data/dashboard', () => ({ refreshDashboardSoon: jest.fn() }));
jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));
jest.mock('@/lib/external-link', () => ({
  ...jest.requireActual('@/lib/external-link'),
  openExternalUrl: jest.fn(async () => ({ type: 'cancel' })),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  AndroidHaptics: { Virtual_Key: 'virtual-key' },
}));
jest.mock('@react-native-community/datetimepicker', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => createElement(View, props),
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});

const LAWSUIT_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_ID = '22222222-2222-4222-8222-222222222222';
const OFFICIAL = 'https://www.acmesettlement.com/claim';
const CLAIM_PATH = `/api/claims/${CLAIM_ID}`;
/** The scroll view's scrollTo (React Native's Jest mock shares it across instances). */
const scrollTo = (ScrollView as unknown as { prototype: { scrollTo: jest.Mock } }).prototype.scrollTo;

type Reply = [number, unknown];
const replies = new Map<string, Reply[]>();
const lastReplies = new Map<string, Reply>();

function reply(method: string, path: string, answer: Reply) {
  replies.set(`${method} ${path}`, [...(replies.get(`${method} ${path}`) ?? []), answer]);
}

function sent(method: string, path: string): unknown[] {
  return mockFetch.mock.calls
    .filter(([url, init]) => url === `https://api.test${path}` && (init as RequestInit).method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function claimView(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    lawsuit_title: 'Acme Data Breach',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function flow(parts: { settlement?: object; context?: object; claim?: object | null } = {}) {
  return {
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
      officialUrl: OFFICIAL,
      sourceUrl: null,
      sourceHost: null,
      eligibility: null,
      proof: 'required',
      formFieldOrder: null,
      ...parts.settlement,
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
      ...parts.context,
    },
    claim: parts.claim ?? null,
    profile: null,
  };
}

/** After the deadline (Oct 20), within the 30 days for a late report. */
const LATE = {
  settlement: { deadline: '2026-10-20' },
  context: { deadline: '2026-10-20', deadlinePassed: true, openForClaims: false, lateReportOpen: true },
};

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function show(body: unknown) {
  reply('GET', '/api/mobile/claim/acme-data-breach', [200, body]);
  await render(<ClaimScreen slug="acme-data-breach" />, { wrapper: Providers });
  await screen.findByTestId('claim-status');
}

async function layout(testID: string, y: number) {
  await fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y, width: 350, height: 300 } } });
}

beforeEach(() => {
  replies.clear();
  lastReplies.clear();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    const key = `${init.method} ${url.replace('https://api.test', '')}`;
    const next = replies.get(key)?.shift() ?? lastReplies.get(key);
    if (!next) throw new TypeError('Network request failed');
    lastReplies.set(key, next);
    const [status, body] = next;
    return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  mockSession.token = { status: 'ok', token: 'token-1', userId: 'user-1' };
  mockSession.refresh = { status: 'ok', token: 'token-2', userId: 'user-1' };
  mockRouter.push.mockClear();
  scrollTo.mockClear();
  (openExternalUrl as jest.Mock).mockClear();
  (AccessibilityInfo.sendAccessibilityEvent as jest.Mock).mockClear();
  (AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock).mockClear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('Step 2', () => {
  it('opens the official claim form in the in-app browser and scrolls to Step 3 once it closes', async () => {
    const user = userEvent.setup();
    await show(flow());
    await layout('claim-step-3-target', 1200);
    await user.press(screen.getByRole('link', { name: copy.openClaimForm.text }));
    expect(openExternalUrl).toHaveBeenCalledWith(OFFICIAL);
    // 12 pt of room above Step 3 (no header covers the content in this test).
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 1188 })));
  });
});

describe('reporting filing', () => {
  it('starts the claim, then reports it with the number and the picked date', async () => {
    const user = userEvent.setup();
    const fixedNow = new Date('2026-11-02T15:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow.getTime());
    await show(flow());

    await user.type(screen.getByLabelText(`${copy.confirmationNumber.text} ${copy.optional.text}`), '  abc   123 ');
    await user.press(screen.getByTestId('claim-filed-on'));
    const picker = screen.getByTestId('claim-filed-on-picker');
    // Only 2000-01-01 through today can be picked.
    expect(picker).toHaveProp('minimumDate', startOfDay('2000-01-01'));
    expect(picker).toHaveProp('maximumDate', endOfDay(latestFilingDay(fixedNow)));
    await fireEvent(picker, 'valueChange', { nativeEvent: { timestamp: 0, utcOffset: 0 } }, new Date(2026, 9, 30, 12));
    expect(screen.getByTestId('claim-filed-on')).toHaveAccessibilityValue({ text: 'Oct 30, 2026' });
    await user.press(screen.getByRole('button', { name: copy.doneChoosingDate.text }));

    reply('POST', '/api/claims', [201, { claim: claimView(), created: true }]);
    const submitted = claimView({ status: 'submitted', confirmation_number: 'abc 123', user_filed_on: '2026-10-30' });
    reply('PATCH', CLAIM_PATH, [200, { claim: submitted, changed: true }]);
    await user.press(screen.getByRole('button', { name: copy.iFiledMyClaim.text }));

    expect(await screen.findByLabelText(copy.savedSubmitted.text)).toBeOnTheScreen();
    expect(sent('POST', '/api/claims')).toEqual([{ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' }]);
    expect(sent('PATCH', CLAIM_PATH)).toEqual([
      { action: 'report_filed', confirmation_number: 'abc 123', filed_on: '2026-10-30' },
    ]);
    expect(screen.getAllByText('Submitted · #abc 123')).toHaveLength(2);
    // Focus goes to the "Your claim" card once it is laid out; the confirmation is spoken.
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith(copy.savedSubmitted.text, {
      queue: true,
    });
    await layout('claim-announcement', 400);
    await layout('claim-your-claim', 480);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ y: 388 }));
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('reports without a number or date for an existing claim, and "I filed today" fills in today', async () => {
    const user = userEvent.setup();
    await show(flow({ claim: claimView() }));
    await user.press(screen.getByRole('button', { name: copy.iFiledToday.text }));
    expect(screen.getByRole('button', { name: copy.clearDate.text })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: copy.clearDate.text }));
    expect(screen.getByTestId('claim-filed-on')).toHaveAccessibilityValue({ text: copy.chooseDate.text });

    reply('PATCH', CLAIM_PATH, [200, { claim: claimView({ status: 'reported_filed' }), changed: true }]);
    await user.press(screen.getByRole('button', { name: copy.iFiledMyClaim.text }));
    expect(await screen.findByLabelText(copy.savedReported.text)).toBeOnTheScreen();
    expect(sent('PATCH', CLAIM_PATH)).toEqual([{ action: 'report_filed' }]);
    expect(sent('POST', '/api/claims')).toEqual([]);
  });

  it.each([
    ['##', 'That confirmation number looks too short. Check it and try again.'],
    ['AB!', 'Use only letters, numbers, spaces and - # / . in the confirmation number.'],
    ['###', 'The confirmation number needs at least one letter or number.'],
  ])('refuses the confirmation number "%s" on the device', async (value, message) => {
    const user = userEvent.setup();
    await show(flow({ claim: claimView() }));
    await user.type(screen.getByLabelText(`${copy.confirmationNumber.text} ${copy.optional.text}`), value);
    await user.press(screen.getByRole('button', { name: copy.iFiledMyClaim.text }));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(sent('PATCH', CLAIM_PATH)).toEqual([]);
  });

  it('keeps the closed-on-list card in place when the report fails after the claim started', async () => {
    const user = userEvent.setup();
    await show(flow({ context: { closedByStatus: true, openForClaims: false } }));
    reply('POST', '/api/claims', [201, { claim: claimView(), created: true }]);
    reply('PATCH', CLAIM_PATH, [500, { error: 'Something went wrong saving your claim. Please try again.' }]);
    await user.press(screen.getByRole('button', { name: copy.iFiledMyClaim.text }));
    expect(await screen.findByText('Something went wrong saving your claim. Please try again.')).toBeOnTheScreen();
    expect(screen.getByTestId('claim-no-longer-open')).toBeOnTheScreen();
    expect(screen.queryByTestId('claim-step-1')).not.toBeOnTheScreen();
    expect(screen.getByText('Not filed yet')).toBeOnTheScreen();
  });

  it('saves the claim before filing with "Not yet: save to my claims"', async () => {
    const user = userEvent.setup();
    await show(flow());
    reply('POST', '/api/claims', [201, { claim: claimView(), created: true }]);
    await user.press(screen.getByRole('button', { name: copy.notYetSave.text }));
    expect(await screen.findByLabelText(copy.savedTracking.text)).toBeOnTheScreen();
    expect(sent('POST', '/api/claims')).toEqual([{ lawsuit_id: LAWSUIT_ID, intent: 'track' }]);
    expect(screen.getByText('Not filed yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.notYetSave.text })).not.toBeOnTheScreen();
  });
});

describe('server errors', () => {
  it.each([
    ['claim_changed', 'This claim just changed, maybe in another tab. Refresh the page and try again.', common.claimChanged.text],
    ['not_allowed', "That change isn't possible for this claim. Refresh the page and try again.", common.notAllowed.text],
    [
      'not_allowed',
      'This claim already has a confirmation number. You can correct it instead.',
      'This claim already has a confirmation number. You can correct it instead.',
    ],
    [
      'window_closed',
      'It has been more than 30 days since the deadline, so this claim can no longer be updated here.',
      'It has been more than 30 days since the deadline, so this claim can no longer be updated here.',
    ],
  ])('shows %s as the app words it', async (code, error, shown) => {
    const user = userEvent.setup();
    await show(flow({ claim: claimView() }));
    reply('PATCH', CLAIM_PATH, [409, { code, error }]);
    await user.press(screen.getByRole('button', { name: copy.iFiledMyClaim.text }));
    expect(await screen.findByText(shown)).toBeOnTheScreen();
  });

  it('offers "Log in again" when the request logged the person out', async () => {
    const user = userEvent.setup();
    mockSession.refresh = { status: 'invalid' };
    await show(flow({ claim: claimView() }));
    reply('PATCH', CLAIM_PATH, [401, { error: 'Please log in again.' }]);
    await user.press(screen.getByRole('button', { name: copy.iFiledMyClaim.text }));
    expect(await screen.findByText(common.loggedOut.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: copy.logInAgain.text }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/claim/acme-data-breach' } });
  });
});

describe('a reported claim', () => {
  it('adds the confirmation number, which is required there', async () => {
    const user = userEvent.setup();
    await show(flow({ claim: claimView({ status: 'reported_filed' }) }));
    await user.press(screen.getByRole('button', { name: copy.addNumber.text }));
    expect(await screen.findByText(copy.enterNumber.text)).toBeOnTheScreen();
    expect(sent('PATCH', CLAIM_PATH)).toEqual([]);

    reply('PATCH', CLAIM_PATH, [200, { claim: claimView({ status: 'submitted', confirmation_number: 'ABC-123' }), changed: true }]);
    await user.type(screen.getByLabelText(copy.confirmationNumber.text), 'ABC-123');
    await user.press(screen.getByRole('button', { name: copy.addNumber.text }));
    expect(await screen.findByLabelText(copy.savedNowSubmitted.text)).toBeOnTheScreen();
    expect(sent('PATCH', CLAIM_PATH)).toEqual([{ action: 'add_confirmation', confirmation_number: 'ABC-123' }]);
    expect(screen.getAllByText('Submitted · #ABC-123')).toHaveLength(2);
  });

  it('undoes the report after asking, and says until when it can be reported again', async () => {
    const user = userEvent.setup();
    await show(flow({ ...LATE, claim: claimView({ status: 'reported_filed' }) }));
    await user.press(screen.getByRole('button', { name: copy.undoButton.text }));
    expect(screen.getByText(undoWarning('Nov 19, 2026'))).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: copy.keepReport.text }));
    expect(screen.queryByText(copy.undoQuestion.text)).not.toBeOnTheScreen();
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');

    await user.press(screen.getByRole('button', { name: copy.undoButton.text }));
    reply('PATCH', CLAIM_PATH, [200, { claim: claimView(), changed: true }]);
    await user.press(screen.getByRole('button', { name: copy.yesUndo.text }));
    const message = undoneMessage('Not reported filed', 'Nov 19, 2026');
    expect(await screen.findByLabelText(message)).toBeOnTheScreen();
    expect(sent('PATCH', CLAIM_PATH)).toEqual([{ action: 'undo_report' }]);
    expect(screen.getByText(copy.deadlinePassedTitle.text)).toBeOnTheScreen();
    expect(
      screen.getByText('The deadline for this settlement was Oct 20, 2026. Did you file before then? Tell us by Nov 19, 2026.'),
    ).toBeOnTheScreen();
  });

  it('offers no undo once the late window has closed', async () => {
    await show(flow({ ...LATE, context: { ...LATE.context, lateReportOpen: false }, claim: claimView({ status: 'reported_filed' }) }));
    expect(screen.getByRole('button', { name: copy.addNumber.text })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.undoButton.text })).not.toBeOnTheScreen();
  });
});

describe('a submitted claim', () => {
  it('corrects the confirmation number', async () => {
    const user = userEvent.setup();
    await show(flow({ claim: claimView({ status: 'submitted', confirmation_number: 'ABC123' }) }));
    await user.press(screen.getByRole('button', { name: copy.correctNumber.text }));
    const field = screen.getByLabelText(copy.confirmationNumber.text);
    expect(field).toHaveDisplayValue('ABC123');
    await user.clear(field);
    await user.type(field, 'XYZ789');
    reply('PATCH', CLAIM_PATH, [200, { claim: claimView({ status: 'submitted', confirmation_number: 'XYZ789' }), changed: true }]);
    await user.press(screen.getByRole('button', { name: copy.saveNumber.text }));
    expect(await screen.findByLabelText(copy.numberUpdated.text)).toBeOnTheScreen();
    expect(sent('PATCH', CLAIM_PATH)).toEqual([{ action: 'add_confirmation', confirmation_number: 'XYZ789' }]);
    expect(screen.getAllByText('Submitted · #XYZ789')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: copy.saveNumber.text })).not.toBeOnTheScreen();
  });
});
