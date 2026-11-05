import type { ClosingSoonItem, DashboardRow } from '@shared/components/claims/dashboard-model';
import type { AppMatch, DashboardResponse } from '@shared/lib/mobile-contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { app } from '@/copy/app';
import { common } from '@/copy/common';
import { dashboard } from '@/copy/dashboard';
import { shared } from '@/copy/shared';
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

const mockAuth = { status: 'signedIn', user: { id: 'user-1' } as { id: string } | null, sessionEnded: false };
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

jest.mock('@/lib/reminders', () => ({
  reminderEpoch: () => 0,
  syncReminders: jest.fn(async () => ({ status: 'off' })),
}));

const mockFlags: Record<string, boolean> = {};
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    status: 'ready',
    isFlagOn: (name: string) => mockFlags[name] === true,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short.', contactEmail: null, fromServer: true },
  }),
}));

const mockRouter = { push: jest.fn(), navigate: jest.fn() };
const mockNavigation = { setParams: jest.fn() };
const mockParams: { value: Record<string, string> } = { value: {} };
/** Focus effects of mounted screens; blur() and focus() drive them like expo-router does. */
const mockFocus = new Set<{ effect: () => unknown; cleanup: unknown }>();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => mockRouter,
    useNavigation: () => mockNavigation,
    useLocalSearchParams: () => mockParams.value,
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

function row(overrides: Partial<DashboardRow> = {}): DashboardRow {
  return {
    claimId: 'c1',
    title: 'Acme Data Breach',
    label: 'Not filed yet',
    tone: 'amber',
    group: 'needs_filing',
    deadlineText: 'Deadline Dec 1, 2026 · 29 days left',
    nextStep: 'If you qualify, file on the official site before the deadline, then tell us.',
    action: { label: 'How to file', href: '/claim/acme-data-breach' },
    ...overrides,
  };
}

function match(overrides: Partial<AppMatch> = {}): AppMatch {
  return {
    id: 'm1',
    slug: 'beta-bank-fees',
    title: 'Beta Bank Fees',
    deadlineText: 'Deadline Jan 5, 2027 · 64 days left',
    reasons: ['You live in CA'],
    strength: 'strong',
    label: 'Strong match',
    officialUrl: null,
    ...overrides,
  };
}

function closing(overrides: Partial<ClosingSoonItem> = {}): ClosingSoonItem {
  return {
    id: 'l9',
    slug: 'gamma-cookies',
    title: 'Gamma Cookies',
    deadline: '2026-11-10',
    deadlineText: 'Deadline Nov 10, 2026 · 8 days left',
    officialUrl: 'https://www.gammasettlement.com/claim',
    ...overrides,
  };
}

