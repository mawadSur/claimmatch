import { render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { settlement } from '@/copy/settlement';
import { shared } from '@/copy/shared';
import { breakableHost, hostFitsWhole, hostLabels, UnverifiedNotice, type UnverifiedSettlement } from '@/features/shared';
import { AnswerBlock } from '@/features/settlement/AnswerBlock';

jest.mock('@/providers/ConfigProvider', () => ({ useConfig: () => ({ isFlagOn: () => false }) }));

/**
 * A host in a button or link label: "Official claim site
 * (personalcareproductssettlement.com)" broke the host mid-word on an iPhone
 * 17 at the default text size. The visible text of a host too long for a
 * line gets a zero-width space after each dot, where it may wrap; a shorter
 * host stays whole, so "Official claim site (acusettlement.com)" wraps before
 * the host, not after its dot. What screen readers announce never has them.
 */

const ZWSP = '​';
const HOST = 'personalcareproductssettlement.com';
const OFFICIAL = { href: 'https://www.personalcareproductssettlement.com/', kind: 'official', label: 'Official site', host: HOST } as const;
const MEDIUM = 'acusettlement.com';
/** 25 characters: whole at the default size, too long for a line at large text sizes. */
const DEERE = 'deererepairsettlement.com';
const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };

const FACTS = {
  qualifies: 'People who bought covered Dr. Squatch products.',
  payout: 'Up to $12.50',
  deadline: 'Nov 27, 2026',
  proof: 'Not required',
  administrator: null,
  missing: ['administrator'],
};

function hasZeroWidthSpace(text: string | undefined): boolean {
  return (text ?? '').includes(ZWSP);
}

describe('breakableHost and hostLabels', () => {
  it('lets a host too long for a line wrap after each dot, without showing anything there', () => {
    expect(breakableHost(HOST)).toBe(`personalcareproductssettlement.${ZWSP}com`);
    expect(breakableHost('hkmultistateimmobilizersettlement.com')).toBe(`hkmultistateimmobilizersettlement.${ZWSP}com`);
    expect(breakableHost('claims.administrator.example.co.uk')).toBe(
      `claims.${ZWSP}administrator.${ZWSP}example.${ZWSP}co.${ZWSP}uk`,
    );
  });

  it('keeps a host that fits on a line whole: no break characters', () => {
    for (const host of [MEDIUM, 'nfculoansettlement.com', 'deererepairsettlement.com', 'claims.example.co.uk', 'localhost']) {
      expect(breakableHost(host)).toBe(host);
    }
    expect(hasZeroWidthSpace(breakableHost(MEDIUM))).toBe(false);
    // 26 characters fit beside their parentheses on a 360 pt phone's button line; 27 do not.
    expect(breakableHost(`${'a'.repeat(22)}.com`)).toBe(`${'a'.repeat(22)}.com`);
    expect(breakableHost(`${'a'.repeat(23)}.com`)).toBe(`${'a'.repeat(23)}.${ZWSP}com`);
  });

  it('breaks only the visible label, and only inside the host', () => {
    expect(hostLabels(HOST, (host) => `Site. (${host})`)).toEqual({
      label: `Site. (personalcareproductssettlement.${ZWSP}com)`,
      accessibilityLabel: `Site. (${HOST})`,
    });
    expect(hostLabels(HOST)).toEqual({ label: breakableHost(HOST), accessibilityLabel: HOST });
    expect(hostLabels(MEDIUM, (host) => `Site (${host})`)).toEqual({ label: `Site (${MEDIUM})`, accessibilityLabel: `Site (${MEDIUM})` });
  });

  it('sizes the choice to the window and the text size, up to the label’s largest multiplier', () => {
    expect(hostFitsWhole(DEERE, 402, 1)).toBe(true);
    expect(hostFitsWhole(DEERE, 402, 1.8)).toBe(false);
    expect(breakableHost(DEERE, 402, 2)).toBe(`deererepairsettlement.${ZWSP}com`);
    expect(hostLabels(DEERE, undefined, 402, 2)).toEqual({ label: `deererepairsettlement.${ZWSP}com`, accessibilityLabel: DEERE });
    // Smaller text never keeps more whole than the default size; past the label's cap nothing changes.
    expect(hostFitsWhole(HOST, 360, 0.8)).toBe(hostFitsWhole(HOST, 360, 1));
    expect(hostFitsWhole(MEDIUM, 402, 3)).toBe(hostFitsWhole(MEDIUM, 402, 1.8));
    expect(hostFitsWhole(MEDIUM, 402, 1)).toBe(true);
  });
});

