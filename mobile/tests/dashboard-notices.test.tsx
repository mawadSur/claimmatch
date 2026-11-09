import type { DashboardRow, NoticeItem } from '@shared/components/claims/dashboard-model';
import { legacyAnswerCopy } from '@shared/lib/claims';
import type { DashboardResponse } from '@shared/lib/mobile-contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { claim } from '@/copy/claim';
import { common } from '@/copy/common';
import { DASHBOARD_REFRESH_DELAY_MS } from '@/data/dashboard';
import { closedOutMessage, fictionalRowText, gotItForAllLabel, noticeListBody, notices } from '@/copy/notices';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { openExternalUrl } from '@/lib/external-link';

const mockFetch = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      refreshAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      signOutLocally: async () => undefined,
    },
  });
  return { ...actual, getApi: () => client };
});

jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' } }) }));

jest.mock('@/lib/reminders', () => ({
  reminderEpoch: () => 0,
  syncReminders: jest.fn(async () => ({ status: 'off' })),
}));

jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    isFlagOn: () => false,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short.', contactEmail: null, fromServer: true },
  }),
}));

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
const mockFocus = new Set<{ effect: () => unknown; cleanup: unknown }>();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    usePathname: () => '/dashboard',
    useNavigation: () => ({ setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => unknown) => {
      useEffect(() => {
        const entry = { effect, cleanup: effect() };
        mockFocus.add(entry);
        return () => {
          mockFocus.delete(entry);
          if (typeof entry.cleanup === 'function') entry.cleanup();
        };
      }, [effect]);
    },
  };
});

