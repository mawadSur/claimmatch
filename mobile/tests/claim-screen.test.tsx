import { legacyAnswerCopy } from '@shared/lib/claims';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { app } from '@/copy/app';
import { claim as copy, closedIfWrongSentence, closedSentence, recheckingSentence } from '@/copy/claim';
import { common } from '@/copy/common';
import { notices } from '@/copy/notices';
import { shared } from '@/copy/shared';
import { ClaimScreen } from '@/features/claim';

const mockFetch = jest.fn();
const mockSession: { token: Record<string, string>; refresh: Record<string, string>; signOuts: number } = {
  token: { status: 'ok', token: 'token-1', userId: 'user-1' },
  refresh: { status: 'ok', token: 'token-2', userId: 'user-1' },
  signOuts: 0,
};

// The real API client (auth, error mapping, parsing) over a fake network and session.
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => mockSession.token,
      refreshAccessToken: async () => mockSession.refresh,
      signOutLocally: async () => {
        mockSession.signOuts += 1;
        mockSession.token = { status: 'none' };
      },
    },
  });
  return { ...actual, getApi: () => client };
});
const mockAuth = { sessionEnded: false };
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' }, sessionEnded: mockAuth.sessionEnded }),
}));
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
const PATH = '/api/mobile/claim/acme-data-breach';

type Reply = [number, unknown] | 'network';
const replies = new Map<string, Reply[]>();
const lastReplies = new Map<string, Reply>();

/** Queues an answer for "METHOD /path". Each is used once; the last one used repeats. */
function reply(method: string, path: string, answer: Reply) {
  replies.set(`${method} ${path}`, [...(replies.get(`${method} ${path}`) ?? []), answer]);
}

