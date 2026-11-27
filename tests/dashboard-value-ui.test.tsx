import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ValueSummary } from '@/components/dashboard/ValueSummary';
import { DASHBOARD_VALUE_COPY } from '@/lib/copy';
import { buildDashboardValue, type DashboardValueInput } from '@/lib/dashboard-value';
import { OWED_ESTIMATE_ASSUMPTION } from '@/lib/owed-estimate';

const NOW = new Date('2026-11-27T12:00:00.000Z');

const BASE: DashboardValueInput = {
  matches: [],
  claims: [],
  payouts: [],
  membership: null,
  now: NOW,
};

/** Renders the panel the way the dashboard does: only when the model says to. */
function render(input: Partial<DashboardValueInput> = {}): string {
  const value = buildDashboardValue({ ...BASE, ...input });
  if (!value) return '';
  return renderToStaticMarkup(createElement(ValueSummary, { value }));
}

describe('the dashboard value panel', () => {
  it('renders nothing at all when there is nothing on file', () => {
    expect(render()).toBe('');
    expect(render({ matches: [{ payoutMin: null, payoutMax: null }] })).toBe('');
  });

  it('shows the count and an explanation instead of "$0" when no amount was reported', () => {
    const html = render({ payouts: [{ gross_amount: 0 }, { gross_amount: 0 }] });
    expect(html).toContain('data-testid="dashboard-value"');
    expect(html).toContain(DASHBOARD_VALUE_COPY.payoutCountLabel);
    expect(html).toContain('>2</p>');
    expect(html).toContain(DASHBOARD_VALUE_COPY.payoutNoAmount);
    // The honest empty state, never a zero that reads as a loss.
    expect(html).not.toContain('$0');
  });

  it('keeps the payout count and the payout total in two separate tiles', () => {
    const html = render({ payouts: [{ gross_amount: 60 }, { gross_amount: 40 }] });
    expect(html).toContain(DASHBOARD_VALUE_COPY.payoutCountLabel);
    expect(html).toContain(DASHBOARD_VALUE_COPY.payoutTotalLabel);
    const countAt = html.indexOf(DASHBOARD_VALUE_COPY.payoutCountLabel);
    const totalAt = html.indexOf(DASHBOARD_VALUE_COPY.payoutTotalLabel);
    expect(countAt).toBeGreaterThan(-1);
    expect(totalAt).toBeGreaterThan(countAt);
    // Two <dt> labels, so the two facts are never one headline figure.
    expect(html).toContain('>2</p>');
    expect(html).toContain('$100');
  });

  it('labels the potential figure an estimate and prints its assumption', () => {
    const html = render({ matches: [{ payoutMin: 100, payoutMax: 300 }] });
    expect(html).toContain(DASHBOARD_VALUE_COPY.potentialLabel);
    expect(html).toContain(`${DASHBOARD_VALUE_COPY.potentialPrefix} $100`);
    expect(html).toContain(OWED_ESTIMATE_ASSUMPTION);
    // Nothing was received, so no actual-earnings tile appears.
    expect(html).not.toContain(DASHBOARD_VALUE_COPY.payoutTotalLabel);
    expect(html).not.toContain(DASHBOARD_VALUE_COPY.payoutCountLabel);
  });

  it('prints the time-saved assumption next to the figure', () => {
    const html = render({ claims: [{ id: 'c1', status: 'reported_filed' }] });
    expect(html).toContain(DASHBOARD_VALUE_COPY.timeSavedLabel);
    expect(html).toContain('20 minutes');
    expect(html).toContain('Assumes 20 minutes per claim');
    expect(html).toContain(DASHBOARD_VALUE_COPY.submittedLabel);
  });

  it('always prints the membership-cost assumption, with the list price and the months', () => {
    const html = render({
      payouts: [{ gross_amount: 100 }],
      membership: { trialEnd: '2026-09-20T00:00:00Z' },
    });
    expect(html).toContain(DASHBOARD_VALUE_COPY.comparisonLabel);
    expect(html).toContain('$19.99 a month');
    expect(html).toContain('3 months subscribed');
    expect(html).toContain('monthly list price');
  });

  it('says the comparison came from potential ranges when no amount was received', () => {
    const html = render({
      matches: [{ payoutMin: 100, payoutMax: 300 }],
      membership: { trialEnd: '2026-10-20T00:00:00Z' },
    });
    expect(html).toContain(DASHBOARD_VALUE_COPY.comparisonPotentialNote);
    expect(html).not.toContain(DASHBOARD_VALUE_COPY.comparisonActualNote);
  });

  it('explains the trial instead of showing a multiple of nothing', () => {
    const html = render({
      payouts: [{ gross_amount: 100 }],
      membership: { createdAt: '2026-11-24T00:00:00Z', trialEnd: '2026-12-01T00:00:00Z' },
    });
    expect(html).toContain(DASHBOARD_VALUE_COPY.comparisonInTrial);
  });

  it('never implies a payout is owed, expected, or guaranteed', () => {
    const html = render({
      matches: [{ payoutMin: 100, payoutMax: 300 }],
      payouts: [{ gross_amount: 100 }],
      claims: [{ id: 'c1', status: 'filed_by_claimmatch' }],
      membership: { trialEnd: '2026-10-20T00:00:00Z' },
    });
    // OWED_ESTIMATE_ASSUMPTION's own "not a prediction of what you will
    // receive" is the disclaimer, so it is excluded before the scan.
    const scanned = html.split(OWED_ESTIMATE_ASSUMPTION).join(' ');
    expect(scanned).not.toMatch(/owed|guarantee|you will (?:receive|get)|expected payout/i);
    // Potential is named as potential; actual is attributed to the member.
    expect(html).toContain(DASHBOARD_VALUE_COPY.potentialLabel);
    expect(html).toContain('you told us you received');
  });
});
