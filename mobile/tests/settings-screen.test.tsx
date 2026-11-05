import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AppState, Linking, Share, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { common } from '@/copy/common';
import { settings } from '@/copy/settings';
import { shared } from '@/copy/shared';
import { appVersionText } from '@/features/settings/AppVersion';
import { LegalScreen } from '@/features/settings/LegalScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { openExternalUrl } from '@/lib/external-link';
import { setRemindersEnabled } from '@/lib/reminders';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSignOut = jest.fn(async () => ({ error: null }));
const mockAuth: { status: string; user: { id: string; email: string } | null; signOut: typeof mockSignOut } = {
  status: 'signedOut',
  user: null,
  signOut: mockSignOut,
};
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

const mockProfile: { data: { referral_code: string | null } | null | undefined; isPending: boolean } = {
  data: { referral_code: 'ANA123' },
  isPending: false,
};
jest.mock('@/data/profile', () => ({ useProfile: () => mockProfile }));

const mockLegal = { disclaimer: 'Full legal text from the server.', short: 'Short legal text from the server.', contactEmail: 'help@lawsuitai.org', fromServer: true };
jest.mock('@/providers/ConfigProvider', () => ({ useConfig: () => ({ legal: mockLegal, isFlagOn: () => false }) }));

jest.mock('@/lib/external-link', () => ({
  ...jest.requireActual('@/lib/external-link'),
  openExternalUrl: jest.fn(async () => null),
}));

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '7' }));

