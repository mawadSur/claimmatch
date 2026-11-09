import { SETTLEMENT_GUIDES, type SettlementGuide } from '@shared/lib/settlement-guides';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { settlement } from '@/copy/settlement';
import { applyConfigGuides } from '@/data/guides';
import { SettlementScreen } from '@/features/settlement';
import { ConfigProvider } from '@/providers/ConfigProvider';

/**
 * An open settlement screen when GET /api/mobile/config brings new guides
 * (src/data/guides.ts): the screen is read again, and until that read
 * answers it keeps showing one guide's version throughout. Its proof note
 * and FAQ come with its row, like the deadline, payout and link, instead of
 * from the guides in use at render time.
 */

type Result = { data: unknown; error: unknown; status: number };

/** Supabase: every read answers `result`, each after the next queued hold. */
const mockSupabase: { result: Result; holds: Promise<void>[]; reads: number } = {
  result: { data: null, error: null, status: 200 },
  holds: [],
  reads: 0,
};

function mockBuilder() {
  mockSupabase.reads += 1;
  const hold = mockSupabase.holds.shift() ?? Promise.resolve();
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'or', 'not', 'order', 'abortSignal', 'maybeSingle']) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    hold.then(() => mockSupabase.result).then(resolve, reject);
  return builder;
}

jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ from: () => mockBuilder() }) }));

// 10:00 in New York on Nov 2, 2026.
jest.mock('@/lib/clock', () => ({ now: () => new Date('2026-11-02T15:00:00Z'), recordServerTime: () => undefined }));

/** The config answer, held until the test lets it through. */
const mockConfig: { gate: Promise<void>; answer: () => unknown } = { gate: Promise.resolve(), answer: () => ({}) };
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({
    request: async (_path: string, options: { parse?: (json: unknown) => unknown } = {}) => {
      await mockConfig.gate;
      const json = JSON.parse(JSON.stringify(mockConfig.answer()));
      return { ok: true, status: 200, data: options.parse ? options.parse(json) : json };
    },
  }),
}));

jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'signedOut' }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  AndroidHaptics: { Virtual_Key: 'virtual-key' },
}));
jest.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

const SIX = 'six-flags-fees-california-class-action-settlement';
const BUNDLED_SIX = SETTLEMENT_GUIDES.find((guide) => guide.slugs.includes(SIX)) as SettlementGuide;
/** The server's copy: Six Flags' deadline, proof rule and questions edited. */
const SERVER_GUIDES: SettlementGuide[] = [
  ...SETTLEMENT_GUIDES.filter((guide) => guide !== BUNDLED_SIX),
  {
    ...BUNDLED_SIX,
    deadline: '2027-01-15',
    proofDetail: 'Edited proof rule.',
    extraFaqs: [{ q: 'Edited question?', a: 'Edited answer.' }],
  },
];

const ROW = {
  id: 'id-six',
  slug: SIX,
  title: 'Six Flags Fees',
  summary: null,
  description: null,
  category: 'Consumer',
  status: 'open',
  review_status: 'published',
  typical_payout: 'Feed payout.',
  proof_required: false,
  deadline: '2026-11-30',
  eligibility: {},
  eligibility_text: null,
  source_url: null,
  claim_url: 'https://www.knottsgreatamericasettlement.com/submit-claim',
  external_id: null,
  is_featured: false,
  administrator: null,
  verified_at: null,
  eligibility_verified: null,
  proof_verified: null,
};

function configAnswer(extra: Record<string, unknown> = {}) {
  return {
    apiVersion: 1,
    serverTime: '2026-11-02T15:00:00.000Z',
    todayDeadlineZone: '2026-11-02',
    flags: {},
    legal: { disclaimer: 'Disclaimer.', short: 'Short.', contactEmail: null },
    minBuild: { ios: 0, android: 0 },
    ...extra,
  };
}

/** A promise and the function that settles it. */
function held(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const deadlineFact = (date: string) => `${settlement.deadline.text}: ${date}. ${settlement.deadlineCutoff.text}`;
const proofFact = (note: string) => `${settlement.proof.text}: Not required. ${note}`;

let client: QueryClient;

beforeEach(() => {
  applyConfigGuides({}); // the bundled guides
  mockSupabase.result = { data: ROW, error: null, status: 200 };
  mockSupabase.holds = [];
  mockSupabase.reads = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  client.clear();
  applyConfigGuides({});
});

it('reads an open settlement screen again when the guides change, never showing half of each', async () => {
  const config = held();
  mockConfig.gate = config.promise;
  mockConfig.answer = () => configAnswer({ guidesVersion: 'server2', guides: SERVER_GUIDES });
  await render(
    <QueryClientProvider client={client}>
      <ConfigProvider>
        <SafeAreaProvider initialMetrics={METRICS}>
          <SettlementScreen slug={SIX} />
        </SafeAreaProvider>
      </ConfigProvider>
    </QueryClientProvider>,
  );

  // Before the config answers: the bundled guide's deadline and proof rule.
  expect(await screen.findByLabelText(deadlineFact('Dec 22, 2026'))).toBeOnTheScreen();
  expect(BUNDLED_SIX.deadline).toBe('2026-12-22');
  expect(screen.getByLabelText(proofFact(BUNDLED_SIX.proofDetail))).toBeOnTheScreen();
  expect(mockSupabase.reads).toBe(1);

  // The config brings the server's guides; the screen's new read is held.
  const reread = held();
  mockSupabase.holds.push(reread.promise);
  await act(async () => config.release());
  // The screen has rendered again with the config's answer (its legal text), the new guides in use.
  expect(await screen.findByText('Disclaimer.')).toBeOnTheScreen();
  expect(mockSupabase.reads).toBe(2);
  // Until the read answers, the page is the bundled guide's throughout: proof note and FAQ included.
  expect(screen.getByLabelText(deadlineFact('Dec 22, 2026'))).toBeOnTheScreen();
  expect(screen.getByLabelText(proofFact(BUNDLED_SIX.proofDetail))).toBeOnTheScreen();
  expect(screen.queryByText('Edited proof rule.')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Edited question?' })).not.toBeOnTheScreen();

  await act(async () => reread.release());
  expect(await screen.findByLabelText(deadlineFact('Jan 15, 2027'))).toBeOnTheScreen();
  expect(screen.getByLabelText(proofFact('Edited proof rule.'))).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Edited question?' })).toBeOnTheScreen();
  expect(screen.queryByLabelText(proofFact(BUNDLED_SIX.proofDetail))).not.toBeOnTheScreen();
});
