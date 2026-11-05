import { SENSITIVE_OPTIONAL_QUESTIONS } from '@shared/lib/profile-attributes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { onboarding, signedInAsText, stepOfTwoText } from '@/copy/onboarding';
import { shared } from '@/copy/shared';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));

const mockAuth: { status: string; user: { id: string; email: string } | null } = {
  status: 'signedIn',
  user: { id: 'user-1', email: 'ana@example.com' },
};
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

const mockProfileRow: { current: Record<string, unknown> | null; offline: boolean } = { current: null, offline: false };

/** PostgREST's answer to the app's select: plain columns, and `alias:attributes->key` paths into the stored attributes. */
function mockSelected(row: Record<string, unknown> | null, columns: string): Record<string, unknown> | null {
  if (!row) return null;
  return Object.fromEntries(
    columns.split(',').map((column) => {
      const [alias, path] = column.trim().split(':');
      const key = path?.split('->')[1];
      return [alias, key ? ((row.attributes as Record<string, unknown> | null)?.[key] ?? null) : row[alias]];
    }),
  );
}

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      let columns = '';
      builder.select = (value: string) => {
        columns = value;
        return builder;
      };
      for (const method of ['eq', 'setHeader', 'abortSignal']) builder[method] = () => builder;
      builder.maybeSingle = async () =>
        mockProfileRow.offline
          ? { data: null, error: { message: 'Network request failed' }, status: 0 }
          : { data: mockSelected(mockProfileRow.current, columns), error: null, status: 200 };
      return builder;
    },
  }),
}));

// The real API client and useSaveSettings, with the network mocked.
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

jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

function sentBody(call = 0): unknown {
  const [url, init] = mockFetch.mock.calls[call] as [string, RequestInit];
  expect(url).toBe('https://api.test/api/settings');
  expect(init.method).toBe('POST');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  return JSON.parse(String(init.body));
}

/** React Query tells screens about a finished fetch on a timer (notifyManager): let that render happen. */
async function renderedAfterNotify() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let client: QueryClient;

async function renderOnboarding(params: Record<string, string> = {}) {
  mockParams.current = params;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <OnboardingScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const WELCOME = { pathname: '/dashboard', params: { welcome: '1' } };
const DATA_BREACH = 'Have you received a data-breach notification in the last 3 years?';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.status = 'signedIn';
  mockAuth.user = { id: 'user-1', email: 'ana@example.com' };
  mockProfileRow.offline = false;
  mockProfileRow.current = {
    full_name: 'Ana',
    state: 'CA',
    phone: null,
    address_line1: null,
    address_line2: null,
    city: null,
    // A health answer saved by the web before the app: never shown, never sent back.
    attributes: { owns_vehicle: true, vehicle_brands: ['Ford'], took_medication: true },
    email_opt_in: true,
    onboarded: false,
    prefill_consent_at: null,
    match_metrics_consent_at: null,
    referral_code: 'ANA123',
  };
  mockFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
});

afterEach(() => client.clear());

