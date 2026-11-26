import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { claim as claimCopy } from '@/copy/claim';
import { filing } from '@/copy/filing';

import { CLAIM_ID, DOC_ID, LAWSUIT_ID, SELF_FILE_LANE, filingView } from './filing-fixtures';
import { calls, claimRow, client, filingCalls, flow, reply, resetHarness, show } from './filing-harness';

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
  useAuth: () => ({ status: 'signedIn', user: { id: 'user-1', email: 'ada@example.com' }, signInWithPassword: jest.fn() }),
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
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));

const VIEW_PATH = `/api/filing/claims/${CLAIM_ID}`;

beforeEach(() => resetHarness());
afterEach(() => client.clear());

describe('one-click filing off', () => {
  it.each([
    ['null (ONE_CLICK_FILING_ENABLED off)', null],
    ['absent (an older server)', undefined],
  ])('with oneClick %s, shows today’s self-file steps and never calls /api/filing', async (_name, oneClick) => {
    await show(flow(oneClick, claimRow('self_file')));
    expect(screen.getByTestId('claim-step-2')).toBeTruthy();
    expect(screen.getByText(claimCopy.step2Title.text)).toBeTruthy();
    expect(screen.getByText(claimCopy.statusNote.text)).toBeTruthy();
    expect(screen.queryByTestId('filing-entry')).toBeNull();
    expect(filingCalls()).toEqual([]);
  });

  it('keeps the self-file steps when the filing API answers 404', async () => {
    reply('GET', VIEW_PATH, [404, { error: 'Not found.', code: 'not_found' }]);
    await show(flow({ canStart: false }, claimRow('self_file')));
    await waitFor(() => expect(filingCalls()).toContain(VIEW_PATH));
    expect(screen.getByTestId('claim-step-2')).toBeTruthy();
    expect(screen.queryByTestId('filing-prepared')).toBeNull();
  });
});

describe('starting one-click filing', () => {
  it('offers "Start my claim" on an agent lane and opens the steps after it', async () => {
    reply('GET', `/api/filing/claims/preview?lawsuit_id=${LAWSUIT_ID}`, [
      200,
      { preview: { lawsuit_id: LAWSUIT_ID, lane: filingView().lane, claim_id: null, can_start: true } },
    ]);
    reply('POST', '/api/filing/claims', [201, { filing: filingView() }]);
    await show(flow({ canStart: true }, null));
    expect(screen.getByTestId('filing-entry')).toBeTruthy();
    expect(screen.getByText(filing.agentNote.text)).toBeTruthy();
    expect(await screen.findByText(/team member enters your signed claim/)).toBeTruthy();
    // The self-file steps stay below, titled for one-click filing.
    expect(screen.getByText(filing.selfFileTitle.text)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('filing-start'));
    expect(await screen.findByTestId('filing-step-need')).toBeTruthy();
    expect(calls('POST', '/api/filing/claims')[0].body).toEqual({ lawsuit_id: LAWSUIT_ID });
    expect(screen.getByTestId('filing-step-confirm')).toBeTruthy();
    expect(screen.getByTestId('filing-step-review')).toBeTruthy();
    expect(screen.getByTestId('claim-announcement').props.accessibilityLabel).toBe(filing.started.text);
    expect(screen.queryByTestId('claim-step-2')).toBeNull();
  });

  it('follows the claim screen’s per-account oneClick (test mode: a tester), whatever the config flag says', async () => {
    // The config's ONE_CLICK_FILING_ENABLED is off in this file (isFlagOn returns false): in test
    // mode the server decides per account, from the bearer token on the claim screen request.
    reply('GET', `/api/filing/claims/preview?lawsuit_id=${LAWSUIT_ID}`, [
      200,
      { preview: { lawsuit_id: LAWSUIT_ID, lane: filingView().lane, claim_id: null, can_start: true } },
    ]);
    await show(flow({ canStart: true }, null));
    expect(screen.getByTestId('filing-entry')).toBeTruthy();
    expect(calls('GET', '/api/mobile/claim/widget-settlement')[0].headers.Authorization).toBe('Bearer token-1');
  });

  it('shows why it can’t, on the self-file lane, at the top of Step 2', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView({ status: 'self_file', lane: SELF_FILE_LANE }) }]);
    await show(flow({ canStart: false }, claimRow('self_file')));
    expect(await screen.findByText('Lawsuit AI can’t file claims for this settlement right now.')).toBeTruthy();
    expect(screen.getByText(filing.selfFileNote.text)).toBeTruthy();
  });

  it('says the filing details could not be loaded for a one-click claim', async () => {
    reply('GET', VIEW_PATH, [503, { error: 'Try again.', code: 'service_unavailable' }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    expect(await screen.findByTestId('filing-load-failed')).toBeTruthy();
  });
});

