import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { common } from '@/copy/common';
import { settings } from '@/copy/settings';
import { detailsBody, detailsErrors, type DetailsValues } from '@/features/settings/details-form';
import { DetailsScreen } from '@/features/settings/DetailsScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
}));

const mockAuth: { status: string; user: { id: string; email: string } | null; sessionEnded?: boolean } = {
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

function sentBody(call = 0): Record<string, unknown> {
  const [url, init] = mockFetch.mock.calls[call] as [string, RequestInit];
  expect(url).toBe('https://api.test/api/settings');
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

/** React Query tells screens about a finished fetch on a timer (notifyManager): let that render happen. */
async function renderedAfterNotify() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let client: QueryClient;

async function renderDetails() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <DetailsScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await screen.findByLabelText(settings.fullNameLabel.text);
}

const STORED = {
  full_name: 'Ana Diaz',
  state: 'CA',
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  attributes: { owns_vehicle: true, vehicle_brands: ['Ford'], used_banking: false, took_medication: true },
  email_opt_in: true,
  onboarded: true,
  prefill_consent_at: null,
  match_metrics_consent_at: null,
  referral_code: 'ANA123',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.status = 'signedIn';
  mockAuth.user = { id: 'user-1', email: 'ana@example.com' };
  mockAuth.sessionEnded = false;
  mockProfileRow.current = { ...STORED };
  mockProfileRow.offline = false;
  mockFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
});

afterEach(() => client.clear());