describe('onboarding', () => {
  it('shows the web header and starts from the saved name and state', async () => {
    await renderOnboarding({ confirmed: '1' });
    expect(await screen.findByText(`${onboarding.intro.text} ${onboarding.howItWorks.text}`)).toBeOnTheScreen();
    expect(screen.getByText(onboarding.aboutOneMinute.text)).toBeOnTheScreen();
    expect(screen.getByText(onboarding.howStep4.text)).toBeOnTheScreen();
    expect(screen.getByText(onboarding.emailConfirmed.text)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: `${stepOfTwoText(1)}. ${onboarding.detailsTitle.text}` })).toBeOnTheScreen();
    expect(screen.getByLabelText(onboarding.nameLabel.text)).toHaveDisplayValue('Ana');
    expect(screen.getByRole('button', { name: onboarding.stateLabel.text })).toHaveAccessibilityValue({ text: 'California' });
    expect(screen.getByText(signedInAsText('ana@example.com'))).toBeOnTheScreen();
  });

  it('saves name, state and answers with onboarded:true, never the health question, then shows the welcome card', async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    const name = await screen.findByLabelText(onboarding.nameLabel.text);
    await user.clear(name);
    await user.type(name, 'Ana Díaz');
    await user.press(screen.getByRole('button', { name: onboarding.stateLabel.text }));
    await user.type(await screen.findByLabelText('Search states'), 'tex');
    expect(screen.queryByRole('button', { name: 'California' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Texas' }));
    expect(screen.getByRole('button', { name: onboarding.stateLabel.text })).toHaveAccessibilityValue({ text: 'Texas' });

    await user.press(screen.getByRole('button', { name: onboarding.continue.text }));
    expect(screen.getByRole('header', { name: `${stepOfTwoText(2)}. ${onboarding.questionsTitle.text}` })).toBeOnTheScreen();
    // The web's optional health section is not part of the app.
    for (const question of SENSITIVE_OPTIONAL_QUESTIONS) expect(screen.queryByText(question.label)).toBeNull();

    await user.press(screen.getByRole('checkbox', { name: new RegExp(DATA_BREACH.replace(/[?]/g, '\\?')) }));
    await user.press(screen.getByRole('togglebutton', { name: 'Toyota' }));
    await user.press(screen.getByRole('button', { name: onboarding.saveAndContinue.text }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith(WELCOME));
    expect(sentBody()).toEqual({
      full_name: 'Ana Díaz',
      state: 'TX',
      attributes: { had_data_breach: true, owns_vehicle: true, vehicle_brands: ['Ford', 'Toyota'] },
      onboarded: true,
    });
    expect(JSON.stringify(sentBody())).not.toContain('took_medication');
  });

  it('"Skip for now" posts only onboarded:true and continues to the checked next', async () => {
    const user = userEvent.setup();
    await renderOnboarding({ next: '/claim/acme' });
    await user.press(await screen.findByRole('button', { name: onboarding.skipForNow.text }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/claim/acme'));
    expect(sentBody()).toEqual({ onboarded: true });
  });

  it('keeps the answers when going back a step, and unchecking "owns a vehicle" clears the brands', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    await user.press(await screen.findByRole('button', { name: onboarding.continue.text }));
    const vehicle = screen.getByRole('checkbox', { name: 'Do you own or lease a car, truck, or SUV?' });
    expect(vehicle).toBeChecked();
    expect(screen.getByRole('togglebutton', { name: 'Ford' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );

    await user.press(screen.getByRole('button', { name: onboarding.back.text }));
    expect(screen.getByLabelText(onboarding.nameLabel.text)).toHaveDisplayValue('Ana');
    await user.press(screen.getByRole('button', { name: onboarding.continue.text }));

    await user.press(screen.getByRole('checkbox', { name: 'Do you own or lease a car, truck, or SUV?' }));
    expect(screen.queryByText(onboarding.whichBrands.text)).toBeNull();
    await user.press(screen.getByRole('button', { name: onboarding.saveAndContinue.text }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith(WELCOME));
    expect(sentBody()).toMatchObject({ attributes: { owns_vehicle: false, vehicle_brands: [] } });
  });

  it('shows the server error and stays open', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: 'We couldn’t save your settings. Please try again.' }));
    await renderOnboarding();
    await user.press(await screen.findByRole('button', { name: onboarding.skipForNow.text }));

    expect(await screen.findByText('We couldn’t save your settings. Please try again.')).toBeOnTheScreen();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: onboarding.skipForNow.text })).toBeEnabled();
  });

  it('works before the profile row exists', async () => {
    const user = userEvent.setup();
    mockProfileRow.current = null;
    await renderOnboarding();
    expect(await screen.findByLabelText(onboarding.nameLabel.text)).toHaveDisplayValue('');
    expect(screen.getByRole('button', { name: onboarding.stateLabel.text })).toHaveAccessibilityValue({
      text: onboarding.statePlaceholder.text,
    });
    await user.press(screen.getByRole('button', { name: onboarding.continue.text }));
    await user.press(screen.getByRole('button', { name: onboarding.saveAndContinue.text }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith(WELCOME));
    // Nothing was answered: no attributes, so nothing stored is replaced.
    expect(sentBody()).toEqual({ full_name: '', state: '', onboarded: true });
  });

  it('keeps the "never files for you" sentence on step 2, where the answers are asked', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    await user.press(await screen.findByRole('button', { name: onboarding.continue.text }));
    expect(screen.getByRole('header', { name: `${stepOfTwoText(2)}. ${onboarding.questionsTitle.text}` })).toBeOnTheScreen();
    expect(screen.getByText(onboarding.intro.text)).toBeOnTheScreen();
  });

  it('saves without the answers when none changed, so a health answer saved on the web stays', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    const name = await screen.findByLabelText(onboarding.nameLabel.text);
    await user.type(name, ' Díaz');
    await user.press(screen.getByRole('button', { name: onboarding.continue.text }));
    // Checked and unchecked: the same answers as on file.
    const breach = screen.getByRole('checkbox', { name: new RegExp(DATA_BREACH.replace(/[?]/g, '\\?')) });
    await user.press(breach);
    await user.press(breach);
    await user.press(screen.getByRole('button', { name: onboarding.saveAndContinue.text }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith(WELCOME));
    expect(sentBody()).toEqual({ full_name: 'Ana Díaz', state: 'CA', onboarded: true });
  });

  it('keeps the wizard and what was typed when a reload of the profile fails', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    const name = await screen.findByLabelText(onboarding.nameLabel.text);
    await user.type(name, ' Díaz');

    mockProfileRow.offline = true;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['profile', 'user-1'] });
    });
    expect(client.getQueryState(['profile', 'user-1'])?.status).toBe('error');
    await renderedAfterNotify();
    expect(screen.getByTestId('onboarding-step-1')).toBeOnTheScreen();
    expect(screen.getByLabelText(onboarding.nameLabel.text)).toHaveDisplayValue('Ana Díaz');
  });

  it('asks a signed-out visitor to log in', async () => {
    mockAuth.status = 'signedOut';
    mockAuth.user = null;
    await renderOnboarding();
    expect(screen.getByRole('header', { name: shared.welcomeBack.text })).toBeOnTheScreen();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
