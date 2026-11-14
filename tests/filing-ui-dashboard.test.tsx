import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimFilingSummary, LaneView } from '@/lib/filing/v2/contract';

// The dashboard with one-click filing: the real page and its one-click loader
// run; the dashboard data and B2's view loaders are fake.

const h = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  summaries: vi.fn(),
  preview: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/dashboard',
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) } }),
  createServiceClient: () => {
    throw new Error('not used');
  },
}));

vi.mock('@/lib/dashboard-server', () => ({ loadDashboardData: async () => h.data }));

vi.mock('@/lib/filing/v2/view', () => ({
  loadClaimFilingView: vi.fn(),
  listClaimFilingSummaries: h.summaries,
  previewLanes: h.preview,
}));

import DashboardPage from '@/app/dashboard/page';
import { YourMatches } from '@/components/claims/YourMatches';
import type { DashboardMatch, DashboardRow } from '@/components/claims/dashboard-model';
import { FilingSummaryList } from '@/components/filing/FilingSummaryList';
import { ONE_CLICK_AGENT_TITLE, ONE_CLICK_COPY, ONE_CLICK_FILED_LABEL } from '@/lib/copy';
import { DESK_LANE, SELF_FILE_LANE } from './filing-ui-fixtures';

const STRONG_ID = '00000000-0000-4000-8000-0000000000a1';
const POSSIBLE_ID = '00000000-0000-4000-8000-0000000000a2';
const SELF_ID = '00000000-0000-4000-8000-0000000000a3';

function match(id: string, slug: string, strength: 'strong' | 'possible'): DashboardMatch {
  return {
    id,
    slug,
    title: `Settlement ${slug}`,
    deadlineText: 'Deadline Dec 15, 2026',
    reasons: [],
    strength,
    label: strength === 'strong' ? 'Strong match' : 'Possible match',
    officialUrl: null,
    score: 1,
  };
}

const MATCHES = [match(STRONG_ID, 'strong-one', 'strong'), match(SELF_ID, 'strong-self', 'strong'), match(POSSIBLE_ID, 'possible-one', 'possible')];
const LANES: Record<string, LaneView> = { [STRONG_ID]: DESK_LANE, [SELF_ID]: SELF_FILE_LANE, [POSSIBLE_ID]: DESK_LANE };

function summary(claimId: string, status: string, o: Partial<ClaimFilingSummary> = {}): ClaimFilingSummary {
  return {
    claim_id: claimId,
    lawsuit_id: STRONG_ID,
    slug: `claim-${status}`,
    title: `Claim ${status}`,
    status,
    lane: 'filing_desk',
    agent: true,
    deadline: '2026-12-15',
    confirmation_number: null,
    needs_action: status === 'ready' || status === 'needs_you',
    updated_at: '2026-11-12T15:00:00Z',
    ...o,
  };
}

describe('match cards', () => {
  const cards = (lanes: Record<string, LaneView> | null, fileForYou = false) =>
    renderToStaticMarkup(createElement(YourMatches, { items: MATCHES, oneClickLanes: lanes, fileForYou }));

  it('offer "Lawsuit AI files this claim for you" only on a strong match with an agent lane', () => {
    const html = cards(LANES);
    expect(html).toContain(`href="/claim/strong-one#one-click"`);
    expect(html).toContain(`aria-label="${ONE_CLICK_AGENT_TITLE}: Settlement strong-one"`);
    expect(html.split(ONE_CLICK_AGENT_TITLE).length - 1).toBe(2); // the label and the link text, once
    // A strong match on the self-file lane, and a possible match even on an agent lane: "How to file".
    expect(html).toContain('aria-label="How to file: Settlement strong-self"');
    expect(html).toContain('aria-label="How to file: Settlement possible-one"');
    expect(html).not.toContain('possible-one#one-click');
  });

  it('stay as before without lanes', () => {
    const html = cards(null);
    expect(html).not.toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).not.toContain('#one-click');
  });
});