describe('Your details and emails', () => {
  it('starts from the profile and saves the web form fields, without any health answer', async () => {
    const user = userEvent.setup();
    await renderDetails();
    expect(screen.getByLabelText(settings.fullNameLabel.text)).toHaveDisplayValue('Ana Diaz');
    expect(screen.getByRole('button', { name: settings.stateLabel.text })).toHaveAccessibilityValue({ text: 'California' });
    expect(screen.getByLabelText(settings.phoneLabel.text)).toHaveProp('keyboardType', 'phone-pad');

    await user.type(screen.getByLabelText(settings.phoneLabel.text), '(555) 123-4567');
    await user.press(screen.getByRole('switch', { name: `${settings.emailOptInLabel.text}, ${settings.emailOptInHint.text}` }));
    await user.press(screen.getByRole('switch', { name: `${settings.metricsLabel.text}, ${settings.metricsHint.text}` }));
    await user.press(screen.getByRole('checkbox', { name: /Do you use Facebook, Instagram, TikTok, or Google\?/ }));
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));

    expect(await screen.findByText(settings.saved.text)).toBeOnTheScreen();
    const body = sentBody();
    expect(body).toEqual({
      full_name: 'Ana Diaz',
      state: 'CA',
      phone: '(555) 123-4567',
      email_opt_in: false,
      match_metrics_consent: true,
      attributes: { owns_vehicle: true, vehicle_brands: ['Ford'], used_banking: false, uses_social_media: true },
    });
    expect(JSON.stringify(body)).not.toContain('took_medication');
  });

  it('asks for the consent box before saving a new address, then stamps the consent', async () => {
    const user = userEvent.setup();
    await renderDetails();
    expect(screen.queryByRole('checkbox', { name: settings.saveAddressConsent.text })).toBeNull();

    await user.type(screen.getByLabelText(settings.addressLine1Label.text), '12 Main St');
    await user.type(screen.getByLabelText(settings.cityLabel.text), 'Austin');
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));

    expect(screen.getAllByText(settings.consentRequired.text).length).toBeGreaterThanOrEqual(1);
    expect(mockFetch).not.toHaveBeenCalled();

    await user.press(screen.getByRole('checkbox', { name: settings.saveAddressConsent.text }));
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body).toMatchObject({ address_line1: '12 Main St', address_line2: '', city: 'Austin' });
    expect(typeof body.prefill_consent_at).toBe('string');
    expect(Number.isNaN(Date.parse(String(body.prefill_consent_at)))).toBe(false);
  });

  it('with consent on file, sends the address as edited (an emptied field clears it) and no new stamp', async () => {
    const user = userEvent.setup();
    mockProfileRow.current = {
      ...STORED,
      address_line1: '12 Main St',
      city: 'Austin',
      prefill_consent_at: '2026-10-01T12:00:00.000Z',
    };
    await renderDetails();
    expect(screen.queryByRole('checkbox', { name: settings.saveAddressConsent.text })).toBeNull();

    await user.clear(screen.getByLabelText(settings.addressLine1Label.text));
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body).toMatchObject({ address_line1: '', address_line2: '', city: 'Austin' });
    expect(body).not.toHaveProperty('prefill_consent_at');
  });

  it('shows a field error from the server rules under the field, and sends nothing', async () => {
    const user = userEvent.setup();
    await renderDetails();
    await user.type(screen.getByLabelText(settings.phoneLabel.text), 'call me');
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));

    const message = 'Use only numbers, spaces and + - ( ) in your phone number.';
    expect(screen.getByTestId('details-phone-error')).toHaveTextContent(message);
    expect(mockFetch).not.toHaveBeenCalled();

    // Fixing the field clears its error.
    await user.clear(screen.getByLabelText(settings.phoneLabel.text));
    expect(screen.queryByTestId('details-phone-error')).toBeNull();
  });

  it('shows the server error as sent', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(jsonResponse(429, { error: 'Too many requests. Please wait a moment and try again.' }));
    await renderDetails();
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));
    expect(await screen.findByText('Too many requests. Please wait a moment and try again.')).toBeOnTheScreen();
    expect(screen.queryByText(settings.saved.text)).toBeNull();
  });

  it('sends no matching answers when they did not change, so a health answer saved on the web stays', async () => {
    const user = userEvent.setup();
    await renderDetails();
    await user.type(screen.getByLabelText(settings.phoneLabel.text), '555 0100');
    await user.press(screen.getByRole('switch', { name: `${settings.emailOptInLabel.text}, ${settings.emailOptInHint.text}` }));
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));

    expect(await screen.findByText(settings.saved.text)).toBeOnTheScreen();
    // Any `attributes` would replace every stored answer, took_medication included (applyAttributePatch).
    expect(sentBody()).toEqual({ full_name: 'Ana Diaz', state: 'CA', phone: '555 0100', email_opt_in: false, match_metrics_consent: false });
  });

  it('sends changed answers once; the next save without answer changes sends none', async () => {
    const user = userEvent.setup();
    await renderDetails();
    const social = screen.getByRole('checkbox', { name: /Do you use Facebook, Instagram, TikTok, or Google\?/ });
    await user.press(social);
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(sentBody(0).attributes).toEqual({ owns_vehicle: true, vehicle_brands: ['Ford'], used_banking: false, uses_social_media: true });

    await user.type(screen.getByLabelText(settings.phoneLabel.text), '555 0100');
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(sentBody(1)).not.toHaveProperty('attributes');

    // Checked and unchecked again: the same answers as on file.
    await user.press(social);
    await user.press(social);
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(sentBody(2)).not.toHaveProperty('attributes');
  });

  it('keeps the form and what was typed when a reload of the profile fails', async () => {
    const user = userEvent.setup();
    await renderDetails();
    await user.type(screen.getByLabelText(settings.phoneLabel.text), '555 0100');

    mockProfileRow.offline = true;
    await act(async () => {
      await client.refetchQueries({ queryKey: ['profile', 'user-1'] });
    });
    expect(client.getQueryState(['profile', 'user-1'])?.status).toBe('error');
    await renderedAfterNotify();
    expect(screen.getByTestId('settings-details-form')).toBeOnTheScreen();
    expect(screen.getByLabelText(settings.phoneLabel.text)).toHaveDisplayValue('555 0100');
    expect(screen.queryByRole('button', { name: common.tryAgain.text })).toBeNull();
  });

  it('says "Saved" even when the reload after the save fails', async () => {
    const user = userEvent.setup();
    await renderDetails();
    await user.type(screen.getByLabelText(settings.phoneLabel.text), '555 0100');
    mockProfileRow.offline = true;
    await user.press(screen.getByRole('button', { name: settings.saveChanges.text }));

    expect(await screen.findByText(settings.saved.text)).toBeOnTheScreen();
    await waitFor(() => expect(client.getQueryState(['profile', 'user-1'])?.status).toBe('error'));
    await renderedAfterNotify();
    expect(screen.getByTestId('settings-details-form')).toBeOnTheScreen();
    expect(screen.getByLabelText(settings.phoneLabel.text)).toHaveDisplayValue('555 0100');
  });

  it('says "You were logged out." when the session ended while the form was open', async () => {
    await renderDetails();
    Object.assign(mockAuth, { status: 'signedOut', user: null, sessionEnded: true });
    await screen.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <DetailsScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText(common.loggedOut.text)).toBeOnTheScreen();
    expect(screen.queryByTestId('settings-details-form')).toBeNull();
  });

  it('shows the error with Try again when the first load fails', async () => {
    mockProfileRow.offline = true;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <DetailsScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(await screen.findByRole('button', { name: common.tryAgain.text })).toBeOnTheScreen();
    expect(screen.queryByTestId('settings-details-form')).toBeNull();
  });
});

