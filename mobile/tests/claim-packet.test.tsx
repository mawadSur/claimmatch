import type { PacketProfile } from '@shared/lib/claim-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { claim as copy, copyFieldLabel } from '@/copy/claim';
import { PrefillPacket } from '@/features/claim/PrefillPacket';

const mockFetch = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const client = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => mockFetch(...args),
    session: {
      getAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      refreshAccessToken: async () => ({ status: 'ok', token: 'token-2', userId: 'user-1' }),
      signOutLocally: async () => undefined,
    },
  });
  return { ...actual, getApi: () => client };
});
const mockFlags: Record<string, boolean> = {};
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({ isFlagOn: (name: string) => mockFlags[name] === true }),
}));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' } }) }));
jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  AndroidHaptics: { Virtual_Key: 'virtual-key' },
}));

const PROFILE: PacketProfile = {
  full_name: 'Ana Diaz',
  email: 'ana@example.com',
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: 'CA',
  prefill_consent_at: null,
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

async function showPacket(profile: PacketProfile | null = PROFILE, formFieldOrder: string[] | null = null) {
  await render(<PrefillPacket profile={profile} formFieldOrder={formFieldOrder} />, { wrapper: Providers });
}

/** The copy buttons in screen order, by the field they copy. */
function fieldOrder(): string[] {
  return screen
    .getAllByTestId(/^claim-packet-copy-(?!all)/)
    .map((button) => String(button.props.testID).replace('claim-packet-copy-', ''));
}

function settingsBodies(): unknown[] {
  return mockFetch.mock.calls
    .filter(([url]) => url === 'https://api.test/api/settings')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) });
  for (const name of Object.keys(mockFlags)) delete mockFlags[name];
  (Clipboard.setStringAsync as jest.Mock).mockClear();
  (AccessibilityInfo.announceForAccessibility as jest.Mock).mockClear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
});

afterEach(() => client.clear());