function sentBodies(method: string, path: string): unknown[] {
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
      eligibility: 'People whose data was exposed.',
      proof: 'unknown',
      formFieldOrder: null,
      assistedFilingAllowed: false,
      payoutReportEnabled: false,
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

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function show(first: Reply) {
  reply('GET', PATH, first);
  await render(<ClaimScreen slug="acme-data-breach" />, { wrapper: Providers });
}

/** Loads the claim screen again, as a focus or a return to the app does, and lets React Query tell the screen. */
async function reload(answer: Reply) {
  reply('GET', PATH, answer);
  await act(async () => {
    await client.refetchQueries({ queryKey: ['claim', 'acme-data-breach'] });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  replies.clear();
  lastReplies.clear();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    const key = `${init.method} ${url.replace('https://api.test', '')}`;
    const next = replies.get(key)?.shift() ?? lastReplies.get(key);
    if (next) lastReplies.set(key, next);
    if (!next || next === 'network') throw new TypeError('Network request failed');
    const [status, body] = next;
    return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  mockSession.token = { status: 'ok', token: 'token-1', userId: 'user-1' };
  mockSession.refresh = { status: 'ok', token: 'token-2', userId: 'user-1' };
  mockSession.signOuts = 0;
  mockAuth.sessionEnded = false;
  mockRouter.push.mockClear();
  mockRouter.dismissTo.mockClear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
});

afterEach(() => client.clear());

describe('claim screen states', () => {
  it('shows a labeled skeleton while loading', async () => {
    let answer: (response: Response) => void = () => undefined;
    mockFetch.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    await render(<ClaimScreen slug="acme-data-breach" />, { wrapper: Providers });
    expect(screen.getByLabelText(copy.loadingSteps.text)).toBeOnTheScreen();

    answer({ ok: true, status: 200, text: async () => JSON.stringify(flow()) } as unknown as Response);
    expect(await screen.findByText(copy.notTrackingYet.text)).toBeOnTheScreen();
    expect(screen.queryByLabelText(copy.loadingSteps.text)).not.toBeOnTheScreen();
  });

  it('asks a signed-out person to log in and come back to this claim (401)', async () => {
    const user = userEvent.setup();
    mockSession.token = { status: 'none' };
    await show([401, {}]);
    expect(await screen.findByText(shared.claimLoginTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(shared.claimLoginBody.text)).toBeOnTheScreen();
    expect(screen.queryByText(common.loggedOut.text)).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/claim/acme-data-breach' } });
  });

  it('says "You were logged out." when a write found the session dead and signed out on this device', async () => {
    // The write's own error (with "Log in again") went with the claim data; the reload finds no session.
    mockSession.token = { status: 'none' };
    mockAuth.sessionEnded = true;
    await show([401, {}]);
    expect(await screen.findByText(common.loggedOut.text)).toBeOnTheScreen();
    expect(screen.getByText(shared.claimLoginTitle.text)).toBeOnTheScreen();
  });

  it('says so when the request itself logged the person out', async () => {
    mockSession.refresh = { status: 'invalid' };
    await show([401, { error: 'Please log in again.' }]);
    expect(await screen.findByText(common.loggedOut.text)).toBeOnTheScreen();
    expect(screen.getByText(shared.claimLoginTitle.text)).toBeOnTheScreen();
    expect(mockSession.signOuts).toBe(1);
  });

  it('shows the not-found copy for a 404', async () => {
    const user = userEvent.setup();
    await show([404, { code: 'not_found' }]);
    expect(await screen.findByText(app.notFoundTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(app.notFoundBody.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: app.browseOpenSettlements.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/lawsuits');
  });

  it('shows the load error for a 503 and loads again with Try again', async () => {
    const user = userEvent.setup();
    await show([503, { code: 'load_error', what: 'your claim' }]);
    // The web's LoadError title: "We couldn’t load {what}".
    expect(await screen.findByText(`${copy.loadErrorLead.text} your claim`)).toBeOnTheScreen();
    expect(screen.getByText(copy.loadErrorBody.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: copy.goToYourClaims.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/dashboard');

    reply('GET', PATH, [200, flow()]);
    await user.press(screen.getByRole('button', { name: common.tryAgain.text }));
    expect(await screen.findByText(copy.notTrackingYet.text)).toBeOnTheScreen();
  });

  it('keeps the claim and what was typed when a reload answers 503 load_error, and says why above it', async () => {
    const user = userEvent.setup();
    await show([200, flow({ claim: claimView() })]);
    const field = await screen.findByLabelText(`${copy.confirmationNumber.text} ${copy.optional.text}`);
    await user.type(field, 'ABC-123');

    await reload([503, { code: 'load_error', what: 'your claim' }]);
    expect(screen.getByTestId('claim-flow')).toBeOnTheScreen();
    expect(screen.queryByTestId('claim-load-error')).toBeNull();
    expect(screen.getByLabelText(`${copy.confirmationNumber.text} ${copy.optional.text}`)).toHaveDisplayValue('ABC-123');
    const notice = screen.getByTestId('claim-refresh-error');
    expect(within(notice).getByText(`${copy.loadErrorLead.text} your claim`)).toBeOnTheScreen();
    expect(within(notice).getByText(common.loadErrorBody.text)).toBeOnTheScreen();

    // The next good load clears the notice and still keeps the typing.
    await reload([200, flow({ claim: claimView() })]);
    expect(screen.queryByTestId('claim-refresh-error')).toBeNull();
    expect(screen.getByLabelText(`${copy.confirmationNumber.text} ${copy.optional.text}`)).toHaveDisplayValue('ABC-123');
  });

  it('keeps the claim when a reload cannot reach the server', async () => {
    await show([200, flow({ claim: claimView() })]);
    await screen.findByTestId('claim-flow');
    await reload('network');
    expect(screen.getByTestId('claim-flow')).toBeOnTheScreen();
    expect(screen.getByTestId('claim-refresh-error')).toHaveTextContent(common.networkError.text);
  });

  it('shows the network message with Try again when the screen cannot be reached', async () => {
    await show('network');
    expect(await screen.findByText(common.networkError.text)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: common.tryAgain.text })).toBeOnTheScreen();
  });

  it('shows the server text for auth_unavailable and keeps the session', async () => {
    const text = 'We couldn’t confirm you’re logged in right now. Please try again in a minute.';
    await show([503, { code: 'auth_unavailable', error: text }]);
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(mockSession.signOuts).toBe(0);
  });

  it('shows the closed card, without an official link', async () => {
    const user = userEvent.setup();
    await show([
      200,
      { kind: 'closed', slug: 'old-one', title: 'Old One', category: null, deadline: '2026-01-01', deadlinePassed: true, officialUrl: null },
    ]);
    expect(await screen.findByText(copy.closedTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(`${closedSentence('Jan 1, 2026')} ${copy.closedNoOfficial.text}`)).toBeOnTheScreen();
    expect(screen.getByText(copy.closedKeepConfirmation.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: app.browseOpenSettlements.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/lawsuits');
  });

  it('shows the closed card with the official link', async () => {
    await show([
      200,
      { kind: 'closed', slug: 'old-one', title: 'Old One', category: 'Privacy', deadline: null, deadlinePassed: false, officialUrl: OFFICIAL },
    ]);
    expect(await screen.findByText(`${copy.closedNoLonger.text} ${closedIfWrongSentence()}`)).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: notices.checkOfficialSite.text })).toBeOnTheScreen();
    expect(screen.getByText('Privacy')).toBeOnTheScreen();
  });
});

describe('claim flow', () => {
  it('shows the status panel, the three steps and the required lines with no claim yet', async () => {
    await show([200, flow()]);
    expect(await screen.findByText(copy.notTrackingYet.text)).toBeOnTheScreen();
    expect(screen.getByText('Acme Data Breach')).toBeOnTheScreen();
    expect(screen.getByLabelText('Dec 1, 2026, 29 days left')).toBeOnTheScreen();
    expect(screen.getByText(copy.statusNote.text)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Step 1: Check that you qualify' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Step 2: File on the official site' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Step 3: Tell us when you’ve filed' })).toBeOnTheScreen();
    expect(screen.getByText('People whose data was exposed.')).toBeOnTheScreen();
    expect(screen.getByText(common.unverifiedLabel.text)).toBeOnTheScreen();
    expect(screen.getByText(copy.filingIsFree.text)).toBeOnTheScreen();
    expect(screen.getByText(copy.packetNote.text)).toBeOnTheScreen();
    expect(screen.getByText(copy.proofUnknown.text)).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: copy.openClaimForm.text })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.iFiledMyClaim.text })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.notYetSave.text })).toBeOnTheScreen();
    // The compact legal disclaimer, with "Show all".
    expect(screen.getByText('Full legal disclaimer text.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: shared.showAll.text })).toBeOnTheScreen();
    // The site footer's SettleSignal credit, as under every web page.
    expect(
      within(screen.getByTestId('claim-credit')).getByText(
        `${shared.creditFooterLead.text} ${shared.creditFooterSite.text}${shared.creditFooterUsedUnder.text} ${shared.creditFooterLicense.text}${shared.creditFooterTail.text}`,
      ),
    ).toBeOnTheScreen();
    // Step 2 never says the official form is inside ClaimMatch.
    expect(screen.getByText(copy.opensInBrowser.text)).toBeOnTheScreen();
    expect(screen.queryByText(/inside ClaimMatch/)).toBeNull();
  });

  it('says where to look when there is no official link or rules', async () => {
    await show([
      200,
      flow({ settlement: { officialUrl: null, eligibility: null, sourceUrl: 'https://settlesignal.com/x', sourceHost: 'settlesignal.com' } }),
    ]);
    expect(await screen.findByText(copy.noRules.text)).toBeOnTheScreen();
    expect(screen.getByText(copy.noNoticeLink.text)).toBeOnTheScreen();
    expect(
      screen.getByText(
        `${copy.noOfficialSite.text} Our listing came from settlesignal.com, which is not the official site. Look there for the official link. ${copy.onlyFileNamed.text}`,
      ),
    ).toBeOnTheScreen();
    // The link to the source may wrap at the host's dot; it is announced as it is.
    expect(screen.getByRole('link', { name: 'settlesignal.com' })).toHaveTextContent('settlesignal.\u200Bcom');
    expect(screen.queryByRole('link', { name: copy.openClaimForm.text })).not.toBeOnTheScreen();
  });

  it('tracks a self_file claim without offering "save" again', async () => {
    await show([200, flow({ claim: claimView() })]);
    expect(await screen.findByText('Not filed yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.iFiledMyClaim.text })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.notYetSave.text })).not.toBeOnTheScreen();
  });

  it('shows the "Your claim" card for a reported claim', async () => {
    await show([200, flow({ claim: claimView({ status: 'reported_filed', user_filed_on: '2026-10-30' }) })]);
    expect(await screen.findByText('Reported filed by you on Oct 30, 2026')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: copy.yourClaim.text })).toBeOnTheScreen();
    expect(screen.getByText(copy.nextAddNumber.text)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.addNumber.text })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.undoButton.text })).toBeOnTheScreen();
    expect(screen.getByText(`${copy.checkOnClaim.text} official site.`)).toBeOnTheScreen();
    expect(screen.queryByTestId('claim-step-1')).not.toBeOnTheScreen();
  });

  it('shows a submitted claim with its confirmation number', async () => {
    await show([
      200,
      flow({ claim: claimView({ status: 'submitted', confirmation_number: 'ABC123', user_filed_on: '2026-10-30' }) }),
    ]);
    expect(await screen.findAllByText('Submitted · #ABC123')).toHaveLength(2);
    expect(screen.getByText(`${copy.keepNumber.text} You filed on Oct 30, 2026.`)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.correctNumber.text })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.undoButton.text })).not.toBeOnTheScreen();
  });

  it('shows "closed on our list" with the report form when there was no claim at load', async () => {
    await show([200, flow({ context: { closedByStatus: true, openForClaims: false } })]);
    expect(await screen.findByText(copy.closedOnListTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(recheckingSentence(true))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.iFiledMyClaim.text })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.notYetSave.text })).not.toBeOnTheScreen();
  });

  it('shows the caveat above the steps for a claim on a settlement our list marks closed', async () => {
    await show([200, flow({ context: { closedByStatus: true, openForClaims: false }, claim: claimView() })]);
    expect(await screen.findByText(copy.caveatClosedWithDeadline.text)).toBeOnTheScreen();
    expect(screen.getByTestId('claim-step-1')).toBeOnTheScreen();
  });

  it('says a claim can no longer be updated more than 30 days after the deadline', async () => {
    await show([
      200,
      flow({
        settlement: { deadline: '2026-09-01' },
        context: { deadline: '2026-09-01', deadlinePassed: true, openForClaims: false, lateReportOpen: false },
        claim: claimView(),
      }),
    ]);
    expect(await screen.findByText(copy.deadlinePassedTitle.text)).toBeOnTheScreen();
    expect(screen.getByText('The deadline for this settlement was Sep 1, 2026.')).toBeOnTheScreen();
    expect(screen.getByText(copy.windowClosedClaim.text)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.iFiledMyClaim.text })).not.toBeOnTheScreen();
  });

  it('shows the fictional notice and closes it out with "Got it"', async () => {
    const user = userEvent.setup();
    await show([200, flow({ context: { fictional: true, openForClaims: false, lateReportOpen: false }, claim: claimView() })]);
    expect(await screen.findByText(notices.fictionalTitle.text)).toBeOnTheScreen();
    expect(screen.getByText('Not a real settlement')).toBeOnTheScreen();
    expect(screen.getByText(`“Acme Data Breach” ${notices.fictionalText.text}`)).toBeOnTheScreen();
    expect(screen.queryByText(copy.statusNote.text)).not.toBeOnTheScreen();

    const closed = claimView({ status: 'withdrawn', corrective_notice_answered_at: '2026-11-02T15:00:00.000Z' });
    reply('PATCH', `/api/claims/${CLAIM_ID}`, [200, { claim: closed, changed: true }]);
    await user.press(screen.getByRole('button', { name: notices.gotIt.text }));
    expect(await screen.findByText(notices.allSet.text)).toBeOnTheScreen();
    expect(screen.getByLabelText(notices.fictionalDone.text)).toBeOnTheScreen();
    expect(sentBodies('PATCH', `/api/claims/${CLAIM_ID}`)).toEqual([{ action: 'acknowledge_notice' }]);
  });

  it('shows the corrective notice for a claim the old flow showed as filed, and records "not yet"', async () => {
    const user = userEvent.setup();
    await show([200, flow({ claim: claimView({ status: 'submitted', corrective_notice_required: true }) })]);
    expect(await screen.findByText(notices.claimTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(notices.claimBody.text)).toBeOnTheScreen();
    expect(
      screen.getByText('Haven’t filed yet? You still can, on the official site before the deadline, Dec 1, 2026.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: notices.openClaimForm.text })).toBeOnTheScreen();
    expect(screen.getByText(`${notices.alreadyFiledThere.text} ${notices.dontFileAgain.text}`)).toBeOnTheScreen();

    const answers = legacyAnswerCopy('open', true);
    const answered = claimView({ corrective_notice_answered_at: '2026-11-02T15:00:00.000Z' });
    reply('PATCH', `/api/claims/${CLAIM_ID}`, [200, { claim: answered, changed: true }]);
    await user.press(screen.getByRole('button', { name: answers.notYetLabel }));
    expect(await screen.findByLabelText(answers.notYetMessage)).toBeOnTheScreen();
    expect(sentBodies('PATCH', `/api/claims/${CLAIM_ID}`)).toEqual([{ action: 'acknowledge_notice' }]);
    await waitFor(() => expect(screen.queryByText(notices.claimTitle.text)).not.toBeOnTheScreen());
    expect(screen.getByText('Not filed yet')).toBeOnTheScreen();
  });
});
