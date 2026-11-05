import type { CatalogLawsuit } from '@/data/catalog';
import { render, screen, userEvent } from '@testing-library/react-native';

import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import {
  CC_BY_4_URL,
  ClaimStatusBadge,
  CompactDisclaimer,
  DeadlineText,
  LegalDisclaimer,
  SETTLESIGNAL_DATA_URL,
  SETTLESIGNAL_URL,
  SettleSignalCredit,
  SettlementBadges,
  ShortDisclaimer,
  SignedOutPrompt,
  UnverifiedBadge,
  UnverifiedLine,
  UnverifiedNotice,
} from '@/features/shared';
import { openExternalUrl } from '@/lib/external-link';

const mockConfig: { flags: Record<string, boolean> } = { flags: {} };
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    isFlagOn: (name: string) => mockConfig.flags[name] === true,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short disclaimer text.', contactEmail: null, fromServer: true },
  }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

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

/** Nov 2, 2026, 15:00 UTC: Nov 2 in the deadline zone. */
const NOW = new Date('2026-11-02T15:00:00Z');

function lawsuit(overrides: Partial<CatalogLawsuit> = {}): CatalogLawsuit {
  return {
    id: 'l1',
    slug: 'acme-data-breach',
    title: 'Acme Data Breach',
    summary: null,
    description: null,
    category: 'Data breach',
    status: 'open',
    review_status: 'published',
    typical_payout: null,
    proof_required: false,
    deadline: '2026-11-14',
    eligibility: {},
    eligibility_text: null,
    source_url: null,
    // A real-looking host: *.example hosts count as placeholders (isPlaceholderUrl).
    claim_url: 'https://www.acmesettlement.com/claim',
    external_id: null,
    is_featured: false,
    administrator: 'Acme Administrator',
    verified_at: null,
    eligibility_verified: null,
    proof_verified: null,
    ...overrides,
  };
}

const verified = { verified_at: '2026-10-27T12:00:00Z', administrator: 'Kroll' };

beforeEach(() => {
  mockConfig.flags = {};
  mockPush.mockClear();
  (openExternalUrl as jest.Mock).mockClear();
});

describe('SettlementBadges', () => {
  it('shows the category and, without the closes-in flag, the urgency badge of an open settlement', async () => {
    await render(<SettlementBadges lawsuit={lawsuit()} now={NOW} />);
    expect(screen.getByText('Data breach')).toBeOnTheScreen();
    expect(screen.getByText('12 days left')).toBeOnTheScreen();
    expect(screen.queryByText(/Verified on/)).toBeNull();
  });

  it('shows "Closes in N days" instead with CLOSES_IN_CHIPS_ENABLED, and the verified badge with VERIFIED_FIELDS_ENABLED', async () => {
    mockConfig.flags = { CLOSES_IN_CHIPS_ENABLED: true, VERIFIED_FIELDS_ENABLED: true };
    await render(<SettlementBadges lawsuit={lawsuit(verified)} now={NOW} />);
    expect(screen.getByText('Closes in 12 days')).toBeOnTheScreen();
    expect(screen.queryByText('12 days left')).toBeNull();
    expect(screen.getByText('Verified on Oct 27, 2026')).toBeOnTheScreen();
  });

  it('never shows a verified badge while the flag is off', async () => {
    await render(<SettlementBadges lawsuit={lawsuit(verified)} now={NOW} />);
    expect(screen.queryByText(/Verified on/)).toBeNull();
  });

  it('shows open or closed on the settlement page', async () => {
    await render(<SettlementBadges lawsuit={lawsuit()} variant="detail" now={NOW} />);
    expect(screen.getByText(shared.openForClaims.text)).toBeOnTheScreen();
    await render(<SettlementBadges lawsuit={lawsuit({ status: 'closed' })} variant="detail" now={NOW} />);
    expect(screen.getByText(shared.claimsClosed.text)).toBeOnTheScreen();
    expect(screen.queryByText('12 days left')).toBeNull();
  });

  it('replaces the category with a status badge, but never with a score', async () => {
    await render(<SettlementBadges lawsuit={lawsuit()} badge={{ label: 'Reported filed by you' }} now={NOW} />);
    expect(screen.getByText('Reported filed by you')).toBeOnTheScreen();
    await render(<SettlementBadges lawsuit={lawsuit()} badge={{ label: '92% match' }} now={NOW} />);
    expect(screen.queryByText('92% match')).toBeNull();
    expect(screen.getByText('Data breach')).toBeOnTheScreen();
  });
});