describe('what we still need', () => {
  it('puts the we-file-this-claim card below the steps', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    expect(await screen.findByTestId('filing-step-confirm')).toBeTruthy();
    expect(screen.getByTestId('filing-lane')).toBeTruthy();
    const ids: string[] = [];
    const seen = new Set<object>();
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      const rec = node as { props?: { testID?: string }; children?: unknown };
      if (typeof rec.props?.testID === 'string') ids.push(rec.props.testID);
      const children = rec.children;
      if (Array.isArray(children)) children.forEach(walk);
      else walk(children);
    };
    walk(screen.toJSON());
    expect(ids.indexOf('filing-step-confirm')).toBeGreaterThan(-1);
    expect(ids.indexOf('filing-step-confirm')).toBeLessThan(ids.indexOf('filing-lane'));
    expect(ids.indexOf('filing-step-review')).toBeLessThan(ids.indexOf('filing-lane'));
  });

  it('shows profile details, asks the rest and saves only what changed', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
    reply('PATCH', `${VIEW_PATH}/packet`, [200, { filing: filingView() }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    expect(await screen.findByTestId('filing-from-profile')).toBeTruthy();
    expect(screen.getByText('Add your ZIP code.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('filing-field-member.address.zip-input'), '94110');
    await fireEvent.changeText(screen.getByTestId('filing-field-answers.widget_count-input'), '3');
    await fireEvent.press(screen.getByTestId('filing-field-answers.bought_online-yes'));
    await fireEvent.press(screen.getByTestId('filing-save'));
    expect(await screen.findByTestId('filing-saved')).toBeTruthy();
    expect(calls('PATCH', `${VIEW_PATH}/packet`)[0].body).toEqual({
      revision: 3,
      answers: { widget_count: 3, bought_online: true },
      member: { address: { zip: '94110' } },
    });
  });

  it('puts a typed value it can’t read next to its field, without saving', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    await screen.findByTestId('filing-need');
    await fireEvent.changeText(screen.getByTestId('filing-field-answers.widget_count-input'), 'lots');
    await fireEvent.press(screen.getByTestId('filing-save'));
    expect(await screen.findByText(filing.invalidWhole.text)).toBeTruthy();
    expect(calls('PATCH', `${VIEW_PATH}/packet`)).toEqual([]);
  });

  it('ticks "This describes me" only when the member does, and saves it', async () => {
    reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
    reply('PATCH', `${VIEW_PATH}/packet`, [200, { filing: filingView() }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    const box = await screen.findByTestId('filing-class-confirm');
    expect(box.props.accessibilityState?.checked).toBe(false);
    await fireEvent.press(box);
    await waitFor(() => expect(calls('PATCH', `${VIEW_PATH}/packet`)).toHaveLength(1));
    expect(calls('PATCH', `${VIEW_PATH}/packet`)[0].body).toEqual({ revision: 3, class_definition_confirmed: true });
  });

  it('uploads a photo through the signed URL and refreshes the view', async () => {
    const xhrs: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    class FakeXhr {
      upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
      status = 0;
      onload?: () => void;
      onerror?: () => void;
      onabort?: () => void;
      private record = { url: '', headers: {} as Record<string, string>, body: null as unknown };
      open(_method: string, url: string) {
        this.record.url = url;
      }
      setRequestHeader(name: string, value: string) {
        this.record.headers[name] = value;
      }
      send(body: unknown) {
        this.record.body = body;
        xhrs.push(this.record);
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        this.status = 200;
        this.onload?.();
      }
    }
    const realXhr = globalThis.XMLHttpRequest;
    const realFetch = globalThis.fetch;
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    globalThis.fetch = jest.fn(async () => ({ blob: async () => ({ size: 2048, type: 'image/jpeg' }) })) as unknown as typeof fetch;
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', fileName: 'IMG_0001.jpg', mimeType: 'image/jpeg', fileSize: 2048 }],
    });
    try {
      reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
      reply('POST', `${VIEW_PATH}/documents`, [
        200,
        {
          document: { id: DOC_ID, kind: 'receipt', status: 'pending_upload', mime: 'image/jpeg', size_bytes: 2048, sha256: null, created_at: '2026-11-12T14:10:00Z', stored_at: null },
          upload: { signed_url: 'https://storage.test/upload?token=t', token: 't', path: 'p', expires_at: '2099-01-01T00:00:00Z' },
        },
      ]);
      reply('POST', `${VIEW_PATH}/documents/${DOC_ID}/complete`, [
        200,
        { document: { id: DOC_ID, kind: 'receipt', status: 'stored', mime: 'image/jpeg', size_bytes: 2048, sha256: 'a'.repeat(64), created_at: '2026-11-12T14:10:00Z', stored_at: '2026-11-12T14:10:05Z' } },
      ]);
      await show(flow({ canStart: false }, claimRow('preparing')));
      await fireEvent.press(await screen.findByTestId('filing-docs-documents.receipt-camera'));
      await waitFor(() => expect(calls('POST', `${VIEW_PATH}/documents/${DOC_ID}/complete`)).toHaveLength(1));
      expect(calls('POST', `${VIEW_PATH}/documents`)[0].body).toEqual({ kind: 'receipt', mime: 'image/jpeg', size_bytes: 2048 });
      expect(xhrs).toEqual([
        { url: 'https://storage.test/upload?token=t', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: { size: 2048, type: 'image/jpeg' } },
      ]);
      // No file name and no bearer token went to Storage.
      expect(JSON.stringify(xhrs)).not.toMatch(/IMG_0001|token-1/);
      await waitFor(() => expect(filingCalls().filter((p) => p === VIEW_PATH).length).toBeGreaterThanOrEqual(2));
    } finally {
      globalThis.XMLHttpRequest = realXhr;
      globalThis.fetch = realFetch;
    }
  });

  it('says so when the camera is not allowed', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    reply('GET', VIEW_PATH, [200, { filing: filingView() }]);
    await show(flow({ canStart: false }, claimRow('preparing')));
    await fireEvent.press(await screen.findByTestId('filing-docs-documents.receipt-camera'));
    expect(await screen.findByText(filing.docsCameraDenied.text)).toBeTruthy();
    expect(calls('POST', `${VIEW_PATH}/documents`)).toEqual([]);
  });
});