describe('labels that show a host', () => {
  // A real phone: Jest's default window is 750 pt wide at 2x text, where these hosts would all fit whole.
  let dimensions: jest.SpyInstance;
  beforeEach(() => {
    dimensions = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  });
  afterEach(() => dimensions.mockRestore());

  it('wraps a medium host at a dot once a large text size leaves no room for it whole', async () => {
    dimensions.mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 2 });
    const official = { href: `https://www.${DEERE}/`, kind: 'official', label: 'Official site', host: DEERE } as const;
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AnswerBlock facts={FACTS} open official={official} onCheckIfYouQualify={jest.fn()} />
      </SafeAreaProvider>,
    );
    const site = screen.getByRole('link', { name: `${settlement.officialClaimSite.text} (${DEERE})` });
    expect(site).toHaveTextContent(`${settlement.officialClaimSite.text} (deererepairsettlement.${ZWSP}com)`);
    expect(hasZeroWidthSpace(site.props.accessibilityLabel)).toBe(false);
  });

  it('wraps "Official claim site (…)" at a dot, and announces the host as it is', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AnswerBlock facts={FACTS} open official={OFFICIAL} onCheckIfYouQualify={jest.fn()} />
      </SafeAreaProvider>,
    );
    const site = screen.getByRole('link', { name: `${settlement.officialClaimSite.text} (${HOST})` });
    expect(site).toHaveTextContent(`${settlement.officialClaimSite.text} (personalcareproductssettlement.${ZWSP}com)`);
    expect(hasZeroWidthSpace(site.props.accessibilityLabel)).toBe(false);

    // The missing-details link is the host alone.
    const missing = screen.getByRole('link', { name: HOST });
    expect(missing).toHaveTextContent(`personalcareproductssettlement.${ZWSP}com`);
    expect(hasZeroWidthSpace(missing.props.accessibilityLabel)).toBe(false);
  });

  it('shows "Official claim site (acusettlement.com)" without break characters, so it wraps before the host', async () => {
    const official = { href: 'https://www.acusettlement.com/HyundaiKia', kind: 'official', label: 'Official site', host: MEDIUM } as const;
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AnswerBlock facts={FACTS} open official={official} onCheckIfYouQualify={jest.fn()} />
      </SafeAreaProvider>,
    );
    const site = screen.getByRole('link', { name: `${settlement.officialClaimSite.text} (${MEDIUM})` });
    expect(site).toHaveTextContent(`${settlement.officialClaimSite.text} (${MEDIUM})`, { exact: true });
    expect(screen.getByRole('link', { name: MEDIUM })).toHaveTextContent(MEDIUM, { exact: true });
  });

  it('keeps a short source host whole on the unverified notice, and does not repeat an official-site button', async () => {
    const lawsuit: UnverifiedSettlement = {
      claim_url: OFFICIAL.href,
      source_url: null,
      verified_at: null,
      eligibility_verified: null,
      proof_verified: null,
      administrator: null,
      eligibility_text: null,
      eligibility: {},
      proof_required: false,
    };
    const { rerender } = await render(<UnverifiedNotice variant="settlement" lawsuit={lawsuit} open />);
    expect(screen.queryByRole('link', { name: `${shared.goToOfficialSite.text} (${HOST})` })).toBeNull();

    await rerender(
      <UnverifiedNotice
        variant="settlement"
        lawsuit={{ ...lawsuit, claim_url: null, source_url: 'https://www.classactionnews.org/dr-squatch' }}
        open
      />,
    );
    const source = screen.getByRole('link', { name: `Source page (classactionnews.org, ${shared.notTheOfficialSite.text})` });
    expect(source).toHaveTextContent(`Source page (classactionnews.org, ${shared.notTheOfficialSite.text})`, { exact: true });
  });
});
