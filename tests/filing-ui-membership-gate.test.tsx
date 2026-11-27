/**
 * The Easy submit paywall (MembershipGate).
 *
 * The settlement listing's own stated payout sits beside the membership price
 * when the listing states one. When it does not, the gate must render exactly
 * what it rendered before the payout was plumbed through: no placeholder, no
 * "not stated", no invented or rounded figure.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { listedPayoutBesidePriceCopy, membershipCopy, startTrialCtaLabel } from '@/lib/copy';
import { statedPayoutLabel } from '@/lib/owed-estimate';
import { MembershipGate } from '@/components/filing/MembershipGate';

const render = (payoutLabel?: string | null) =>
  renderToStaticMarkup(
    createElement(MembershipGate, { returnTo: '/claim/acme-settlement', payoutLabel }),
  );

/** Visible text with tags dropped and the entities these checks care about decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ');

describe('Easy submit paywall payout', () => {
  it('shows the listing’s own payout beside the price, with a not-a-prediction qualifier', () => {
    const label = statedPayoutLabel({ payoutMin: 25, payoutMax: 75 });
    expect(label).toBe('$25–$75');
    const body = text(render(label));
    expect(body).toContain(listedPayoutBesidePriceCopy('$25–$75'));
    // The figure sits beside the price sentence, not instead of it.
    expect(body).toContain('$25–$75');
    expect(body).toContain(membershipCopy());
    expect(body).toMatch(/not a prediction of what you will receive/);
    // The payout line comes before the price line.
    expect(body.indexOf('$25–$75')).toBeLessThan(body.indexOf(membershipCopy()));
  });

  it('renders the price line alone when the listing states no payout', () => {
    expect(statedPayoutLabel({ payoutMin: null, payoutMax: null })).toBeNull();
    const nullLabel = render(null);
    // Byte-identical to the gate with no payoutLabel prop at all.
    expect(nullLabel).toBe(render(undefined));
    const body = text(nullLabel);
    expect(body).toContain(membershipCopy());
    expect(body).not.toContain('This settlement lists');
    expect(body).not.toMatch(/not stated|Estimated|per eligible person/i);
    // The only dollar figures left are the membership price sentence's own.
    expect(body).not.toMatch(/\$25|\$75/);
  });

  it('keeps the self-file escape hatch and the trial CTA either way', () => {
    for (const label of ['$40', null]) {
      const body = text(render(label));
      expect(body).toContain('You can still file on the official settlement site yourself');
      expect(body).toContain(startTrialCtaLabel());
      expect(body).toContain('Easy submit is included with membership');
    }
  });
});
