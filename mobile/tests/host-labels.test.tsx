import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { settlement } from '@/copy/settlement';
import { shared } from '@/copy/shared';
import { breakableHost, hostLabels, UnverifiedNotice, type UnverifiedSettlement } from '@/features/shared';
import { AnswerBlock } from '@/features/settlement/AnswerBlock';

jest.mock('@/providers/ConfigProvider', () => ({ useConfig: () => ({ isFlagOn: () => false }) }));

/**
 * A host in a button or link label: "Official claim site
 * (personalcareproductssettlement.com)" broke the host mid-word on an iPhone
 * 17 at the default text size. The visible text gets a zero-width space
 * after each dot, where it may wrap; what screen readers announce does not.
 */

const ZWSP = '​';
const HOST = 'personalcareproductssettlement.com';
const OFFICIAL = { href: 'https://www.personalcareproductssettlement.com/', kind: 'official', label: 'Official site', host: HOST } as const;
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
  it('lets a host wrap after each dot without showing anything there', () => {
    expect(breakableHost(HOST)).toBe(`personalcareproductssettlement.${ZWSP}com`);
    expect(breakableHost('claims.example.co.uk')).toBe(`claims.${ZWSP}example.${ZWSP}co.${ZWSP}uk`);
    expect(breakableHost('localhost')).toBe('localhost');
  });

  it('breaks only the visible label, and only inside the host', () => {
    expect(hostLabels(HOST, (host) => `Site. (${host})`)).toEqual({
      label: `Site. (personalcareproductssettlement.${ZWSP}com)`,
      accessibilityLabel: `Site. (${HOST})`,
    });
    expect(hostLabels(HOST)).toEqual({ label: breakableHost(HOST), accessibilityLabel: HOST });
  });
});

describe('labels that show a host', () => {
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

  it('wraps the unverified notice’s links at a dot too', async () => {
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
    const official = screen.getByRole('link', { name: `${shared.goToOfficialSite.text} (${HOST})` });
    expect(official).toHaveTextContent(`${shared.goToOfficialSite.text} (personalcareproductssettlement.${ZWSP}com)`);
    expect(hasZeroWidthSpace(official.props.accessibilityLabel)).toBe(false);

    await rerender(
      <UnverifiedNotice
        variant="settlement"
        lawsuit={{ ...lawsuit, claim_url: null, source_url: 'https://www.classactionnews.org/dr-squatch' }}
        open
      />,
    );
    const source = screen.getByRole('link', { name: `Source page (classactionnews.org, ${shared.notTheOfficialSite.text})` });
    expect(source).toHaveTextContent(`Source page (classactionnews.${ZWSP}org, ${shared.notTheOfficialSite.text})`);
  });
});
