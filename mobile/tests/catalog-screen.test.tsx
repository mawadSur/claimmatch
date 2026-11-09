import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { catalog } from '@/copy/catalog';
import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import type { CatalogLawsuit } from '@/data/catalog';
import { CatalogCard, CatalogScreen, SEARCH_DEBOUNCE_MS } from '@/features/catalog';
import { openExternalUrl } from '@/lib/external-link';
import { applyFlagOverrides } from '@/lib/flags';

type Result = { data: unknown; error: unknown; status: number };

const mockState: { result: Result; pending: boolean; selects: number } = {
  result: { data: [], error: null, status: 200 },
  pending: false,
  selects: 0,
};

/** A PostgREST builder that resolves with mockState.result (or never, while pending). */
function mockBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'or', 'not', 'order', 'abortSignal', 'maybeSingle']) {
    builder[method] = () => {
      if (method === 'select') mockState.selects += 1;
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    mockState.pending ? new Promise(() => undefined) : Promise.resolve(mockState.result).then(resolve, reject);
  return builder;
}

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: () => mockBuilder() }),
}));

// 10:00 in New York on Nov 2, 2026.
jest.mock('@/lib/clock', () => ({ now: () => new Date('2026-11-02T15:00:00Z') }));

const mockConfig: { flags: Record<string, boolean> } = { flags: {} };
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    isFlagOn: (name: string) => mockConfig.flags[name] === true,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short disclaimer text.', contactEmail: null, fromServer: true },
  }),
}));

const mockRouter = { push: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

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

// Static skeletons: no animation loop in tests.
jest.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

const NOW = new Date('2026-11-02T15:00:00Z');
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

function row(overrides: Partial<CatalogLawsuit> & { slug: string }): CatalogLawsuit {
  return {
    id: `id-${overrides.slug}`,
    title: `Title ${overrides.slug}`,
    summary: null,
    description: null,
    category: 'Data breach',
    status: 'open',
    review_status: 'published',
    typical_payout: null,
    proof_required: false,
    deadline: '2026-12-01',
    eligibility: {},
    eligibility_text: null,
    source_url: null,
    claim_url: null,
    external_id: null,
    is_featured: false,
    administrator: null,
    verified_at: null,
    eligibility_verified: null,
    proof_verified: null,
    ...overrides,
  };
}

const ACME = row({
  slug: 'acme-data-breach',
  title: 'Acme Data Breach',
  summary: 'People whose data was exposed in the 2024 Acme breach.',
  category: 'Data breach',
  deadline: '2026-11-14',
  typical_payout: 'Up to $50',
  eligibility: { proof: 'no' },
  claim_url: 'https://www.acmesettlement.com/claim',
});
const BETA = row({
  slug: 'beta-bank-overdraft-fees',
  title: 'Beta Bank Overdraft Fees',
  summary: 'Overdraft fees charged between 2019 and 2023.',
  category: 'Banking',
  deadline: '2027-01-15',
  typical_payout: '$25 to $100',
  proof_required: true,
  source_url: 'https://www.classactionnews.org/beta',
});
const GAMMA = row({
  slug: 'gamma-vehicle-defect',
  title: 'Gamma Vehicle Defect',
  // Repeats the title, so the card shows no summary (displaySummary).
  summary: 'Gamma Vehicle Defect',
  category: 'Automotive',
  deadline: null,
});
const DELTA = row({
  slug: 'delta-streaming-privacy',
  title: 'Delta Streaming Privacy',
  category: 'Privacy',
  deadline: '2026-12-20',
  external_id: 'settlesignal:123',
  source_url: 'https://settlesignal.com/settlements/delta',
});

function serve(rows: CatalogLawsuit[]) {
  mockState.result = { data: rows, error: null, status: 200 };
}

async function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>
    </QueryClientProvider>,
  );
  return client;
}

async function renderCatalog(rows: CatalogLawsuit[] = [GAMMA, ACME, DELTA, BETA]) {
  serve(rows);
  const client = await renderWithProviders(<CatalogScreen />);
  if (rows.length > 0) await screen.findByRole('header', { name: rows[0].title });
  return client;
}