describe('filing status on the dashboard', () => {
  it('counts ready claims and lists one-click claims only', () => {
    const html = renderToStaticMarkup(
      createElement(FilingSummaryList, {
        items: [
          summary('c1', 'ready'),
          summary('c2', 'ready'),
          summary('c3', 'filed_by_claimmatch'),
          summary('c4', 'needs_you'),
          summary('c5', 'self_file', { agent: false, lane: 'self_file' }),
        ],
      }),
    );
    expect(html).toContain(ONE_CLICK_COPY.dashboard.title);
    expect(html).toMatch(new RegExp(`${ONE_CLICK_COPY.dashboard.ready}</dt><dd[^>]*>2</dd>`));
    expect(html).toMatch(/Need your attention<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toContain(ONE_CLICK_FILED_LABEL);
    expect(html).toContain('href="/claim/claim-ready#one-click"');
    expect(html).not.toContain('Claim self_file');
  });

  it('shows an error when the list can’t be read, and nothing when there are no one-click claims', () => {
    expect(renderToStaticMarkup(createElement(FilingSummaryList, { items: null }))).toContain(ONE_CLICK_COPY.dashboard.failed);
    expect(renderToStaticMarkup(createElement(FilingSummaryList, { items: [summary('c5', 'self_file')] }))).toBe('');
  });
});

describe('the dashboard page', () => {
  const row = (claimId: string, title: string): DashboardRow => ({
    claimId,
    title,
    label: 'Not filed yet',
    tone: 'amber',
    group: 'needs_filing',
    deadlineText: 'Deadline Dec 15, 2026',
    nextStep: 'File on the official site.',
    action: null,
  });
  const claimItem = (id: string, status: string) => ({ claim: { id, status, lawsuit_id: STRONG_ID }, settlement: null });

  beforeEach(() => {
    h.data = {
      profile: { onboarded: true },
      claims: { items: [claimItem('self-1', 'self_file'), claimItem('agent-1', 'queued')], failed: false },
      catalog: { lawsuits: [], error: false },
      filingJobs: [],
      rows: [row('self-1', 'Tracked self-file'), row('agent-1', 'Tracked one-click')],
      notices: [],
      closingSoon: [],
      matchProfile: { state: 'CA', attributes: {}, onboarded: true, facts: [] },
      matches: MATCHES,
      needsProfile: false,
      firstName: 'Ada',
    };
    h.summaries.mockReset();
    h.preview.mockReset();
    h.summaries.mockResolvedValue({ ok: true, items: [summary('agent-1', 'queued', { title: 'Tracked one-click' }), summary('r', 'ready')] });
    h.preview.mockResolvedValue(new Map(Object.entries(LANES)));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const render = async (searchParams: Record<string, string> = {}) =>
    renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve(searchParams) }));

  it('flag off: unchanged, and nothing new is read', async () => {
    const html = await render({ welcome: '1' });
    expect(html).toContain('It doesn’t file for you and never handles settlement payments.');
    expect(html).toContain('It’s free, and you do it yourself.');
    expect(html).not.toContain(ONE_CLICK_COPY.dashboard.title);
    expect(html).not.toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).toContain('Tracked one-click');
    expect(h.summaries).not.toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
  });

  it('flag on: filing status with the ready count, one-click claims moved out of "Your claims", lanes for strong matches only', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    const html = await render({ welcome: '1' });
    expect(html).toContain(ONE_CLICK_COPY.dashboardIntro);
    expect(html).not.toContain('It doesn’t file for you');
    expect(html).toContain(ONE_CLICK_COPY.welcomeSteps[2]);
    expect(html).toContain(ONE_CLICK_COPY.dashboard.title);
    expect(html).toMatch(new RegExp(`${ONE_CLICK_COPY.dashboard.ready}</dt><dd[^>]*>1</dd>`));
    expect(html).toContain('href="/claim/strong-one#one-click"');
    expect(h.preview).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', lawsuitIds: [STRONG_ID, SELF_ID] }));
    // "Your claims" keeps the self-file claim; the one-click claim shows under Filing status.
    const yourClaims = html.slice(html.indexOf('id="your-claims-title"'));
    expect(yourClaims).toContain('Tracked self-file');
    expect(yourClaims).not.toContain('Tracked one-click');
    expect(html.slice(0, html.indexOf('id="your-claims-title"'))).toContain('Tracked one-click');
  });

  it('flag on: a failed filing list shows an error and the rest of the dashboard stays', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    h.summaries.mockRejectedValue(new Error('down'));
    h.preview.mockRejectedValue(new Error('down'));
    const html = await render();
    expect(html).toContain(ONE_CLICK_COPY.dashboard.failed);
    expect(html).toContain('Tracked self-file');
    // No claim disappears: the one-click one stays under "Your claims".
    expect(html.slice(html.indexOf('id="your-claims-title"'))).toContain('Tracked one-click');
    expect(html).not.toContain('#one-click"');
  });
});