function response(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    serverTime: '2026-11-02T15:00:00.000Z',
    profile: { firstName: 'Ana', onboarded: true, needsProfile: false },
    claims: { failed: false, rows: [row()], notices: [] },
    matches: { failed: false, strong: [match()], possible: [], possibleHidden: 0 },
    closingSoon: { failed: false, items: [closing()] },
    reminders: [],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** Answers GET /api/mobile/dashboard with these bodies in turn (the last one repeats). */
function serve(...bodies: (DashboardResponse | { status: number; body: unknown } | 'network')[]) {
  mockFetch.mockImplementation(async (url: string) => {
    if (!url.endsWith('/api/mobile/dashboard')) throw new Error(`Unexpected request ${url}`);
    const next = bodies.length > 1 ? bodies.shift() : bodies[0];
    if (next === 'network') throw new TypeError('Network request failed');
    if (next && 'status' in next && !('serverTime' in next)) return jsonResponse(next.status, next.body);
    return jsonResponse(200, next);
  });
}

function dashboardCalls(): number {
  return mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/api/mobile/dashboard')).length;
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
  return client;
}

function blur() {
  for (const entry of mockFocus) {
    if (typeof entry.cleanup === 'function') entry.cleanup();
    entry.cleanup = undefined;
  }
}

function focus() {
  for (const entry of mockFocus) entry.cleanup = entry.effect();
}

beforeEach(() => {
  mockFetch.mockReset();
  mockRouter.push.mockClear();
  mockRouter.navigate.mockClear();
  mockNavigation.setParams.mockClear();
  (openExternalUrl as jest.Mock).mockClear();
  Object.assign(mockAuth, { status: 'signedIn', user: { id: 'user-1' }, sessionEnded: false });
  mockParams.value = {};
  for (const name of Object.keys(mockFlags)) delete mockFlags[name];
});

describe('signed out', () => {
  it('asks to log in, coming back to /dashboard, and loads nothing', async () => {
    Object.assign(mockAuth, { status: 'signedOut', user: null });
    const user = userEvent.setup();
    await renderDashboard();

    expect(screen.getByText(shared.welcomeBack.text)).toBeOnTheScreen();
    expect(screen.getByText(shared.logInToSeeClaims.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/dashboard' } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('says "You were logged out." when the session ended without signing out', async () => {
    Object.assign(mockAuth, { status: 'signedOut', user: null, sessionEnded: true });
    await renderDashboard();
    expect(screen.getByText(common.loggedOut.text)).toBeOnTheScreen();
  });
});

describe('loading and errors', () => {
  it('shows the skeleton, read as "Loading your claims…", until the dashboard arrives', async () => {
    let answer: (value: Response) => void = () => undefined;
    mockFetch.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    await renderDashboard();

    expect(screen.getByLabelText(dashboard.loading.text)).toBeOnTheScreen();
    await act(async () => answer(jsonResponse(200, response())));
    expect(await screen.findByText('Hi, Ana.')).toBeOnTheScreen();
    expect(screen.queryByLabelText(dashboard.loading.text)).toBeNull();
  });

  it('shows the web’s error with Try again and Browse settlements when the whole request fails', async () => {
    const user = userEvent.setup();
    serve({ status: 500, body: { error: 'Internal error' } }, response());
    await renderDashboard();

    expect(await screen.findByText(dashboard.errorTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.errorBody.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: dashboard.browseSettlements.text }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/lawsuits');

    await user.press(screen.getByRole('button', { name: common.tryAgain.text }));
    expect(await screen.findByText('Hi, Ana.')).toBeOnTheScreen();
    expect(dashboardCalls()).toBe(2);
  });

  it('says when the phone is offline instead of blaming the server', async () => {
    serve('network');
    await renderDashboard();
    expect(await screen.findByText(dashboard.errorTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(common.networkError.text)).toBeOnTheScreen();
  });

  it('keeps the dashboard on screen and says so when a reload fails', async () => {
    serve(response(), 'network');
    const client = await renderDashboard();
    await screen.findByText('Hi, Ana.');

    await act(async () => {
      await client.refetchQueries({ queryKey: ['dashboard'] });
    });
    expect(await screen.findByTestId('dashboard-refetch-error')).toHaveTextContent(common.networkError.text);
    expect(screen.getByText('Acme Data Breach')).toBeOnTheScreen();
  });
});

describe('sections', () => {
  it('greets by first name and words the header for the fee flag', async () => {
    serve(response());
    await renderDashboard();
    expect(await screen.findByText('Hi, Ana.')).toBeOnTheScreen();
    expect(screen.getByText(`${dashboard.introLead.text} ${dashboard.introFeeOff.text} ${dashboard.introTail.text}`)).toBeOnTheScreen();
  });

  it('uses the fee-disclosure sentence when FEE_DISCLOSURE_ENABLED is on, and no greeting without a name', async () => {
    mockFlags.FEE_DISCLOSURE_ENABLED = true;
    serve(response({ profile: { firstName: '', onboarded: true, needsProfile: false } }));
    await renderDashboard();
    expect(
      await screen.findByText(`${dashboard.introLead.text} ${dashboard.introFeeOn.text} ${dashboard.introTail.text}`),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/^Hi,/)).toBeNull();
  });

  it('groups claims by next step in the web’s order, with status, deadline, next step and the claim link', async () => {
    const user = userEvent.setup();
    serve(
      response({
        claims: {
          failed: false,
          notices: [],
          rows: [
            row({ claimId: 'c3', title: 'Delta Refunds', label: 'Submitted', tone: 'green', group: 'submitted', action: { label: 'View', href: '/claim/delta-refunds' } }),
            row({ claimId: 'c1' }),
            row({ claimId: 'c2', title: 'Epsilon Fees', label: 'Reported filed', tone: 'brand', group: 'reported', action: { label: 'Add number', href: '/claim/epsilon-fees' } }),
          ],
        },
      }),
    );
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    const headings = screen.getAllByRole('header').map((node) => node.props.children);
    expect(headings).toEqual(expect.arrayContaining(['Needs filing (1)', 'Reported filed (1)', 'Submitted (1)']));
    expect(headings.indexOf('Needs filing (1)')).toBeLessThan(headings.indexOf('Reported filed (1)'));
    expect(headings.indexOf('Reported filed (1)')).toBeLessThan(headings.indexOf('Submitted (1)'));
    expect(screen.getByText(dashboard.hintReported.text)).toBeOnTheScreen();

    const acme = within(screen.getByTestId('claim-row-c1'));
    expect(acme.getByText('Not filed yet')).toBeOnTheScreen();
    expect(acme.getByText('Deadline Dec 1, 2026 · 29 days left')).toBeOnTheScreen();
    expect(acme.getByText(row().nextStep)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Add number: Epsilon Fees' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/claim/epsilon-fees');
  });

  it('shows the matches without any score, and Possible behind Show or hide', async () => {
    const user = userEvent.setup();
    const scored = { ...match(), label: '93% match', score: 0.93 } as AppMatch;
    serve(
      response({
        matches: {
          failed: false,
          strong: [scored],
          possible: [match({ id: 'm2', slug: 'zeta-tv', title: 'Zeta TV', strength: 'possible', label: 'Possible match', reasons: [] })],
          possibleHidden: 3,
        },
      }),
    );
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    const strong = within(screen.getByTestId('match-m1'));
    expect(strong.getByText('Strong match')).toBeOnTheScreen();
    expect(strong.getByText('You live in CA')).toBeOnTheScreen();
    expect(screen.queryByText(/%|0\.93|93/)).toBeNull();

    const toggle = screen.getByRole('button', { name: 'Possible matches (1, 3 more not shown)' });
    expect(toggle).toBeCollapsed();
    expect(screen.queryByText('Zeta TV')).toBeNull();
    await user.press(toggle);
    expect(screen.getByText('These are state-only or broader fits. Showing up to 20.')).toBeOnTheScreen();
    expect(within(screen.getByTestId('match-m2')).getByText('Possible match')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'How to file: Beta Bank Fees' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/claim/beta-bank-fees');
    await user.press(screen.getByRole('button', { name: dashboard.editProfile.text }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/details', { withAnchor: true });
  });

  it('shows Closing soon with its unverified chip, the official site and How to file', async () => {
    const user = userEvent.setup();
    serve(response());
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    const card = within(screen.getByTestId('closing-soon-l9'));
    expect(card.getByText(common.unverifiedLabel.text)).toBeOnTheScreen();
    expect(card.getByText('Deadline Nov 10, 2026 · 8 days left')).toBeOnTheScreen();
    const official = screen.getByRole('link', { name: 'Official site for Gamma Cookies' });
    await user.press(official);
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.gammasettlement.com/claim');
    await user.press(screen.getByRole('button', { name: 'How to file: Gamma Cookies' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/claim/gamma-cookies');
    await user.press(screen.getByRole('button', { name: dashboard.browseAllSettlements.text }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/lawsuits');
  });

  it('ends with the compact legal disclaimer and the site footer’s SettleSignal credit', async () => {
    serve(response());
    await renderDashboard();
    await screen.findByText('Hi, Ana.');
    expect(within(screen.getByTestId('dashboard-disclaimer')).getByText('Full legal disclaimer text.')).toBeOnTheScreen();
    expect(screen.getByTestId('dashboard-credit')).toHaveTextContent(shared.creditFooterLead.text, { exact: false });
  });
});

describe('failed sections and empty states', () => {
  it('shows the web’s copy for each failed section, with a retry for the claims', async () => {
    const user = userEvent.setup();
    serve(
      response({
        claims: { failed: true, rows: [], notices: [] },
        matches: { failed: true, strong: [], possible: [], possibleHidden: 0 },
        closingSoon: { failed: true, items: [] },
      }),
    );
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    expect(screen.getByText(dashboard.claimsFailedTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.matchesFailedTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.closingSoonFailedTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.closingSoonFailedBody.text)).toBeOnTheScreen();
    expect(screen.queryByText(dashboard.noClaimsTitle.text)).toBeNull();

    await user.press(screen.getByRole('link', { name: dashboard.goToAllSettlements.text }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/lawsuits');
    await user.press(screen.getByRole('button', { name: common.tryAgain.text }));
    await waitFor(() => expect(dashboardCalls()).toBe(2));
  });

  it('shows "You’re not tracking any claims yet" and the empty matches for an unfinished profile', async () => {
    const user = userEvent.setup();
    serve(
      response({
        profile: { firstName: 'Ana', onboarded: false, needsProfile: true },
        claims: { failed: false, rows: [], notices: [] },
        matches: { failed: false, strong: [], possible: [], possibleHidden: 0 },
        closingSoon: { failed: false, items: [] },
      }),
    );
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    expect(screen.getByText('You’re not tracking any claims yet')).toBeOnTheScreen();
    expect(screen.getByText(dashboard.noClaimsBody.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.addProfileDetailsTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.noDeadlinesSoon.text)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: dashboard.finishProfileAction.text }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/onboarding');
    await user.press(screen.getByRole('button', { name: dashboard.finishYourProfile.text }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/onboarding');
    await user.press(within(screen.getByTestId('dashboard-claims-empty')).getByRole('button', { name: app.browseOpenSettlements.text }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/lawsuits');
  });

  it('offers to update the profile when nothing open matches, and hides "Finish your profile" once onboarded', async () => {
    const user = userEvent.setup();
    serve(response({ matches: { failed: false, strong: [], possible: [], possibleHidden: 0 } }));
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    expect(screen.getByText(dashboard.noOpenMatchesTitle.text)).toBeOnTheScreen();
    expect(screen.queryByTestId('dashboard-finish-profile')).toBeNull();
    await user.press(screen.getByRole('button', { name: dashboard.updateYourProfile.text }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/details', { withAnchor: true });
  });
});

describe('server hrefs', () => {
  it('never opens an action or match whose link is not "/claim/{slug}"', async () => {
    serve(
      response({
        claims: {
          failed: false,
          notices: [],
          rows: [row({ claimId: 'bad', title: 'Evil Row', action: { label: 'Tell us', href: 'https://evil.example/claim/x' } })],
        },
        matches: { failed: false, strong: [match({ slug: 'Not A Slug', title: 'Odd Match' })], possible: [], possibleHidden: 0 },
      }),
    );
    await renderDashboard();
    await screen.findByText('Evil Row');

    expect(screen.queryByRole('button', { name: 'Tell us: Evil Row' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'How to file: Odd Match' })).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('welcome, banners and refreshing', () => {
  it('shows the welcome card after onboarding and clears it when the screen is left', async () => {
    const user = userEvent.setup();
    mockParams.value = { welcome: '1' };
    serve(response());
    await renderDashboard();

    expect(await screen.findByText(dashboard.welcomeTitle.text)).toBeOnTheScreen();
    expect(screen.getByLabelText(`4. ${dashboard.welcomeStep4.text}`)).toBeOnTheScreen();
    await user.press(within(screen.getByTestId('dashboard-welcome')).getByRole('button', { name: app.browseOpenSettlements.text }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/lawsuits');

    await act(async () => blur());
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ welcome: undefined, password: undefined, denied: undefined });
  });

  it('shows no welcome card without ?welcome=1, and the password and admin banners for their parameters', async () => {
    mockParams.value = { password: 'updated', denied: 'admin' };
    serve(response());
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    expect(screen.queryByText(dashboard.welcomeTitle.text)).toBeNull();
    expect(screen.getByText(dashboard.passwordUpdated.text)).toBeOnTheScreen();
    expect(screen.getByText(dashboard.deniedAdmin.text)).toBeOnTheScreen();
  });

  it('loads again on pull to refresh and when the screen comes back into focus', async () => {
    serve(response(), response({ profile: { firstName: 'Bea', onboarded: true, needsProfile: false } }));
    await renderDashboard();
    await screen.findByText('Hi, Ana.');

    await act(async () => {
      await screen.getByTestId('dashboard-list').props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText('Hi, Bea.')).toBeOnTheScreen();
    expect(dashboardCalls()).toBe(2);

    await act(async () => {
      blur();
      focus();
    });
    await waitFor(() => expect(dashboardCalls()).toBe(3));
  });
});
