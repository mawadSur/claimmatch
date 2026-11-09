import { FICTIONAL_SLUGS } from '@shared/lib/fictional-slugs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { app } from '@/copy/app';
import { common } from '@/copy/common';
import { settlement } from '@/copy/settlement';
import { shared } from '@/copy/shared';
import type { CatalogLawsuit } from '@/data/catalog';
import { guidesInUse } from '@/data/guides';
import { CC_BY_4_URL, SETTLESIGNAL_URL } from '@/features/shared';
import { SettlementScreen } from '@/features/settlement';
import { openExternalUrl } from '@/lib/external-link';
import { applyFlagOverrides } from '@/lib/flags';

type Result = { data: unknown; error: unknown; status: number };

const mockState: { result: Result; pending: boolean; selects: number } = {
  result: { data: null, error: null, status: 200 },
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

const mockAuth: { status: string } = { status: 'signedOut' };
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));

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

jest.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

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
    deadline: null,
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
  description: 'Acme agreed to pay $5 million to settle claims that it did not protect customer data.',
  category: 'Data breach',
  deadline: '2026-11-14',
  typical_payout: 'Up to $50',
  eligibility: { proof: 'no' },
  eligibility_text: 'US residents who got an Acme breach notice letter.',
  administrator: 'Kroll Settlement Administration',
  claim_url: 'https://www.acmesettlement.com/claim',
});