function cardTitles(): string[] {
  return screen.getAllByRole('header').map((header) => String(header.props.accessibilityLabel));
}

function statusLine() {
  return screen.getByTestId('catalog-status');
}

/** toBeChecked() covers checkbox, radio and switch only, so read the state the screen reader gets. */
function expectChip(name: string, checked: boolean) {
  expect(screen.getByRole('togglebutton', { name })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked }),
  );
}

beforeEach(() => {
  mockState.result = { data: [], error: null, status: 200 };
  mockState.pending = false;
  mockState.selects = 0;
  mockConfig.flags = {};
  mockRouter.push.mockClear();
  mockRouter.dismissTo.mockClear();
  (openExternalUrl as jest.Mock).mockClear();
  (AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock).mockClear();
});

afterEach(() => {
  applyFlagOverrides(null);
  jest.useRealTimers();
});

describe('catalog', () => {
  it('shows the intro, the unverified notice and one card per open settlement, known deadlines first', async () => {
    await renderCatalog();
    expect(screen.getByText(catalog.intro.text)).toBeOnTheScreen();
    expect(screen.getByText(common.unverifiedLabel.text)).toBeOnTheScreen();
    expect(screen.getByText(common.unverifiedNoticeBody.text)).toBeOnTheScreen();
    expect(cardTitles()).toEqual(['Acme Data Breach', 'Delta Streaming Privacy', 'Beta Bank Overdraft Fees', 'Gamma Vehicle Defect']);
    expect(statusLine()).toHaveTextContent('Showing 4 open settlements');
    expect(screen.getByText('Short disclaimer text.')).toBeOnTheScreen();
  });

  it('ports the card: badges, summary, deadline, proof, payout as listed, and the unverified line with its link', async () => {
    const user = userEvent.setup();
    await renderCatalog();
    const acme = within(screen.getByTestId('catalog-card-acme-data-breach'));
    expect(acme.getByText('Data breach')).toBeOnTheScreen();
    expect(acme.getByText('12 days left')).toBeOnTheScreen();
    expect(acme.getByText('People whose data was exposed in the 2024 Acme breach.')).toBeOnTheScreen();
    expect(acme.getByLabelText('Deadline: Nov 14, 2026')).toBeOnTheScreen();
    expect(acme.getByLabelText('Proof: Not required')).toBeOnTheScreen();
    expect(acme.getByLabelText('Payout, as listed: Up to $50')).toBeOnTheScreen();
    expect(acme.getByText(shared.unverifiedLineLabel.text)).toBeOnTheScreen();
    await user.press(acme.getByRole('link', { name: 'Official site for Acme Data Breach' }));
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.acmesettlement.com/claim');

    const beta = within(screen.getByTestId('catalog-card-beta-bank-overdraft-fees'));
    expect(beta.getByLabelText('Proof: Required')).toBeOnTheScreen();
    expect(beta.getByRole('link', { name: 'Source page for Beta Bank Overdraft Fees' })).toBeOnTheScreen();

    const delta = within(screen.getByTestId('catalog-card-delta-streaming-privacy'));
    expect(delta.getByRole('link', { name: 'SettleSignal listing for Delta Streaming Privacy' })).toBeOnTheScreen();

    const gamma = within(screen.getByTestId('catalog-card-gamma-vehicle-defect'));
    // The summary only repeated the title.
    expect(gamma.getAllByText('Gamma Vehicle Defect')).toHaveLength(1);
    // The pill and the Deadline value.
    expect(gamma.getAllByText(catalog.noDeadlineListed.text)).toHaveLength(2);
    expect(gamma.getByLabelText('Deadline: No deadline listed')).toBeOnTheScreen();
    expect(gamma.getByLabelText('Proof: Unknown')).toBeOnTheScreen();
    expect(gamma.getByLabelText('Payout, as listed: Not stated')).toBeOnTheScreen();
    expect(gamma.getByText(shared.noLinkYet.text)).toBeOnTheScreen();
  });

  it('starts a claim and opens the details, named for the settlement', async () => {
    const user = userEvent.setup();
    await renderCatalog();
    await user.press(screen.getByRole('button', { name: 'Start your claim for Acme Data Breach' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/claim/acme-data-breach');
    await user.press(screen.getByRole('button', { name: 'Details about Acme Data Breach' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/lawsuits/acme-data-breach');
    await user.press(screen.getByRole('header', { name: 'Beta Bank Overdraft Fees' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/lawsuits/beta-bank-overdraft-fees');
  });

  it('credits SettleSignal only while a SettleSignal listing is shown', async () => {
    const user = userEvent.setup();
    await renderCatalog([ACME, DELTA]);
    expect(screen.getByTestId('catalog-credit')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Listings from SettleSignal are adapted from SettleSignal (settlesignal.com) under CC BY 4.0. ClaimMatch may have shortened or reformatted them.',
      ),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('togglebutton', { name: 'Data breach' }));
    expect(cardTitles()).toEqual(['Acme Data Breach']);
    expect(screen.queryByTestId('catalog-credit')).not.toBeOnTheScreen();
    expect(screen.getByText('Short disclaimer text.')).toBeOnTheScreen();
  });

  it('shows no credit without a SettleSignal listing', async () => {
    await renderCatalog([ACME, BETA]);
    expect(screen.queryByTestId('catalog-credit')).not.toBeOnTheScreen();
  });
});

describe('catalog filters', () => {
  it('offers All, every category A to Z, Has a deadline and No proof required', async () => {
    await renderCatalog();
    expect(screen.getAllByRole('togglebutton').map((chip) => chip.props.accessibilityLabel)).toEqual([
      'All',
      'Automotive',
      'Banking',
      'Data breach',
      'Privacy',
      'Has a deadline',
      'No proof required',
    ]);
    expectChip('All', true);
    expect(screen.queryByRole('button', { name: catalog.clearAllFilters.text })).not.toBeOnTheScreen();
  });

  it('filters by category, deadline and proof at once, says so in the status line, and clears them all', async () => {
    const user = userEvent.setup();
    await renderCatalog();

    await user.press(screen.getByRole('togglebutton', { name: 'Banking' }));
    expect(cardTitles()).toEqual(['Beta Bank Overdraft Fees']);
    expectChip('Banking', true);
    expectChip('All', false);
    expect(statusLine()).toHaveTextContent('Showing 1 open settlement in Banking');
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenLastCalledWith(
      'Showing 1 open settlement in Banking',
      { queue: true },
    );

    // A second press goes back to All.
    await user.press(screen.getByRole('togglebutton', { name: 'Banking' }));
    expect(cardTitles()).toHaveLength(4);

    await user.press(screen.getByRole('togglebutton', { name: catalog.hasDeadline.text }));
    expect(cardTitles()).toEqual(['Acme Data Breach', 'Delta Streaming Privacy', 'Beta Bank Overdraft Fees']);
    expect(statusLine()).toHaveTextContent('Showing 3 open settlements with a listed deadline');

    await user.press(screen.getByRole('togglebutton', { name: catalog.noProofRequired.text }));
    expect(cardTitles()).toEqual(['Acme Data Breach']);
    expect(statusLine()).toHaveTextContent(
      'Showing 1 open settlement with a listed deadline that list proof as not required',
    );

    await user.press(screen.getByRole('button', { name: catalog.clearAllFilters.text }));
    expect(cardTitles()).toHaveLength(4);
    expectChip('All', true);
    expectChip(catalog.hasDeadline.text, false);
    expect(screen.queryByRole('button', { name: catalog.clearAllFilters.text })).not.toBeOnTheScreen();
  });

  it('searches 300 ms after the last keystroke, over title and summary, with the web placeholder and limit', async () => {
    await renderCatalog();
    const input = screen.getByLabelText(catalog.searchLabel.text);
    expect(input).toHaveProp('placeholder', 'Search: data breach, overdraft fees, vehicle…');
    expect(input).toHaveProp('maxLength', 100);

    jest.useFakeTimers();
    await fireEvent.changeText(input, '  OVERDRAFT ');
    expect(input).toHaveDisplayValue('  OVERDRAFT ');
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(cardTitles()).toHaveLength(4);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(cardTitles()).toEqual(['Beta Bank Overdraft Fees']);
    expect(statusLine()).toHaveTextContent('Showing 1 open settlement matching “OVERDRAFT”');
    // The chips still come from the whole open list.
    expect(screen.getByRole('togglebutton', { name: 'Privacy' })).toBeOnTheScreen();

    // Every word must appear, in the title or the summary.
    await fireEvent.changeText(input, 'acme 2024');
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(cardTitles()).toEqual(['Acme Data Breach']);

    await fireEvent.press(screen.getByRole('button', { name: catalog.clearSearch.text }));
    expect(input).toHaveDisplayValue('');
    expect(cardTitles()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: catalog.clearSearch.text })).not.toBeOnTheScreen();
  });

  it('searches at once from the keyboard’s search key', async () => {
    await renderCatalog();
    const input = screen.getByLabelText(catalog.searchLabel.text);
    jest.useFakeTimers();
    await fireEvent.changeText(input, 'privacy');
    await fireEvent(input, 'submitEditing');
    expect(cardTitles()).toEqual(['Delta Streaming Privacy']);
  });

  it('shows the filtered empty state with "Clear filters"', async () => {
    const user = userEvent.setup();
    await renderCatalog();
    await user.press(screen.getByRole('togglebutton', { name: 'Automotive' }));
    await user.press(screen.getByRole('togglebutton', { name: catalog.hasDeadline.text }));

    expect(screen.queryAllByRole('header', { name: /Vehicle|Breach|Fees|Privacy/ })).toHaveLength(0);
    expect(screen.getByText(catalog.emptyFilteredTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(catalog.emptyFilteredBody.text)).toBeOnTheScreen();
    expect(statusLine()).toHaveTextContent('No open settlements found in Automotive with a listed deadline');

    await user.press(screen.getByRole('button', { name: catalog.clearFilters.text }));
    expect(cardTitles()).toHaveLength(4);
  });
});

describe('catalog states', () => {
  function pullToRefresh() {
    return screen.getByTestId('catalog-list').props.refreshControl.props as { refreshing: boolean; onRefresh(): void };
  }

  it('loads the list again when pulled down', async () => {
    await renderCatalog([ACME]);
    serve([ACME, BETA]);
    await act(async () => pullToRefresh().onRefresh());
    expect(await screen.findByRole('header', { name: 'Beta Bank Overdraft Fees' })).toBeOnTheScreen();
    expect(pullToRefresh().refreshing).toBe(false);
  });

  it('keeps the last list and says so when a refresh fails', async () => {
    await renderCatalog([ACME]);
    mockState.result = { data: null, error: { message: 'boom', code: 'XX000' }, status: 503 };
    await act(async () => pullToRefresh().onRefresh());
    expect(await screen.findByText(common.genericError.text)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Acme Data Breach' })).toBeOnTheScreen();
    expect(pullToRefresh().refreshing).toBe(false);
  });

  it('renders only a window of a long list', async () => {
    const many = Array.from({ length: 360 }, (_, index) =>
      row({ slug: `settlement-${String(index).padStart(3, '0')}`, title: `Settlement ${index}`, deadline: '2026-12-01' }),
    );
    await renderCatalog(many);
    expect(statusLine()).toHaveTextContent('Showing 360 open settlements');
    expect(screen.getAllByRole('header').length).toBeLessThan(30);
  });

  it('shows skeleton cards while loading', async () => {
    mockState.pending = true;
    await renderWithProviders(<CatalogScreen />);
    expect(screen.getByLabelText(common.loading.text)).toBeOnTheScreen();
    expect(screen.getByText(common.unverifiedLabel.text)).toBeOnTheScreen();
    expect(screen.queryByTestId('catalog-status')).not.toBeOnTheScreen();
  });

  it('says when there is nothing open, without "Clear filters"', async () => {
    serve([]);
    await renderWithProviders(<CatalogScreen />);
    expect(await screen.findByText(catalog.emptyTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(catalog.emptyBody.text)).toBeOnTheScreen();
    expect(statusLine()).toHaveTextContent('No open settlements found');
    expect(screen.queryByRole('button', { name: catalog.clearFilters.text })).not.toBeOnTheScreen();
    expect(screen.getByText('Short disclaimer text.')).toBeOnTheScreen();
  });

  it('shows the web error with "Try again", and loads on retry', async () => {
    const user = userEvent.setup();
    mockState.result = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };
    await renderWithProviders(<CatalogScreen />);
    expect(await screen.findByText(catalog.errorTitle.text)).toBeOnTheScreen();
    expect(screen.getByText(catalog.errorBody.text)).toBeOnTheScreen();
    expect(statusLine()).toHaveTextContent(catalog.statusError.text);

    serve([ACME]);
    await user.press(screen.getByRole('button', { name: common.tryAgain.text }));
    expect(await screen.findByRole('header', { name: 'Acme Data Breach' })).toBeOnTheScreen();
    expect(screen.queryByText(catalog.errorTitle.text)).not.toBeOnTheScreen();
  });

  it('tells people offline to check their connection', async () => {
    mockState.result = { data: null, error: { message: 'Network request failed', code: '' }, status: 0 };
    await renderWithProviders(<CatalogScreen />);
    expect(await screen.findByText(common.networkError.text)).toBeOnTheScreen();
  });
});

describe('CatalogCard', () => {
  function renderCard(lawsuit: CatalogLawsuit) {
    return renderWithProviders(
      <CatalogCard lawsuit={lawsuit} now={NOW} onStartClaim={jest.fn()} onShowDetails={jest.fn()} />,
    );
  }

  it('shows "Claims closed" and no claim buttons once the settlement is not open', async () => {
    await renderCard({ ...ACME, deadline: '2026-10-01' });
    expect(screen.getByText(shared.claimsClosed.text)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Start your claim/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Details about/ })).not.toBeOnTheScreen();
    expect(screen.queryByText('Deadline passed')).not.toBeOnTheScreen();
  });

  it('hides the unverified line and shows the verified proof rule for a verified listing', async () => {
    mockConfig.flags = { VERIFIED_FIELDS_ENABLED: true };
    applyFlagOverrides({ VERIFIED_FIELDS_ENABLED: true });
    await renderCard({ ...BETA, verified_at: '2026-10-27T12:00:00Z', proof_verified: 'no', administrator: 'Kroll' });
    expect(screen.getByText('Verified on Oct 27, 2026')).toBeOnTheScreen();
    expect(screen.queryByText(shared.unverifiedLineLabel.text)).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Proof: Not required')).toBeOnTheScreen();
  });

  it('keeps "Start your claim" and "Details" side by side, and stacks them full width at large text sizes', async () => {
    const regular = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    await renderCard(ACME);
    expect(screen.getByTestId('catalog-card-actions-acme-data-breach')).toHaveStyle({ flexDirection: 'row' });
    regular.mockRestore();
    // RNTL 14's unmount is async: unawaited, it overlapped the next render's act() and kept Jest from exiting.
    await screen.unmount();

    // Accessibility sizes: "Details" broke as "Detail" / "s" in the narrow right-hand button.
    const large = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 2.643 });
    await renderCard(ACME);
    expect(screen.getByTestId('catalog-card-actions-acme-data-breach')).not.toHaveStyle({ flexDirection: 'row' });
    for (const name of ['Start your claim for Acme Data Breach', 'Details about Acme Data Breach']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ alignSelf: 'stretch' });
      expect(screen.getByRole('button', { name })).not.toHaveStyle({ flexBasis: 80 });
    }
    large.mockRestore();
  });

  it('never shows a match score in place of the category', async () => {
    await renderCard(ACME);
    expect(screen.queryByText(/%/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/eligible|qualify for this|owed/i)).not.toBeOnTheScreen();
  });
});