describe('details form rules', () => {
  const values: DetailsValues = {
    fullName: 'Ana',
    state: 'TX',
    phone: '',
    addressLine1: '',
    addressLine2: 'Apt 4',
    city: '',
    addressConsent: false,
    emailOptIn: true,
    metricsConsent: false,
    answers: { owns_vehicle: false, vehicle_brands: [] },
  };
  const at = new Date('2026-11-02T15:00:00.000Z');

  it('leaves the address out until there is consent, and stamps a first consent once', () => {
    const saved = values.answers;
    expect(detailsBody(values, false, at, saved)).not.toHaveProperty('address_line1');
    expect(detailsBody({ ...values, addressLine1: '1 A St', addressConsent: true }, false, at, saved)).toMatchObject({
      address_line1: '1 A St',
      address_line2: 'Apt 4',
      city: '',
      prefill_consent_at: '2026-11-02T15:00:00.000Z',
    });
    expect(detailsBody(values, true, at, saved)).toMatchObject({ address_line1: '', address_line2: 'Apt 4' });
    expect(detailsBody(values, true, at, saved)).not.toHaveProperty('prefill_consent_at');
  });

  it('sends the matching answers only when they differ from the ones on file', () => {
    expect(detailsBody(values, false, at, { owns_vehicle: false, vehicle_brands: [] })).not.toHaveProperty('attributes');
    // Unanswered and "no" are both an unchecked box: no change to send.
    expect(detailsBody(values, false, at, { vehicle_brands: [] })).not.toHaveProperty('attributes');
    expect(detailsBody(values, false, at, { owns_vehicle: true, vehicle_brands: [] })).toMatchObject({ attributes: values.answers });
    const brands = { ...values, answers: { owns_vehicle: true, vehicle_brands: ['Ford', 'Kia'] } };
    expect(detailsBody(brands, false, at, { owns_vehicle: true, vehicle_brands: ['Kia', 'Ford'] })).not.toHaveProperty('attributes');
    expect(detailsBody(brands, false, at, { owns_vehicle: true, vehicle_brands: ['Kia'] })).toMatchObject({
      attributes: { owns_vehicle: true, vehicle_brands: ['Ford', 'Kia'] },
    });
  });

  it('checks each field with the settings rules', () => {
    expect(detailsErrors(values, false)).toEqual({});
    expect(detailsErrors({ ...values, fullName: 'x'.repeat(121) }, false)).toEqual({
      full_name: 'Keep your name under 120 characters.',
    });
    expect(detailsErrors({ ...values, city: 'Austin' }, false)).toEqual({ consent: settings.consentRequired.text });
    expect(detailsErrors({ ...values, city: 'Austin' }, true)).toEqual({});
  });
});