async function renderSettlement(slug: string, options: { catalog?: CatalogLawsuit[] } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  // As fetchCatalog leaves them: overlaid with the guides in use, and tagged with their version.
  const { version } = guidesInUse();
  if (options.catalog) client.setQueryData(['catalog'], options.catalog.map((lawsuit) => ({ ...lawsuit, guidesVersion: version })));
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <SettlementScreen slug={slug} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

async function renderFound(lawsuit: CatalogLawsuit) {
  mockState.result = { data: lawsuit, error: null, status: 200 };
  await renderSettlement(lawsuit.slug);
  await screen.findByRole('header', { name: lawsuit.title });
}

function sectionOrder(): string[] {
  return screen.getAllByTestId(/^settlement-section-/).map((section) => String(section.props.testID).replace('settlement-section-', ''));
}

function headers(): string[] {
  return screen.getAllByRole('header').map((header) => String(header.props.accessibilityLabel ?? header.props.children));
}

beforeEach(() => {
  mockState.result = { data: null, error: null, status: 200 };
  mockState.pending = false;
  mockState.selects = 0;
  mockConfig.flags = {};
  mockAuth.status = 'signedOut';
  mockRouter.push.mockClear();
  mockRouter.dismissTo.mockClear();
  (openExternalUrl as jest.Mock).mockClear();
});

afterEach(() => {
  applyFlagOverrides(null);
});

describe('settlement detail, open', () => {
  it('shows every section in the web’s order, with the sidebar inline and the legal disclaimer last', async () => {
    await renderFound(ACME);
    expect(sectionOrder()).toEqual([
      'header',
      'answer',
      'start',
      'unverified',
      'facts',
      'about',
      'qualify',
      'how',
      'faq',
      'next-steps',
      'legal',
    ]);
    expect(headers()).toEqual([
      'Acme Data Breach',
      settlement.shortAnswerTitle.text,
      settlement.aboutTitle.text,
      settlement.whoMayQualify.text,
      settlement.howFilingWorks.text,
      settlement.faqTitle.text,
      settlement.checkIfYouQualify.text,
      shared.legalDisclaimerTitle.text,
    ]);
  });

  it('shows the badges, the summary and the short answer from the listing', async () => {
    await renderFound(ACME);
    const header = within(screen.getByTestId('settlement-section-header'));
    expect(header.getByText('Data breach')).toBeOnTheScreen();
    expect(header.getByText(shared.openForClaims.text)).toBeOnTheScreen();
    expect(header.getByText('12 days left')).toBeOnTheScreen();
    expect(header.getByText('People whose data was exposed in the 2024 Acme breach.')).toBeOnTheScreen();

    const answer = within(screen.getByTestId('settlement-section-answer'));
    expect(answer.getByText(settlement.shortAnswerNote.text)).toBeOnTheScreen();
    expect(answer.getByLabelText('Who qualifies: US residents who got an Acme breach notice letter.')).toBeOnTheScreen();
    expect(answer.getByLabelText('Listed payout: Up to $50')).toBeOnTheScreen();
    expect(answer.getByLabelText('Claim deadline: Nov 14, 2026')).toBeOnTheScreen();
    expect(answer.getByLabelText('Proof needed: Not required')).toBeOnTheScreen();
    expect(answer.getByLabelText('Administrator: Kroll Settlement Administration')).toBeOnTheScreen();
    expect(screen.queryByTestId('settlement-missing-details')).not.toBeOnTheScreen();
  });

  it('starts the claim from every claim button and opens official links in the in-app browser', async () => {
    const user = userEvent.setup();
    await renderFound(ACME);
    const checkButtons = screen.getAllByRole('button', { name: settlement.checkIfYouQualify.text });
    const startButtons = screen.getAllByRole('button', { name: settlement.startYourClaim.text });
    expect(checkButtons).toHaveLength(2);
    expect(startButtons).toHaveLength(2);
    for (const button of [...checkButtons, ...startButtons]) {
      await user.press(button);
      expect(mockRouter.push).toHaveBeenLastCalledWith('/claim/acme-data-breach');
    }
    expect(mockRouter.push).toHaveBeenCalledTimes(4);
    expect(screen.getByText(settlement.freeYouFileYourself.text)).toBeOnTheScreen();

    for (const name of [
      'Official claim site (acmesettlement.com)',
      'Go to the official site (acmesettlement.com)',
      settlement.readRulesOnOfficialSite.text,
      shared.goToOfficialSite.text,
    ]) {
      (openExternalUrl as jest.Mock).mockClear();
      await user.press(screen.getByRole('link', { name }));
      expect(openExternalUrl).toHaveBeenCalledWith('https://www.acmesettlement.com/claim');
    }
  });

  it('shows the unverified section, the facts, About, who may qualify and how filing works', async () => {
    await renderFound(ACME);
    expect(screen.getByText(shared.unverifiedOpenBody.text)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Deadline: Nov 14, 2026. ${settlement.deadlineCutoff.text}`)).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Proof: Not required. The source says you don’t need proof. Check the official notice to be sure.'),
    ).toBeOnTheScreen();
    expect(screen.getByText(ACME.description as string)).toBeOnTheScreen();

    const qualify = within(screen.getByTestId('settlement-section-qualify'));
    expect(qualify.getByText(settlement.whatOurListingSays.text)).toBeOnTheScreen();
    expect(qualify.getByText('US residents who got an Acme breach notice letter.')).toBeOnTheScreen();
    expect(qualify.getByText(settlement.shortSummaryNote.text)).toBeOnTheScreen();

    for (const text of [settlement.stepQualifyTitle, settlement.stepFileBody, settlement.stepTrackBody]) {
      expect(screen.getByText(text.text)).toBeOnTheScreen();
    }
  });

  it('opens a FAQ answer on demand', async () => {
    const user = userEvent.setup();
    await renderFound(ACME);
    const question = screen.getByRole('button', { name: 'Am I eligible for the Acme Data Breach?' });
    expect(question).toHaveProp('accessibilityState', expect.objectContaining({ expanded: false }));
    expect(screen.queryByText(/^Our listing says:/)).not.toBeOnTheScreen();

    await user.press(question);
    expect(question).toHaveProp('accessibilityState', expect.objectContaining({ expanded: true }));
    expect(
      screen.getByText(
        'Our listing says: US residents who got an Acme breach notice letter. This is a short summary, not the official rules. Confirm who qualifies on the official notice before you file.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^(Am I|What is|Do I|How much|Who is|How do I)/ })).toHaveLength(6);
  });

  it('shows the sidebar inline: account note for people signed out, what ClaimMatch does, and the full disclaimer', async () => {
    await renderFound(ACME);
    const sidebar = within(screen.getByTestId('settlement-section-next-steps'));
    expect(sidebar.getByText(settlement.sidebarOpenBody.text)).toBeOnTheScreen();
    expect(sidebar.getByText(settlement.signInFirst.text)).toBeOnTheScreen();
    expect(sidebar.getByText(settlement.checklistFileYourself.text)).toBeOnTheScreen();
    expect(sidebar.getByText(settlement.checklistNeverFiles.text)).toBeOnTheScreen();
    expect(sidebar.getByText(settlement.checklistSaveNumber.text)).toBeOnTheScreen();
    expect(screen.getByText('Full legal disclaimer text.')).toBeOnTheScreen();
  });

  it('drops the account note for someone signed in', async () => {
    mockAuth.status = 'signedIn';
    await renderFound(ACME);
    expect(screen.queryByText(settlement.signInFirst.text)).not.toBeOnTheScreen();
  });

  it('opens at once from the catalog’s copy of the row', async () => {
    await renderSettlement(ACME.slug, { catalog: [ACME] });
    expect(screen.getByRole('header', { name: 'Acme Data Breach' })).toBeOnTheScreen();
    expect(mockState.selects).toBe(0);
  });
});

describe('settlement detail, listing details', () => {
  it('says which details are missing and links the source page, labeled as a source', async () => {
    const user = userEvent.setup();
    const BETA = row({
      slug: 'beta-bank-overdraft-fees',
      title: 'Beta Bank Overdraft Fees',
      typical_payout: null,
      source_url: 'https://www.classactionnews.org/beta',
    });
    await renderFound(BETA);
    expect(sectionOrder()).toEqual(['header', 'answer', 'start', 'unverified', 'facts', 'qualify', 'how', 'faq', 'provenance', 'next-steps', 'legal']);
    expect(
      screen.getByText(
        'We don’t have these details yet: who qualifies, deadline, administrator. Check the official notice.',
      ),
    ).toBeOnTheScreen();
    await user.press(within(screen.getByTestId('settlement-missing-details')).getByRole('link', { name: 'Source page' }));
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.classactionnews.org/beta');

    expect(screen.getByLabelText('Listed payout: Not stated')).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: /Official claim site/ })).not.toBeOnTheScreen();
    expect(screen.queryByText(/^Deadline: /)).not.toBeOnTheScreen();
    expect(screen.getByText(settlement.noEligibilityRules.text)).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: settlement.readRulesOnOfficialSite.text })).not.toBeOnTheScreen();
    expect(
      screen.getByText('We found this listing on classactionnews.org. That page is a source, not the settlement’s official site.'),
    ).toBeOnTheScreen();
  });

  it('credits SettleSignal with its links for a SettleSignal record', async () => {
    const user = userEvent.setup();
    const listing = 'https://settlesignal.com/settlements/delta';
    await renderFound(
      row({ slug: 'delta-streaming-privacy', title: 'Delta Streaming Privacy', external_id: 'settlesignal:9', source_url: listing }),
    );
    const provenance = within(screen.getByTestId('settlement-section-provenance'));
    expect(provenance.getByRole('header', { name: settlement.provenanceTitle.text })).toBeOnTheScreen();
    expect(
      provenance.getByText(
        'Adapted from SettleSignal (settlesignal.com), used under CC BY 4.0. ClaimMatch may have shortened or reformatted it. SettleSignal is a listing service, not the settlement’s official site.',
      ),
    ).toBeOnTheScreen();
    await user.press(provenance.getByRole('link', { name: settlement.provenanceSite.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith(SETTLESIGNAL_URL);
    await user.press(provenance.getByRole('link', { name: settlement.provenanceLicense.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith(CC_BY_4_URL);
    await user.press(provenance.getByRole('link', { name: settlement.seeSettleSignalListing.text }));
    expect(openExternalUrl).toHaveBeenLastCalledWith(listing);
  });

  it('hides the unverified section and uses the verified facts for a verified listing', async () => {
    mockConfig.flags = { VERIFIED_FIELDS_ENABLED: true };
    applyFlagOverrides({ VERIFIED_FIELDS_ENABLED: true });
    await renderFound({
      ...ACME,
      eligibility: {},
      verified_at: '2026-10-27T12:00:00Z',
      eligibility_verified: 'Anyone who held an Acme account in 2024.',
      proof_verified: 'optional',
    });
    expect(screen.getByText('Verified on Oct 27, 2026')).toBeOnTheScreen();
    expect(screen.queryByTestId('settlement-section-unverified')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Who qualifies: Anyone who held an Acme account in 2024.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Proof needed: Optional')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Proof: Optional. The source says proof is optional and may raise your payment. Check the official notice for details.',
      ),
    ).toBeOnTheScreen();
  });
});

describe('settlement detail, closed', () => {
  it('shows the closed variant: no claim buttons, the closed sidebar and a way back', async () => {
    const user = userEvent.setup();
    await renderFound({ ...ACME, status: 'closed' });
    expect(sectionOrder()).toEqual(['header', 'answer', 'unverified', 'facts', 'about', 'qualify', 'faq', 'next-steps', 'legal']);
    expect(screen.queryByRole('button', { name: settlement.startYourClaim.text })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: settlement.checkIfYouQualify.text })).not.toBeOnTheScreen();
    expect(screen.getByText(shared.unverifiedClosedBody.text)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Deadline: Nov 14, 2026. ${settlement.notTakingClaims.text}`)).toBeOnTheScreen();

    const sidebar = within(screen.getByTestId('settlement-section-next-steps'));
    expect(sidebar.getByRole('header', { name: shared.claimsClosed.text })).toBeOnTheScreen();
    expect(
      sidebar.getByText(
        'This settlement isn’t taking claims. Some settlements pay eligible people automatically. The official site says whether that applies.',
      ),
    ).toBeOnTheScreen();
    expect(sidebar.getByText(settlement.closedAlreadyFiled.text)).toBeOnTheScreen();
    await user.press(sidebar.getByRole('button', { name: app.browseOpenSettlements.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/lawsuits');
  });

  it('names the passed deadline', async () => {
    await renderFound({ ...ACME, deadline: '2026-10-01' });
    expect(screen.getByLabelText(`Deadline: Oct 1, 2026. ${settlement.deadlinePassed.text}`)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'This settlement isn’t taking claims. The deadline listed was Oct 1, 2026. Some settlements pay eligible people automatically. The official site says whether that applies.',
      ),
    ).toBeOnTheScreen();
  });
});

describe('settlement detail, not found and errors', () => {
  it('tells people a fictional listing was not real, without asking the server', async () => {
    const user = userEvent.setup();
    await renderSettlement(FICTIONAL_SLUGS[0]);
    expect(screen.getByRole('header', { name: settlement.fictionalTitle.text })).toBeOnTheScreen();
    expect(screen.getByText(settlement.fictionalBody.text)).toBeOnTheScreen();
    expect(mockState.selects).toBe(0);
    await user.press(screen.getByRole('button', { name: app.browseOpenSettlements.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/lawsuits');
  });

  it('sends people with an unknown or unlisted slug to the official notice', async () => {
    mockState.result = { data: null, error: null, status: 200 };
    await renderSettlement('no-such-settlement');
    expect(await screen.findByRole('header', { name: settlement.notFoundTitle.text })).toBeOnTheScreen();
    expect(screen.getByText(settlement.notFoundBody.text)).toBeOnTheScreen();
    expect(screen.queryByText(settlement.fictionalBody.text)).not.toBeOnTheScreen();
  });

  it('treats an unpublished row as not found', async () => {
    mockState.result = { data: { ...ACME, review_status: 'draft' }, error: null, status: 200 };
    await renderSettlement(ACME.slug);
    expect(await screen.findByRole('header', { name: settlement.notFoundTitle.text })).toBeOnTheScreen();
  });

  it('shows the error page’s wording with "Try again", and loads on retry', async () => {
    const user = userEvent.setup();
    mockState.result = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };
    await renderSettlement(ACME.slug);
    expect(await screen.findByRole('header', { name: common.loadErrorTitle.text })).toBeOnTheScreen();
    expect(screen.getByText(common.loadErrorBody.text)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: app.browseOpenSettlements.text })).toBeOnTheScreen();

    mockState.result = { data: ACME, error: null, status: 200 };
    await user.press(screen.getByRole('button', { name: common.tryAgain.text }));
    expect(await screen.findByRole('header', { name: 'Acme Data Breach' })).toBeOnTheScreen();
  });

  it('tells people offline to check their connection', async () => {
    mockState.result = { data: null, error: { message: 'Network request failed', code: '' }, status: 0 };
    await renderSettlement(ACME.slug);
    expect(await screen.findByText(common.networkError.text)).toBeOnTheScreen();
  });

  it('shows a skeleton while it loads', async () => {
    mockState.pending = true;
    await renderSettlement(ACME.slug);
    expect(screen.getByLabelText(common.loading.text)).toBeOnTheScreen();
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  });
});