jest.mock('@/lib/external-link', () => ({
  ...jest.requireActual('@/lib/external-link'),
  openExternalUrl: jest.fn(async () => null),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  AndroidHaptics: { Virtual_Key: 'virtual-key' },
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

function notice(id: string, overrides: Partial<NoticeItem> = {}): NoticeItem {
  return {
    claimId: id,
    title: `Old Settlement ${id}`,
    kind: 'legacy',
    deadline: '2026-12-01',
    deadlinePassed: false,
    filing: 'open',
    officialUrl: 'https://www.oldsettlement.com/claim',
    ...overrides,
  };
}

/** The claim row the server sends with a legacy notice ("Tell us", /claim/{slug}). */
function legacyRow(id: string): DashboardRow {
  return {
    claimId: id,
    title: `Old Settlement ${id}`,
    label: 'Not filed',
    tone: 'red',
    group: 'needs_filing',
    deadlineText: 'Deadline Dec 1, 2026 · 29 days left',
    nextStep: 'ClaimMatch did not file this. File on the official site, or tell us if you already did.',
    action: { label: 'Tell us', href: `/claim/old-settlement-${id}` },
  };
}

function response(items: NoticeItem[], rows: DashboardRow[] = []): DashboardResponse {
  return {
    serverTime: '2026-11-02T15:00:00.000Z',
    profile: { firstName: 'Ana', onboarded: true, needsProfile: false },
    claims: { failed: false, rows, notices: items },
    matches: { failed: false, strong: [], possible: [], possibleHidden: 0 },
    closingSoon: { failed: false, items: [] },
    reminders: [],
  };
}

function claimView(id: string, status: string) {
  return {
    id,
    lawsuit_id: `lawsuit-${id}`,
    lawsuit_title: `Old Settlement ${id}`,
    status,
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: '2026-11-02T15:00:00.000Z',
    corrective_notice_required: true,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

type Reply = { status: number; body: unknown };
const replies: { dashboard: DashboardResponse[]; claim: Reply[]; bulk: Reply[] } = { dashboard: [], claim: [], bulk: [] };

/** Takes the next reply of a kind; the last one repeats. */
function next<T>(queue: T[]): T {
  const value = queue.length > 1 ? queue.shift() : queue[0];
  if (value === undefined) throw new Error('No reply queued');
  return value;
}

function sent(path: string): { body: unknown; init: RequestInit & { headers: Record<string, string> } }[] {
  return mockFetch.mock.calls
    .filter(([url]) => String(url) === `https://api.test${path}`)
    .map(([, init]) => ({ body: init?.body ? JSON.parse(String(init.body)) : undefined, init }));
}

async function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <DashboardScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await screen.findByText('Hi, Ana.');
}

function blur() {
  for (const entry of mockFocus) {
    if (typeof entry.cleanup === 'function') entry.cleanup();
    entry.cleanup = undefined;
  }
}

beforeEach(() => {
  // Answers schedule the dashboard's reload (DASHBOARD_REFRESH_DELAY_MS): fake timers keep it inside the test.
  jest.useFakeTimers();
  replies.dashboard = [];
  replies.claim = [];
  replies.bulk = [];
  mockRouter.push.mockClear();
  (openExternalUrl as jest.Mock).mockClear();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    if (url.endsWith('/api/mobile/dashboard')) return jsonResponse(200, next(replies.dashboard));
    const reply = url.endsWith('/api/claims/acknowledge-fictional') ? next(replies.bulk) : next(replies.claim);
    return jsonResponse(reply.status, reply.body);
  });
});

afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

/** userEvent driving the fake clock. */
function setupUser() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

describe('legacy notices', () => {
  it('says ClaimMatch did not file the claim, what to do, and opens the official claim form', async () => {
    const user = setupUser();
    replies.dashboard = [response([notice('a')], [legacyRow('a')])];
    await renderDashboard();

    const card = within(screen.getByTestId('dashboard-notices'));
    expect(card.getByText('ClaimMatch did not file your claim')).toBeOnTheScreen();
    expect(card.getByText(noticeListBody(1) as string)).toBeOnTheScreen();
    expect(
      card.getByText(`${notices.haventFiledYet.text} ${notices.stillCan.text} ${notices.beforeTheDeadline.text} Dec 1, 2026.`),
    ).toBeOnTheScreen();
    expect(card.getByText(`${notices.alreadyFiledThere.text} ${notices.dontFileAgain.text}`)).toBeOnTheScreen();

    await user.press(card.getByRole('link', { name: `${notices.openClaimForm.text} for Old Settlement a` }));
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.oldsettlement.com/claim');
  });

  it('records "I already filed", confirms it, and takes the confirmation number right in the row', async () => {
    const user = setupUser();
    const submitted = { ...claimView('a', 'submitted'), confirmation_number: 'ABC-123' };
    replies.dashboard = [response([notice('a')], [legacyRow('a')])];
    replies.claim = [
      { status: 200, body: { claim: claimView('a', 'reported_filed'), changed: true } },
      { status: 200, body: { claim: submitted, changed: true } },
    ];
    await renderDashboard();

    await user.press(screen.getByRole('button', { name: `${notices.alreadyFiled.text}: Old Settlement a` }));
    expect(await screen.findByText(legacyAnswerCopy('open', true).filedMessage)).toBeOnTheScreen();
    expect(sent('/api/claims/a')[0]).toMatchObject({ body: { action: 'report_filed' }, init: { method: 'PATCH' } });
    expect(screen.queryByRole('button', { name: `${notices.alreadyFiled.text}: Old Settlement a` })).toBeNull();

    // The web's AnsweredRow: the number is added here, without leaving Your claims; it is required.
    await user.press(screen.getByRole('button', { name: 'Add number: Old Settlement a' }));
    expect((await screen.findAllByText(claim.enterNumber.text)).length).toBeGreaterThan(0);
    expect(sent('/api/claims/a')).toHaveLength(1);
    await user.type(screen.getByLabelText(claim.confirmationNumber.text), 'ABC-123');
    await user.press(screen.getByRole('button', { name: 'Add number: Old Settlement a' }));

    expect(await screen.findByText(claim.savedNowSubmitted.text)).toBeOnTheScreen();
    expect(sent('/api/claims/a')[1]).toMatchObject({
      body: { action: 'add_confirmation', confirmation_number: 'ABC-123' },
      init: { method: 'PATCH' },
    });
    expect(screen.queryByLabelText(claim.confirmationNumber.text)).toBeNull();
    expect(screen.queryByText(legacyAnswerCopy('open', true).filedMessage)).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('keeps the typed number and shows the error when adding it fails', async () => {
    const user = setupUser();
    replies.dashboard = [response([notice('a')], [legacyRow('a')])];
    replies.claim = [
      { status: 200, body: { claim: claimView('a', 'reported_filed'), changed: true } },
      { status: 409, body: { error: 'Tell us you filed first. Then you can add your confirmation number.', code: 'not_allowed' } },
    ];
    await renderDashboard();

    await user.press(screen.getByRole('button', { name: `${notices.alreadyFiled.text}: Old Settlement a` }));
    await user.type(await screen.findByLabelText(claim.confirmationNumber.text), 'ABC-123');
    await user.press(screen.getByRole('button', { name: 'Add number: Old Settlement a' }));

    // A specific not_allowed text shows as sent (only "Refresh the page" texts are reworded).
    expect(await screen.findByText('Tell us you filed first. Then you can add your confirmation number.')).toBeOnTheScreen();
    expect(screen.getByLabelText(claim.confirmationNumber.text)).toHaveDisplayValue('ABC-123');
  });

  it('records "I haven’t filed yet" with the wording for where the settlement stands', async () => {
    const user = setupUser();
    const copy = legacyAnswerCopy('closed_on_list', true);
    replies.dashboard = [response([notice('a', { filing: 'closed_on_list', officialUrl: null })], [legacyRow('a')])];
    replies.claim = [{ status: 200, body: { claim: claimView('a', 'self_file'), changed: true } }];
    await renderDashboard();

    const card = within(screen.getByTestId('dashboard-notices'));
    expect(
      card.getByText(
        `${notices.haventFiledYet.text} ${notices.closedOnList.text} ${notices.checkStillTakes.text} ${notices.noOfficialLink.text}`,
      ),
    ).toBeOnTheScreen();
    expect(card.queryByRole('link')).toBeNull();

    await user.press(screen.getByRole('button', { name: `${copy.notYetLabel}: Old Settlement a` }));
    expect(await screen.findByText(copy.notYetMessage)).toBeOnTheScreen();
    expect(sent('/api/claims/a')[0].body).toEqual({ action: 'acknowledge_notice' });
    expect(screen.queryByRole('button', { name: 'Add number: Old Settlement a' })).toBeNull();
  });

  it('keeps the buttons and shows the mobile wording when the server refuses the change', async () => {
    const user = setupUser();
    replies.dashboard = [response([notice('a', { filing: 'deadline_passed', deadlinePassed: true, deadline: '2026-10-01' })])];
    replies.claim = [{ status: 409, body: { error: 'That change isn’t possible. Refresh the page and try again.', code: 'not_allowed' } }];
    await renderDashboard();

    expect(screen.getByText(`${notices.deadlineWas.text} Oct 1, 2026${notices.deadlineWasTail.text}`)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: `${legacyAnswerCopy('deadline_passed', true).notYetLabel}: Old Settlement a` }));
    expect(await screen.findByText(common.notAllowed.text)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `${notices.alreadyFiled.text}: Old Settlement a` })).toBeEnabled();
  });

  it('shows the first five rows until Show all', async () => {
    const user = setupUser();
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => notice(id));
    replies.dashboard = [response(items)];
    await renderDashboard();

    expect(screen.getByText('ClaimMatch did not file your claims')).toBeOnTheScreen();
    expect(screen.getByText('Old Settlement e')).toBeOnTheScreen();
    expect(screen.queryByText('Old Settlement f')).toBeNull();
    const showAll = screen.getByRole('button', { name: 'Show all 7' });
    expect(showAll).toBeCollapsed();
    await user.press(showAll);
    expect(screen.getByText('Old Settlement g')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show all 7' })).toBeNull();
  });

  it('keeps an answered row while the screen is open after the reload drops it, and lets it go once left', async () => {
    const user = setupUser();
    const copy = legacyAnswerCopy('open', true);
    replies.dashboard = [response([notice('a'), notice('b')], [legacyRow('a'), legacyRow('b')]), response([notice('b')], [legacyRow('b')])];
    replies.claim = [{ status: 200, body: { claim: claimView('a', 'self_file'), changed: true } }];
    await renderDashboard();

    await user.press(screen.getByRole('button', { name: `${copy.notYetLabel}: Old Settlement a` }));
    expect(await screen.findByText(copy.notYetMessage)).toBeOnTheScreen();
    // The dashboard reloads once the answers settle.
    expect(sent('/api/mobile/dashboard')).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_DELAY_MS);
    });
    await waitFor(() => expect(sent('/api/mobile/dashboard')).toHaveLength(2));
    expect(screen.getByText(copy.notYetMessage)).toBeOnTheScreen();
    expect(screen.getByText('ClaimMatch did not file your claims')).toBeOnTheScreen();

    await act(async () => blur());
    expect(screen.queryByText(copy.notYetMessage)).toBeNull();
    expect(screen.queryByText('Old Settlement a')).toBeNull();
    expect(screen.getByText('ClaimMatch did not file your claim')).toBeOnTheScreen();
  });
});