describe('PrefillPacket', () => {
  it('shows the details with the note that Lawsuit AI never files, in the default order', async () => {
    await showPacket();
    expect(screen.getByText(copy.packetTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(copy.packetNote.text)).toBeOnTheScreen();
    expect(screen.getByLabelText(copy.fullName.text)).toHaveDisplayValue('Ana Diaz');
    expect(screen.getByTestId('claim-packet-state')).toHaveAccessibilityValue({ text: 'California' });
    expect(fieldOrder()).toEqual(['full_name', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state']);
    // Nothing to copy for an empty field.
    expect(screen.getByRole('button', { name: copyFieldLabel(copy.phone.text) })).toBeDisabled();
  });

  it('keeps the default order while FORM_FIELD_ORDER_ENABLED is off', async () => {
    await showPacket(PROFILE, ['email', 'state', 'nonsense', 'full_name']);
    expect(fieldOrder()[0]).toBe('full_name');
  });

  it('follows the official form order with FORM_FIELD_ORDER_ENABLED', async () => {
    mockFlags.FORM_FIELD_ORDER_ENABLED = true;
    await showPacket(PROFILE, ['email', 'state', 'nonsense', 'full_name']);
    expect(fieldOrder()).toEqual(['email', 'state', 'full_name', 'phone', 'address_line1', 'address_line2', 'city']);
  });

  it('copies one value, says "Copied" for a moment and announces it', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await showPacket();
      await user.press(screen.getByRole('button', { name: copyFieldLabel(copy.fullName.text) }));
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Ana Diaz');
      expect(screen.getByText(copy.copied.text)).toBeOnTheScreen();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.copied.text);
      await act(async () => {
        jest.advanceTimersByTime(1600);
      });
      expect(screen.queryByText(copy.copied.text)).not.toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('copies everything as one block with "Copy all"', async () => {
    const user = userEvent.setup();
    await showPacket({ ...PROFILE, address_line1: '1 Main St', city: 'Austin', state: 'TX', prefill_consent_at: '2026-01-01T00:00:00Z' });
    await user.press(screen.getByRole('button', { name: copy.copyAll.text }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'Full name: Ana Diaz\nEmail: ana@example.com\nPhone: \n1 Main St\nAustin, TX',
    );
    expect(screen.getByText(copy.copiedAll.text)).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(copy.copiedAll.text);
  });

  it('saves name, phone and state through POST /api/settings', async () => {
    const user = userEvent.setup();
    await showPacket();
    await user.type(screen.getByLabelText(copy.phone.text), '555-0100');
    await user.press(screen.getByRole('button', { name: copy.saveDetails.text }));
    expect(await screen.findByRole('button', { name: copy.saved.text })).toBeOnTheScreen();
    expect(settingsBodies()).toEqual([{ full_name: 'Ana Diaz', phone: '555-0100', state: 'CA' }]);
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('saves an address only with consent, and stamps the consent', async () => {
    const user = userEvent.setup();
    await showPacket();
    await user.type(screen.getByLabelText(copy.addressLine1.text), '1 Main St');
    await user.type(screen.getByLabelText(copy.city.text), 'Austin');
    await user.press(screen.getByRole('button', { name: copy.saveDetails.text }));
    expect(await screen.findByText(copy.consentNeeded.text)).toBeOnTheScreen();
    expect(settingsBodies()).toEqual([]);

    const consent = screen.getByRole('checkbox', { name: copy.saveAddressConsent.text });
    await user.press(consent);
    expect(consent).toBeChecked();
    await user.press(screen.getByRole('button', { name: copy.saveDetails.text }));
    expect(await screen.findByRole('button', { name: copy.saved.text })).toBeOnTheScreen();
    expect(settingsBodies()).toEqual([
      {
        full_name: 'Ana Diaz',
        phone: '',
        state: 'CA',
        address_line1: '1 Main St',
        address_line2: '',
        city: 'Austin',
        prefill_consent_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ]);
  });

  it('does not ask again once consent is on the profile', async () => {
    const user = userEvent.setup();
    await showPacket({ ...PROFILE, address_line1: '1 Main St', prefill_consent_at: '2026-01-01T00:00:00Z' });
    expect(screen.queryByRole('checkbox')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: copy.saveDetails.text }));
    expect(await screen.findByRole('button', { name: copy.saved.text })).toBeOnTheScreen();
    expect(settingsBodies()).toEqual([
      { full_name: 'Ana Diaz', phone: '', state: 'CA', address_line1: '1 Main St', address_line2: '', city: '' },
    ]);
  });

  it('checks the details with the server rules before sending, and shows server errors as sent', async () => {
    const user = userEvent.setup();
    await showPacket();
    await user.type(screen.getByLabelText(copy.phone.text), 'call me');
    await user.press(screen.getByRole('button', { name: copy.saveDetails.text }));
    expect(await screen.findByText('Use only numbers, spaces and + - ( ) in your phone number.')).toBeOnTheScreen();
    expect(settingsBodies()).toEqual([]);

    await user.clear(screen.getByLabelText(copy.phone.text));
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'We couldn’t save your settings. Please try again.' }),
    });
    await user.press(screen.getByRole('button', { name: copy.saveDetails.text }));
    expect(await screen.findByText('We couldn’t save your settings. Please try again.')).toBeOnTheScreen();
  });

  it('picks a state from the list and copies its code', async () => {
    const user = userEvent.setup();
    await showPacket({ ...PROFILE, state: null });
    expect(screen.getByTestId('claim-packet-state')).toHaveAccessibilityValue({ text: copy.selectState.text });
    await user.press(screen.getByTestId('claim-packet-state'));
    await user.press(screen.getByRole('button', { name: 'Arizona' }));
    expect(screen.getByTestId('claim-packet-state')).toHaveAccessibilityValue({ text: 'Arizona' });
    await user.press(screen.getByRole('button', { name: copyFieldLabel(copy.state.text) }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('AZ');
  });

  it('clears a saved state with the list\'s first row, as the web\'s empty "Select" option does', async () => {
    const user = userEvent.setup();
    await showPacket(PROFILE);
    expect(screen.getByRole('button', { name: copy.state.text })).toHaveAccessibilityValue({ text: 'California' });
    await user.press(screen.getByTestId('claim-packet-state'));
    await user.press(screen.getByTestId('claim-packet-state-sheet-option-none'));
    expect(screen.getByTestId('claim-packet-state')).toHaveAccessibilityValue({ text: copy.selectState.text });
    expect(screen.getByRole('button', { name: copyFieldLabel(copy.state.text) })).toBeDisabled();
  });
});
