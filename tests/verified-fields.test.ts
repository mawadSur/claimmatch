import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LawsuitCard } from '@/components/LawsuitCard';
import { VerifiedBadge } from '@/components/settlement/VerifiedBadge';
import {
  displayEligibilityText,
  displayProofLabel,
  hasVerifiedFieldContent,
  isVerifiedRecord,
  overlayVerifiedFacts,
  showVerifiedBadge,
  verifiedOnLabel,
} from '@/lib/verified-fields';
import { makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

const verifiedRow = {
  verified_at: '2026-10-20T12:00:00Z',
  eligibility_verified: 'People who bought the product in 2023.',
  proof_verified: 'no' as const,
  administrator: 'Example Admin Co',
  eligibility_text: 'Open to eligible US residents.',
  eligibility: { proof: 'yes' as const },
  proof_required: true,
};

describe('verified-field rules', () => {
  it('does not treat a stamp alone as verified', () => {
    expect(
      isVerifiedRecord({
        verified_at: '2026-10-20T12:00:00Z',
        eligibility_verified: '  ',
        proof_verified: null,
        administrator: null,
        eligibility_text: null,
        eligibility: {},
        proof_required: false,
      }),
    ).toBe(false);
    expect(hasVerifiedFieldContent(verifiedRow)).toBe(true);
    expect(isVerifiedRecord(verifiedRow)).toBe(true);
  });

  it('formats the public badge as "Verified on {date}"', () => {
    expect(verifiedOnLabel('2026-10-20T12:00:00Z')).toBe('Verified on Oct 20, 2026');
    expect(verifiedOnLabel(null)).toBeNull();
    expect(verifiedOnLabel('not-a-date')).toBeNull();
  });

  it('hides the public badge when the flag is off, even if the row is verified', () => {
    expect(showVerifiedBadge(verifiedRow)).toBe(false);
    const html = renderToStaticMarkup(createElement(VerifiedBadge, { lawsuit: verifiedRow }));
    expect(html).toBe('');
  });

  it('shows the badge only when the flag is on and the row is verified', () => {
    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    expect(showVerifiedBadge(verifiedRow)).toBe(true);
    const html = renderToStaticMarkup(createElement(VerifiedBadge, { lawsuit: verifiedRow }));
    expect(html).toContain('Verified on Oct 20, 2026');
    expect(html).not.toMatch(/ai verified/i);
    expect(html).not.toMatch(/unverified/i);

    expect(
      showVerifiedBadge({
        ...verifiedRow,
        verified_at: null,
      }),
    ).toBe(false);
  });

  it('prefers verified who-qualifies and proof over feed text only when the badge would show', () => {
    const feed = makeLawsuit({ proof: 'yes' }, { eligibility_text: 'Feed text about who qualifies.' });
    const row = { ...feed, ...verifiedRow };

    expect(displayEligibilityText(row)).toBe('Feed text about who qualifies.');
    expect(displayProofLabel(row)).toBe('Required');

    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    expect(displayEligibilityText(row)).toBe('People who bought the product in 2023.');
    expect(displayProofLabel(row)).toBe('Not required');

    const facts = overlayVerifiedFacts(
      { qualifies: 'Feed qualifies', proof: 'Required', administrator: 'Not listed' },
      row,
    );
    expect(facts.qualifies).toBe('People who bought the product in 2023.');
    expect(facts.proof).toBe('Not required');
    expect(facts.administrator).toBe('Example Admin Co');
  });

  it('keeps the unverified card label when the flag is off, even on a stamped row', () => {
    const lawsuit = makeLawsuit(
      { proof: 'optional' },
      {
        ...verifiedRow,
        title: 'Amazon Return Policy Settlement',
        slug: 'amazon-return-policy-settlement',
        claim_url: 'https://www.returnsettlement.com/submit-claim',
        deadline: '2099-12-01',
        status: 'open',
        review_status: 'published',
      },
    );
    const html = renderToStaticMarkup(createElement(LawsuitCard, { lawsuit }));
    expect(html).toContain('Unverified: check the official site.');
    expect(html).not.toContain('Verified on');
    expect(html).not.toContain('Closes in');
  });

  it('replaces the unverified card label with the badge when the flag is on', () => {
    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    const lawsuit = makeLawsuit(
      { proof: 'optional' },
      {
        ...verifiedRow,
        title: 'Amazon Return Policy Settlement',
        slug: 'amazon-return-policy-settlement',
        claim_url: 'https://www.returnsettlement.com/submit-claim',
        deadline: '2099-12-01',
        status: 'open',
        review_status: 'published',
      },
    );
    const html = renderToStaticMarkup(createElement(LawsuitCard, { lawsuit }));
    expect(html).toContain('Verified on Oct 20, 2026');
    expect(html).not.toContain('Unverified: check the official site.');
    expect(html).toContain('Not required');
  });
});