describe('ClaimStatusBadge and DeadlineText', () => {
  it('shows the status label it is given', async () => {
    await render(<ClaimStatusBadge label="Not filed yet" tone="amber" />);
    expect(screen.getByText('Not filed yet')).toBeOnTheScreen();
  });

  it('reads the deadline and its countdown as one phrase', async () => {
    await render(<DeadlineText deadline="2026-11-14" now={NOW} testID="deadline" />);
    expect(screen.getByText('Nov 14, 2026')).toBeOnTheScreen();
    expect(screen.getByText('12 days left')).toBeOnTheScreen();
    expect(screen.getByTestId('deadline')).toHaveAccessibleName('Nov 14, 2026, 12 days left');
  });

  it('says when the deadline passed, and what to do without one', async () => {
    await render(<DeadlineText deadline="2026-10-01" now={NOW} />);
    expect(screen.getByText('Deadline passed')).toBeOnTheScreen();
    await render(<DeadlineText deadline={null} now={NOW} />);
    expect(screen.getByText(shared.noDeadlineListed.text)).toBeOnTheScreen();
  });
});

describe('Unverified', () => {
  it('shows the catalog notice', async () => {
    await render(<UnverifiedNotice variant="catalog" />);
    expect(screen.getByText(common.unverifiedLabel.text)).toBeOnTheScreen();
    expect(screen.getByText(common.unverifiedNoticeBody.text)).toBeOnTheScreen();
  });

  it('links the settlement notice to the official site by host', async () => {
    const user = userEvent.setup();
    await render(<UnverifiedNotice variant="settlement" lawsuit={lawsuit()} open />);
    expect(screen.getByText(shared.unverifiedOpenBody.text)).toBeOnTheScreen();
    const link = screen.getByRole('link', { name: 'Go to the official site (acmesettlement.com)' });
    await user.press(link);
    expect(openExternalUrl).toHaveBeenCalledWith('https://www.acmesettlement.com/claim');
  });

  it('labels a source page as not the official site, and says so when there is no link', async () => {
    await render(
      <UnverifiedNotice
        variant="settlement"
        lawsuit={lawsuit({ claim_url: null, source_url: 'https://settlesignal.com/s/acme' })}
        open={false}
      />,
    );
    expect(screen.getByText(shared.unverifiedClosedBody.text)).toBeOnTheScreen();
    expect(screen.getByText(shared.sourceLinkIntro.text)).toBeOnTheScreen();
    expect(
      screen.getByRole('link', { name: 'SettleSignal listing (settlesignal.com, not the official site)' }),
    ).toBeOnTheScreen();

    await render(<UnverifiedNotice variant="settlement" lawsuit={lawsuit({ claim_url: null })} open />);
    expect(screen.getByText(shared.noOfficialLink.text)).toBeOnTheScreen();
  });

  it('shows the card line with a link named for the settlement', async () => {
    await render(<UnverifiedLine lawsuit={lawsuit()} />);
    expect(screen.getByText(shared.unverifiedLineLabel.text)).toBeOnTheScreen();
    const link = screen.getByRole('link', { name: 'Official site for Acme Data Breach' });
    expect(link).toHaveProp('accessibilityHint', common.opensInBrowserHint.text);
    expect(screen.getByText('Official site')).toBeOnTheScreen();
  });

  it('says it has no link yet, and hides itself for a verified row', async () => {
    await render(<UnverifiedLine lawsuit={lawsuit({ claim_url: null })} />);
    expect(screen.getByText(shared.noLinkYet.text)).toBeOnTheScreen();

    mockConfig.flags = { VERIFIED_FIELDS_ENABLED: true };
    await render(<UnverifiedLine lawsuit={lawsuit(verified)} testID="line" />);
    expect(screen.queryByTestId('line')).toBeNull();
    await render(<UnverifiedNotice variant="settlement" lawsuit={lawsuit(verified)} open testID="notice" />);
    expect(screen.queryByTestId('notice')).toBeNull();
  });

  it('shows the pill', async () => {
    await render(<UnverifiedBadge />);
    expect(screen.getByText(common.unverifiedLabel.text)).toBeOnTheScreen();
  });
});

