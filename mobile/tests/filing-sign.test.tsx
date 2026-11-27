import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { filing, filingStatus } from '@/copy/filing';

import { CLAIM_ID, HASH, SELF_FILE_LANE, SIGNATURE_ID, SPEC_ID, filingView, readyView } from './filing-fixtures';
import { calls, claimRow, client, filingCalls, flow, reply, resetHarness, show } from './filing-harness';

const mockSignIn = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const api = actual.createApiClient({
    baseUrl: 'https://api.test',
    fetch: (...args: unknown[]) => require('./filing-harness').mockFetch(...args),
    session: {
      getAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      refreshAccessToken: async () => ({ status: 'ok', token: 'token-1', userId: 'user-1' }),
      signOutLocally: async () => undefined,
    },
  });
  return { ...actual, getApi: () => api };
});
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    user: { id: 'user-1', email: 'ada@example.com' },
    signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
  }),
}));
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({ isFlagOn: () => false, legal: { disclaimer: 'Disclaimer.', short: 'Short.', contactEmail: null, fromServer: true } }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }), usePathname: () => '/claim/x' }));
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
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => '44444444-4444-4444-8444-444444444444',
}));

const VIEW_PATH = `/api/filing/claims/${CLAIM_ID}`;
const SIGNATURE = { id: SIGNATURE_ID, signed_at: '2026-11-12T15:05:00Z', typed_name: 'Ada Lovelace', packet_hash: HASH, lane: 'filing_desk' as const };
const queued = () =>
  filingView({
    status: 'queued',
    packet: { status: 'signed', packet_hash: HASH, complete: true },
    signature: SIGNATURE,
    actions: { can_edit: false, can_reopen: true, can_withdraw: true, can_self_file: true },
    timeline: [
      { at: '2026-11-12T14:00:00Z', status: 'preparing', from: null, actor: 'you', action: null, confirmation_number: null },
      { at: '2026-11-12T15:05:00Z', status: 'signed', from: 'ready', actor: 'you', action: null, confirmation_number: null },
      { at: '2026-11-12T15:05:01Z', status: 'queued', from: 'signed', actor: 'claimmatch', action: null, confirmation_number: null },
    ],
  });

beforeEach(() => {
  resetHarness();
  mockSignIn.mockReset();
});
afterEach(() => client.clear());