// The real Settings switch (useReminderSetting) over a stand-in for the notification layer.
const mockReminders = { enabled: false, permission: 'undetermined', next: 'granted' as string };
jest.mock('@/lib/reminders', () => ({
  getRemindersEnabled: jest.fn(async () => mockReminders.enabled),
  getReminderPermission: jest.fn(async () => mockReminders.permission),
  hasKnownReminders: () => true,
  setRemindersEnabled: jest.fn(async (on: boolean) => {
    if (!on) {
      mockReminders.enabled = false;
      return 'off';
    }
    if (mockReminders.next === 'granted') {
      mockReminders.enabled = true;
      mockReminders.permission = 'granted';
    } else if (mockReminders.next === 'denied') {
      mockReminders.permission = 'denied';
    }
    return mockReminders.next;
  }),
}));
jest.mock('@/data/dashboard', () => ({
  dashboardQueryOptions: () => ({ queryKey: ['dashboard'], queryFn: async () => ({}) }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let client: QueryClient;

async function renderWith(element: React.ReactElement) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function signIn() {
  mockAuth.status = 'signedIn';
  mockAuth.user = { id: 'user-1', email: 'ana@example.com' };
}

const REMINDERS = `${settings.remindersLabel.text}, ${settings.remindersHint.text}`;

/** Lets the switch's last answer land inside act, so it cannot leak into the next test. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.status = 'signedOut';
  mockAuth.user = null;
  mockProfile.data = { referral_code: 'ANA123' };
  mockProfile.isPending = false;
  mockReminders.enabled = false;
  mockReminders.permission = 'undetermined';
  mockReminders.next = 'granted';
});

afterEach(() => client.clear());

describe('Settings, signed out', () => {
  it('offers Log in, Create a free account, Legal, Privacy Policy and Terms', async () => {
    const user = userEvent.setup();
    await renderWith(<SettingsScreen />);

    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockPush).toHaveBeenLastCalledWith('/login');
    await user.press(screen.getByRole('button', { name: shared.createFreeAccount.text }));
    expect(mockPush).toHaveBeenLastCalledWith('/signup');
    await user.press(screen.getByRole('button', { name: settings.legalTitle.text }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/legal');

    await user.press(screen.getByRole('link', { name: settings.privacyPolicy.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith('https://lawsuitai.org/privacy');
    await user.press(screen.getByRole('link', { name: settings.terms.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith('https://lawsuitai.org/terms');

    expect(screen.getByText('Version 1.0.0 (7)')).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(settings.signOut.text)).toBeNull();
    expect(screen.queryByText(settings.deleteTitle.text)).toBeNull();
  });
});

describe('Settings, signed in', () => {
  it('shows the account rows, Your data with the contact email, and signs out', async () => {
    const user = userEvent.setup();
    signIn();
    await renderWith(<SettingsScreen />);

    expect(screen.getByText(settings.intro.text)).toBeOnTheScreen();
    expect(screen.getByText('Signed in as ana@example.com.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: settings.detailsTitle.text }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/details');

    expect(
      screen.getByText(
        'Our Privacy Policy explains what we store and why. You can ask us for a copy of your information, or ask us to delete your account by emailing help@lawsuitai.org.',
      ),
    ).toBeOnTheScreen();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await user.press(screen.getByRole('link', { name: 'help@lawsuitai.org' }));
    expect(openURL).toHaveBeenCalledWith('mailto:help@lawsuitai.org');

    await user.press(screen.getByRole('button', { name: settings.deleteTitle.text }));
    expect(mockPush).toHaveBeenLastCalledWith('/delete-account');

    await user.press(screen.getByRole('button', { name: settings.signOut.text }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shares the referral link in the system share sheet, with no counts', async () => {
    const user = userEvent.setup();
    signIn();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await renderWith(<SettingsScreen />);

    // The row reads its title and subtitle together.
    await user.press(screen.getByRole('button', { name: new RegExp(`^${settings.shareTitle.text}`) }));
    expect(share).toHaveBeenCalledWith({ url: 'https://lawsuitai.org/r/ANA123' });
    expect(screen.queryByText(/clicks|signups/)).toBeNull();
  });

  it('says the link comes later when the account has no referral code yet', async () => {
    signIn();
    mockProfile.data = { referral_code: null };
    const share = jest.spyOn(Share, 'share');
    await renderWith(<SettingsScreen />);
    expect(screen.getByText(settings.shareNoLinkYet.text)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: new RegExp(`^${settings.shareTitle.text}`) })).toBeNull();
    expect(share).not.toHaveBeenCalled();
  });

  it('turns deadline reminders on, asking for the permission through the reminders layer', async () => {
    const user = userEvent.setup();
    signIn();
    await renderWith(<SettingsScreen />);
    const toggle = await screen.findByRole('switch', { name: REMINDERS });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));

    await user.press(toggle);
    expect(setRemindersEnabled).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: REMINDERS })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: true }),
      ),
    );

    await user.press(screen.getByRole('switch', { name: REMINDERS }));
    expect(setRemindersEnabled).toHaveBeenLastCalledWith(false);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: REMINDERS })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: false }),
      ),
    );
    await settle();
  });

  it('explains a refused permission, opens the system Settings, and finishes turning on when allowed there', async () => {
    const user = userEvent.setup();
    signIn();
    mockReminders.next = 'denied';
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    await renderWith(<SettingsScreen />);
    const toggle = await screen.findByRole('switch', { name: REMINDERS });
    await waitFor(() => expect(toggle).toBeEnabled());

    await user.press(toggle);
    expect(await screen.findByText(settings.remindersDenied.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: settings.openSystemSettings.text }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    // Allowed in the system Settings, then back in the app.
    mockReminders.permission = 'granted';
    mockReminders.next = 'granted';
    await act(async () => listeners.forEach((listener) => listener('active')));

    await waitFor(() => expect(setRemindersEnabled).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(screen.queryByText(settings.remindersDenied.text)).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: REMINDERS })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ checked: true }),
      ),
    );
    await settle();
    jest.restoreAllMocks();
  });
});

describe('Legal', () => {
  it('shows the server legal text, the SettleSignal credit and the web legal pages', async () => {
    const user = userEvent.setup();
    await renderWith(<LegalScreen />);
    expect(screen.getByText(mockLegal.disclaimer)).toBeOnTheScreen();
    expect(screen.getByText(mockLegal.short)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(shared.creditFooterLead.text))).toBeOnTheScreen();

    await user.press(screen.getByRole('link', { name: settings.howWeMakeMoney.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith('https://lawsuitai.org/how-we-make-money');
    await user.press(screen.getByRole('link', { name: settings.privacyPolicy.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith('https://lawsuitai.org/privacy');
  });
});

describe('app version', () => {
  it('reads "Version {version} ({build})"', () => {
    expect(appVersionText('1.2.0', '42')).toBe('Version 1.2.0 (42)');
    expect(appVersionText(null, '42')).toBeNull();
  });
});