describe('disclaimers', () => {
  it('shows the short and the full text from the config', async () => {
    await render(
      <>
        <ShortDisclaimer />
        <LegalDisclaimer />
      </>,
    );
    expect(screen.getByText('Short disclaimer text.')).toBeOnTheScreen();
    expect(screen.getByText('Full legal disclaimer text.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: shared.legalDisclaimerTitle.text })).toBeOnTheScreen();
  });

  it('shows four lines of the compact disclaimer until "Show all"', async () => {
    const user = userEvent.setup();
    await render(<CompactDisclaimer />);
    expect(screen.getByText('Full legal disclaimer text.')).toHaveProp('numberOfLines', 4);

    await user.press(screen.getByRole('button', { name: shared.showAll.text }));
    expect(screen.getByText('Full legal disclaimer text.')).not.toHaveProp('numberOfLines');
    expect(screen.queryByRole('button', { name: shared.showAll.text })).toBeNull();
  });
});

describe('SettleSignalCredit', () => {
  it('credits SettleSignal under the catalog with both links', async () => {
    const user = userEvent.setup();
    await render(<SettleSignalCredit />);
    expect(
      screen.getByText(
        'Listings from SettleSignal are adapted from SettleSignal (settlesignal.com) under CC BY 4.0. ClaimMatch may have shortened or reformatted them.',
      ),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('link', { name: 'SettleSignal (settlesignal.com)' }));
    expect(openExternalUrl).toHaveBeenLastCalledWith(SETTLESIGNAL_URL);
    await user.press(screen.getByRole('link', { name: 'CC BY 4.0' }));
    expect(openExternalUrl).toHaveBeenLastCalledWith(CC_BY_4_URL);
  });

  it('uses the footer wording on the Legal screen', async () => {
    const user = userEvent.setup();
    await render(<SettleSignalCredit variant="footer" />);
    expect(
      screen.getByText(
        'Settlement listings include data from SettleSignal, used under the CC BY 4.0 license. We reformat it, and we have not verified each listing. Always check the official settlement website.',
      ),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('link', { name: 'SettleSignal' }));
    expect(openExternalUrl).toHaveBeenLastCalledWith(SETTLESIGNAL_DATA_URL);
    expect(screen.getByRole('link', { name: 'CC BY 4.0 license' })).toBeOnTheScreen();
  });
});

describe('SignedOutPrompt', () => {
  async function renderPrompt(next?: string | null) {
    await render(<SignedOutPrompt next={next} />);
  }

  it('welcomes back and opens log in and sign-up with the checked next path', async () => {
    const user = userEvent.setup();
    await renderPrompt('/dashboard');
    expect(screen.getByRole('header', { name: shared.welcomeBack.text })).toBeOnTheScreen();
    expect(screen.getByText(shared.logInToSeeClaims.text)).toBeOnTheScreen();
    expect(screen.queryByText(common.loggedOut.text)).toBeNull();

    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/login', params: { next: '/dashboard' } });
    await user.press(screen.getByRole('button', { name: shared.createFreeAccount.text }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/signup', params: { next: '/dashboard' } });
  });

  it('says "You were logged out." above the prompt when the session ended under the person', async () => {
    await render(<SignedOutPrompt next="/dashboard" loggedOut />);
    expect(screen.getByText(common.loggedOut.text)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: shared.welcomeBack.text })).toBeOnTheScreen();
  });

  it('uses the claim wording for a claim', async () => {
    await renderPrompt('/claim/acme-data-breach');
    expect(screen.getByRole('header', { name: shared.claimLoginTitle.text })).toBeOnTheScreen();
    expect(screen.getByText(shared.claimLoginBody.text)).toBeOnTheScreen();
  });

  it('drops a next path that could leave the app', async () => {
    const user = userEvent.setup();
    await renderPrompt('https://evil.example/claim/x');
    expect(screen.getByRole('header', { name: shared.welcomeBack.text })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockPush).toHaveBeenLastCalledWith('/login');
  });
});