describe('review and sign', () => {
  it('shows Jev results and keeps "File my claim" off until the packet is ready', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    expect(await screen.findByTestId('filing-jev-results')).toBeTruthy();
    expect(screen.getByText(filing.reviewNotReady.text)).toBeTruthy();
    expect(screen.getByTestId('filing-file').props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByTestId('filing-one-tap-submit')).toBeNull();
  });

  it('1-tap submits the prefilled packet with the legal name and an Idempotency-Key', async () => {
    reply('GET', VIEW_PATH, [200, { filing: readyView() }]);
    reply('PATCH', `${VIEW_PATH}/packet`, [200, { filing: readyView() }]);
    reply('POST', `${VIEW_PATH}/sign`, [200, { filing: queued() }]);
    await show(flow({ canStart: false }, claimRow('ready')));
    expect(await screen.findByTestId('filing-one-tap')).toBeTruthy();
    expect(screen.getByText(filing.oneTapTitle.text)).toBeTruthy();
    expect(screen.queryByTestId('filing-typed-name')).toBeNull();
    await fireEvent.press(screen.getByTestId('filing-one-tap-submit'));
    expect(await screen.findByTestId('filing-status')).toBeTruthy();
    const [sent] = calls('POST', `${VIEW_PATH}/sign`);
    expect(sent.headers['Idempotency-Key']).toBe('44444444-4444-4444-8444-444444444444');
    expect(sent.headers.Authorization).toBe('Bearer token-1');
    expect(sent.body).toEqual({
      packet_hash: HASH,
      revision: 3,
      spec_id: SPEC_ID,
      spec_version: 2,
      typed_name: 'Ada Lovelace',
      attestation_accepted: true,
      authorization_accepted: true,
      authorization_text_version: 'agent-auth-v1',
    });
    expect(screen.getAllByText(filingStatus.queuedLabel.text).length).toBeGreaterThan(0);
    expect(screen.getByTestId('filing-path-queued-current')).toBeTruthy();
    expect(screen.getByTestId('filing-timeline')).toBeTruthy();
    expect(screen.getByText('Put in line to be filed')).toBeTruthy();
  });

  it('asks to sign in again with the password when the sign-in is older than 15 minutes', async () => {
    reply('GET', VIEW_PATH, [200, { filing: readyView({ actions: { needs_fresh_sign_in: true } }) }]);
    reply('GET', VIEW_PATH, [200, { filing: readyView() }]);
    mockSignIn.mockResolvedValue({ data: {}, error: null });
    await show(flow({ canStart: false }, claimRow('ready')));
    expect(await screen.findByTestId('filing-reauth')).toBeTruthy();
    expect(screen.getByTestId('filing-one-tap-submit').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('filing-reauth-submit'));
    expect(await screen.findByText(filing.reauthEnter.text)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('filing-reauth-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('filing-reauth-submit'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('ada@example.com', 'correct horse'));
    await waitFor(() => expect(screen.queryByTestId('filing-reauth')).toBeNull());
    // The view is read again with the new session: no sign-in needed now.
    await waitFor(() => expect(screen.getByTestId('filing-one-tap-submit').props.accessibilityState?.disabled).toBe(false));
    expect(filingCalls().filter((p) => p === VIEW_PATH)).toHaveLength(2);
  });

  it('shows the wrong-password message and stays on the prompt', async () => {
    reply('GET', VIEW_PATH, [200, { filing: readyView({ actions: { needs_fresh_sign_in: true } }) }]);
    mockSignIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    await show(flow({ canStart: false }, claimRow('ready')));
    await fireEvent.changeText(await screen.findByTestId('filing-reauth-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('filing-reauth-submit'));
    expect(await screen.findByText(filing.reauthWrong.text)).toBeTruthy();
  });

  it('opens the sign-in prompt when the server says reauth_required', async () => {
    reply('GET', VIEW_PATH, [200, { filing: readyView() }]);
    reply('PATCH', `${VIEW_PATH}/packet`, [200, { filing: readyView() }]);
    reply('POST', `${VIEW_PATH}/sign`, [403, { error: 'Sign in again to file this claim.', code: 'reauth_required' }]);
    await show(flow({ canStart: false }, claimRow('ready')));
    await fireEvent.press(await screen.findByTestId('filing-one-tap-submit'));
    expect(await screen.findByTestId('filing-reauth')).toBeTruthy();
    expect(screen.getByText('Sign in again to file this claim.')).toBeTruthy();
  });

  it('asks for E-SIGN consent first, only after the member ticks it', async () => {
    const needs = readyView({ esignConsented: false, actions: { needs_esign_consent: true } });
    reply('GET', VIEW_PATH, [200, { filing: needs }]);
    reply('PATCH', `${VIEW_PATH}/packet`, [200, { filing: needs }]);
    reply('GET', VIEW_PATH, [200, { filing: readyView() }]);
    reply('POST', `${VIEW_PATH}/esign-consent`, [
      200,
      { consent: { id: SIGNATURE_ID, text_version: 'esign-v1', consented_at: '2026-11-12T15:00:00Z', withdrawn_at: null } },
    ]);
    reply('POST', `${VIEW_PATH}/sign`, [200, { filing: queued() }]);
    await show(flow({ canStart: false }, claimRow('ready')));
    expect(await screen.findByTestId('filing-one-tap-submit')).toBeTruthy();
    expect(screen.queryByTestId('filing-esign')).toBeNull();
    await fireEvent.press(screen.getByTestId('filing-one-tap-submit'));
    await waitFor(() => expect(calls('POST', `${VIEW_PATH}/esign-consent`)).toHaveLength(1));
    expect(calls('POST', `${VIEW_PATH}/esign-consent`)[0].body).toEqual({ accepted: true, text_version: 'esign-v1' });
    await waitFor(() => expect(calls('POST', `${VIEW_PATH}/sign`)).toHaveLength(1));
  });
});

describe('status, withdraw and the self-file fallback', () => {
  it('withdraws a queued claim with the chosen reason, after a confirmation', async () => {
    reply('GET', VIEW_PATH, [200, { filing: queued() }]);
    reply('POST', `${VIEW_PATH}/withdraw`, [200, { filing: filingView({ status: 'withdrawn', packet: { status: 'closed' }, actions: { can_withdraw: false, can_self_file: false, can_edit: false } }) }]);
    await show(flow({ canStart: false }, claimRow('queued')));
    await fireEvent.press(await screen.findByTestId('filing-withdraw'));
    expect(screen.getByText(filing.withdrawConfirm.text)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filing-withdraw-filed_myself'));
    await fireEvent.press(screen.getByTestId('filing-confirm-yes'));
    await waitFor(() => expect(calls('POST', `${VIEW_PATH}/withdraw`)).toHaveLength(1));
    expect(calls('POST', `${VIEW_PATH}/withdraw`)[0].body).toEqual({ reason: 'filed_myself' });
  });

  it('reopens a signed claim for changes', async () => {
    reply('GET', VIEW_PATH, [200, { filing: queued() }]);
    reply('POST', `${VIEW_PATH}/reopen`, [200, { filing: filingView({ status: 'ready' }) }]);
    await show(flow({ canStart: false }, claimRow('queued')));
    await fireEvent.press(await screen.findByTestId('filing-reopen'));
    expect(screen.getByText(filing.reopenConfirm.text)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filing-confirm-yes'));
    expect(await screen.findByTestId('filing-step-need')).toBeTruthy();
    expect(calls('POST', `${VIEW_PATH}/reopen`)[0].body).toEqual({});
  });

  it('shows "Filed by Lawsuit AI" and takes the confirmation number', async () => {
    const filed = filingView({
      status: 'filed_by_claimmatch',
      packet: { status: 'signed', packet_hash: HASH, complete: true },
      signature: SIGNATURE,
      actions: { can_edit: false, can_withdraw: false, can_self_file: false, can_add_confirmation: true },
    });
    reply('GET', VIEW_PATH, [200, { filing: filed }]);
    reply('POST', `${VIEW_PATH}/confirmation`, [200, { filing: filingView({ status: 'submitted', confirmation: 'ABC123', actions: { can_withdraw: false, can_self_file: false } }) }]);
    await show(flow({ canStart: false }, claimRow('filed_by_claimmatch')));
    expect((await screen.findAllByText(filingStatus.filedLabel.text)).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('filing-confirmation-save'));
    expect(await screen.findByText(filing.confirmationEmpty.text)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('filing-confirmation-number'), ' ABC123 ');
    await fireEvent.press(screen.getByTestId('filing-confirmation-save'));
    await waitFor(() => expect(calls('POST', `${VIEW_PATH}/confirmation`)).toHaveLength(1));
    expect(calls('POST', `${VIEW_PATH}/confirmation`)[0].body).toEqual({ confirmation_number: 'ABC123' });
  });

  it('moves a claim on a self-file lane to the official site, never signing', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView({ lane: SELF_FILE_LANE, authorization: null }) }]);
    reply('POST', `${VIEW_PATH}/self-file`, [200, { filing: filingView({ status: 'self_file', lane: SELF_FILE_LANE, authorization: null }) }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    expect(await screen.findByTestId('filing-self-file-lane')).toBeTruthy();
    expect(screen.queryByTestId('filing-review')).toBeNull();
    await fireEvent.press(screen.getByTestId('filing-self-file-go'));
    expect(await screen.findByTestId('claim-step-2')).toBeTruthy();
    expect(calls('POST', `${VIEW_PATH}/self-file`)[0].body).toEqual({});
    expect(filingCalls()).not.toContain(`${VIEW_PATH}/sign`);
    // The prepared answers to copy, in Step 2.
    expect(await screen.findByTestId('filing-prepared')).toBeTruthy();
  });
});