describe('fictional settlements', () => {
  it('closes out a single one with Got it, without the bulk button', async () => {
    const user = setupUser();
    replies.dashboard = [response([notice('x', { kind: 'fictional', officialUrl: null })])];
    replies.claim = [{ status: 200, body: { claim: claimView('x', 'withdrawn'), changed: true } }];
    await renderDashboard();

    expect(screen.getByText('A settlement in your list was not real')).toBeOnTheScreen();
    expect(screen.getByText(fictionalRowText())).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Got it for all/ })).toBeNull();

    await user.press(screen.getByRole('button', { name: `${notices.gotIt.text}: Old Settlement x` }));
    expect(await screen.findByText(notices.fictionalDone.text)).toBeOnTheScreen();
    expect(sent('/api/claims/x')[0].body).toEqual({ action: 'acknowledge_notice' });
  });

  it('closes out every fictional one at once with "Got it for all"', async () => {
    const user = setupUser();
    const ids = ['x', 'y', 'z'];
    replies.dashboard = [response([notice('a'), ...ids.map((id) => notice(id, { kind: 'fictional', officialUrl: null }))])];
    replies.bulk = [{ status: 200, body: { claims: ids.map((id) => claimView(id, 'withdrawn')), acknowledged: 3 } }];
    await renderDashboard();

    await user.press(screen.getByRole('button', { name: gotItForAllLabel(3) }));
    expect(await screen.findByText(closedOutMessage(3))).toBeOnTheScreen();
    expect(screen.getAllByText(notices.fictionalDone.text)).toHaveLength(3);
    expect(screen.queryByRole('button', { name: gotItForAllLabel(3) })).toBeNull();
    expect(screen.getByRole('button', { name: `${notices.alreadyFiled.text}: Old Settlement a` })).toBeOnTheScreen();

    const [request] = sent('/api/claims/acknowledge-fictional');
    expect(request.body).toEqual({});
    expect(request.init.method).toBe('POST');
    expect(request.init.headers['Content-Type']).toBe('application/json');
  });

  it('shows the error and keeps each row’s Got it when the bulk request fails', async () => {
    const user = setupUser();
    replies.dashboard = [response(['x', 'y'].map((id) => notice(id, { kind: 'fictional', officialUrl: null })))];
    replies.bulk = [{ status: 500, body: { error: 'Something went wrong. Please try again.' } }];
    await renderDashboard();

    await user.press(screen.getByRole('button', { name: gotItForAllLabel(2) }));
    expect(await screen.findByTestId('dashboard-notices-error')).toHaveTextContent(common.genericError.text);
    expect(screen.getByRole('button', { name: `${notices.gotIt.text}: Old Settlement x` })).toBeOnTheScreen();
    expect(screen.queryByText(notices.fictionalDone.text)).toBeNull();
  });

  it('counts the rows saved before the bulk request failed as answered, and shows the error', async () => {
    const user = setupUser();
    const error = "Some of these couldn't be saved. Please try again in a minute.";
    replies.dashboard = [response(['x', 'y', 'z'].map((id) => notice(id, { kind: 'fictional', officialUrl: null })))];
    replies.bulk = [{ status: 500, body: { error, claims: [claimView('x', 'withdrawn')], acknowledged: 1 } }];
    await renderDashboard();

    await user.press(screen.getByRole('button', { name: gotItForAllLabel(3) }));
    expect(await screen.findByTestId('dashboard-notices-error')).toHaveTextContent(error);
    expect(screen.getByTestId('dashboard-notices-done')).toHaveTextContent(closedOutMessage(1));
    expect(screen.getAllByText(notices.fictionalDone.text)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: `${notices.gotIt.text}: Old Settlement x` })).toBeNull();
    expect(screen.getByRole('button', { name: `${notices.gotIt.text}: Old Settlement y` })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: gotItForAllLabel(2) })).toBeOnTheScreen();
  });
});
