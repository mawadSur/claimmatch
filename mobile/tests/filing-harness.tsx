/**
 * Shared set-up for the one-click filing screen tests (filing-screen and
 * filing-sign): a fake API that answers by method and path, the providers,
 * and the claim screen's response. Each test file declares its own
 * jest.mock calls (they must be hoisted there) and points them at `mockFetch`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ClaimScreen } from '@/features/claim';

import { CLAIM_ID, LAWSUIT_ID } from './filing-fixtures';

export const mockFetch = jest.fn();
export const SLUG = 'widget-settlement';

type Reply = [number, unknown];
const replies = new Map<string, Reply[]>();
const lastReplies = new Map<string, Reply>();

export function reply(method: string, path: string, answer: Reply) {
  replies.set(`${method} ${path}`, [...(replies.get(`${method} ${path}`) ?? []), answer]);
}

export function calls(method: string, path: string): { body: unknown; headers: Record<string, string> }[] {
  return mockFetch.mock.calls
    .filter(([url, init]) => url === `https://api.test${path}` && (init as RequestInit).method === method)
    .map(([, init]) => {
      const r = init as RequestInit;
      return { body: r.body ? JSON.parse(String(r.body)) : undefined, headers: r.headers as Record<string, string> };
    });
}

export function filingCalls(): string[] {
  return mockFetch.mock.calls
    .map(([url]) => String(url).replace('https://api.test', ''))
    .filter((path) => path.startsWith('/api/filing'));
}

export function claimRow(status: string) {
  return {
    id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    lawsuit_title: 'Widget settlement',
    status,
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: '2026-11-01T00:00:00.000Z',
  };
}

/** GET /api/mobile/claim/{slug}: the flow, with the server's one-click decision. */
export function flow(oneClick: { canStart: boolean } | null | undefined, claim: object | null) {
  return {
    kind: 'flow',
    now: '2026-11-12T15:00:00.000Z',
    slug: SLUG,
    title: 'Widget settlement',
    category: 'Consumer',
    settlement: {
      id: LAWSUIT_ID,
      slug: SLUG,
      title: 'Widget settlement',
      deadline: '2026-12-15',
      officialUrl: 'https://www.widget-settlement.example/claim',
      sourceUrl: null,
      sourceHost: null,
      eligibility: null,
      proof: 'required',
      formFieldOrder: null,
    },
    context: {
      known: true,
      fictional: false,
      published: true,
      closedByStatus: false,
      deadline: '2026-12-15',
      deadlinePassed: false,
      openForClaims: true,
      lateReportOpen: true,
    },
    claim,
    profile: null,
    ...(oneClick === undefined ? {} : { oneClick }),
  };
}

export let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

export async function show(body: unknown) {
  reply('GET', `/api/mobile/claim/${SLUG}`, [200, body]);
  await render(<ClaimScreen slug={SLUG} />, { wrapper: Providers });
  await screen.findByTestId('claim-status');
}

export function resetHarness() {
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
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}
