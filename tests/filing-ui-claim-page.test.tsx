import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimFilingView, LaneView } from '@/lib/filing/v2/contract';

// The claim page with one-click filing: the real page, loaders and ClaimFlow
// run; Supabase, the settlement lookups and B2's view loaders are fake.

const h = vi.hoisted(() => ({
  settlement: null as Record<string, unknown> | null,
  lawsuit: null as Record<string, unknown> | null,
  claimRow: null as Record<string, unknown> | null,
  profileRow: null as Record<string, unknown> | null,
  amr: [] as unknown[],
  reads: [] as string[],
  loadView: vi.fn(),
  preview: vi.fn(),
  lookups: [] as string[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/claim/widget-settlement',
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-a', email: 'ada@example.com' } } }),
      getClaims: async () => ({ data: { claims: { sub: 'user-a', amr: h.amr } }, error: null }),
    },
    from: (table: string) => {
      h.reads.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === 'claims' ? h.claimRow : h.profileRow, error: null }),
      };
      return chain;
    },
  }),
  createServiceClient: () => {
    throw new Error('not used: settlements and filing views are faked');
  },
}));

vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return { ...actual, loadSettlementBySlug: async () => ({ ok: true, settlement: h.settlement }), logClaimsError: () => undefined };
});

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupLawsuitBySlug: async (slug: string) => {
      h.lookups.push(slug);
      return h.lawsuit ? { status: 'found', lawsuit: h.lawsuit } : { status: 'missing' };
    },
  };
});

vi.mock('@/lib/filing/v2/view', () => ({
  loadClaimFilingView: h.loadView,
  previewLanes: h.preview,
  listClaimFilingSummaries: vi.fn(),
}));

import ClaimPage from '@/app/claim/[slug]/page';
import { ClaimFlow, type ClaimFlowSettlement } from '@/components/claims/ClaimFlow';
import { settlementContext, type ClaimView } from '@/lib/claims';
import {
  ONE_CLICK_AGENT_NOTE,
  ONE_CLICK_AGENT_TITLE,
  ONE_CLICK_COPY,
  ONE_CLICK_LANE_REASONS,
  ONE_CLICK_SELF_FILE_NOTE,
} from '@/lib/copy';
import { CLAIM_ID, DESK_LANE, LAWSUIT_ID, SELF_FILE_LANE, filingView, readyView } from './filing-ui-fixtures';

const NOW = new Date('2026-11-12T15:00:00Z');
const OFFICIAL = 'https://www.widget-admin.com/claim';
const LEGACY_NOTE = 'Lawsuit AI doesn’t file claims for you';
const escape = (s: string) => s.replace(/&/g, '&amp;');

function settlementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LAWSUIT_ID,
    slug: 'widget-settlement',
    title: 'Widget settlement',
    category: 'Consumer',
    status: 'open',
    review_status: 'published',
    deadline: '2026-12-15',
    claim_url: OFFICIAL,
    source_url: null,
    eligibility_text: 'People who bought a Widget.',
    eligibility: null,
    proof_required: null,
    ...overrides,
  };
}

const STRONG = { requires: ['had_data_breach'] };
const STATE_ONLY = { states: ['CA'] };

function lawsuitRow(eligibility: Record<string, unknown>) {
  return { ...settlementRow(), eligibility, tags: null, summary: null, description: null, typical_payout: null };
}

function claimRow(status: string) {
  return {
    id: CLAIM_ID,
    lawsuit_id: LAWSUIT_ID,
    status,
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: '2026-11-01T00:00:00Z',
  };
}

const render = async () => renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ slug: 'widget-settlement' }) }));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  h.settlement = settlementRow();
  h.lawsuit = lawsuitRow(STRONG);
  h.claimRow = null;
  h.profileRow = { full_name: 'Ada Lovelace', email: 'ada@example.com', state: 'CA', attributes: { had_data_breach: true }, onboarded: true };
  h.amr = [{ method: 'password', timestamp: Math.floor(NOW.getTime() / 1000) - 60 }];
  h.reads = [];
  h.lookups = [];
  h.loadView.mockReset();
  h.preview.mockReset();
  h.preview.mockResolvedValue(new Map<string, LaneView>([[LAWSUIT_ID, DESK_LANE]]));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the claim page with the flag off', () => {
  it('is exactly the self-file page and reads nothing new', async () => {
    const html = await render();
    expect(html).toContain('Open the official claim form');
    expect(html).toContain('File on the official site');
    expect(html).toContain(LEGACY_NOTE);
    expect(html).not.toContain(ONE_CLICK_AGENT_TITLE);
    expect(h.loadView).not.toHaveBeenCalled();
    expect(h.preview).not.toHaveBeenCalled();
    expect(h.lookups).toEqual([]);
  });
});

describe('the claim page with the flag on', () => {
  beforeEach(() => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  });

  it('a strong match on an agent lane gets the one-click entry above the self-file steps', async () => {
    const html = await render();
    expect(html).toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).toContain(ONE_CLICK_COPY.entry.start);
    expect(html).toContain(escape(ONE_CLICK_AGENT_NOTE));
    // The self-file path stays, as "Finish on the official site".
    expect(html).toContain('Finish on the official site');
    expect(html).toContain('Open the official claim form');
    expect(html.indexOf(ONE_CLICK_COPY.entry.start)).toBeLessThan(html.indexOf('Open the official claim form'));
    expect(h.preview).toHaveBeenCalledWith({ userId: 'user-a', lawsuitIds: [LAWSUIT_ID], now: NOW });
    expect(h.loadView).not.toHaveBeenCalled();
  });

  it('a possible (state-only) match never gets it, and its lane is not even looked up', async () => {
    h.lawsuit = lawsuitRow(STATE_ONLY);
    const html = await render();
    expect(html).not.toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).not.toContain(ONE_CLICK_COPY.entry.start);
    expect(html).toContain(escape(ONE_CLICK_SELF_FILE_NOTE));
    expect(html).toContain('Finish on the official site');
    expect(h.preview).not.toHaveBeenCalled();
  });

  it('a profile that does not meet the rules gets the self-file steps', async () => {
    h.profileRow = { ...h.profileRow, attributes: {} };
    const html = await render();
    expect(html).not.toContain(ONE_CLICK_COPY.entry.start);
    expect(h.preview).not.toHaveBeenCalled();
  });

  it('a strong match on the self-file lane says why Lawsuit AI can’t file it', async () => {
    h.preview.mockResolvedValue(new Map([[LAWSUIT_ID, SELF_FILE_LANE]]));
    const html = await render();
    expect(html).not.toContain(ONE_CLICK_COPY.entry.start);
    expect(html).toContain(ONE_CLICK_LANE_REASONS.not_offered_for_settlement);
    expect(html).toContain(escape(ONE_CLICK_SELF_FILE_NOTE));
  });

  it('falls back to the self-file steps when the lane can’t be read', async () => {
    h.preview.mockRejectedValue(new Error('down'));
    const html = await render();
    expect(html).not.toContain(ONE_CLICK_COPY.entry.start);
    expect(html).toContain('Open the official claim form');
  });

  it('a claim being prepared shows the one-click steps with a fresh sign-in read from the session', async () => {
    h.claimRow = claimRow('preparing');
    h.loadView.mockResolvedValue({ ok: true, view: filingView() });
    const html = await render();
    expect(h.loadView).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', claimId: CLAIM_ID, now: NOW, freshSignIn: true }));
    expect(html).toContain('Preparing your claim');
    expect(html).toContain('Confirm this describes you');
    expect(html).toContain('What we still need');
    expect(html).not.toContain('Open the official claim form');
    expect(html).not.toContain(ONE_CLICK_COPY.entry.start);
  });

  it('an email sign-in link never counts as a fresh sign-in', async () => {
    h.claimRow = claimRow('ready');
    h.amr = [{ method: 'magiclink', timestamp: Math.floor(NOW.getTime() / 1000) }];
    h.loadView.mockResolvedValue({ ok: true, view: readyView({ actions: { needs_fresh_sign_in: true } }) });
    const html = await render();
    expect(h.loadView).toHaveBeenCalledWith(expect.objectContaining({ freshSignIn: false }));
    expect(html).toContain(ONE_CLICK_COPY.reauth.title);
  });

  it('says so when a one-click claim’s view can’t be read', async () => {
    h.claimRow = claimRow('queued');
    h.loadView.mockResolvedValue({ ok: false, code: 'service_unavailable' });
    const html = await render();
    expect(html).toContain(escape(ONE_CLICK_COPY.loadFailed));
    expect(html).not.toContain('Open the official claim form');
  });

  it('a saved self-file claim on a strong match can start one-click once its settlement has an agent lane', async () => {
    h.claimRow = claimRow('self_file');
    h.loadView.mockResolvedValue({ ok: true, view: filingView({ status: 'self_file', packet: null, timeline: [] }) });
    const html = await render();
    expect(html).toContain(ONE_CLICK_COPY.entry.start);
    expect(h.preview).not.toHaveBeenCalled();
  });
});

describe('ClaimFlow with one-click data', () => {
  const SETTLEMENT: ClaimFlowSettlement = {
    id: LAWSUIT_ID,
    slug: 'widget-settlement',
    title: 'Widget settlement',
    deadline: '2026-12-15',
    officialUrl: OFFICIAL,
    sourceUrl: null,
    sourceHost: null,
    eligibility: null,
    proof: 'unknown',
    assistedFilingAllowed: true,
  };
  const context = settlementContext({ slug: 'widget-settlement', status: 'open', review_status: 'published', deadline: '2026-12-15' }, NOW, () => false);
  const claim = (status: string): ClaimView => ({ ...claimRow(status), lawsuit_title: 'Widget settlement' }) as ClaimView;
  const flow = (oneClick: Parameters<typeof ClaimFlow>[0]['oneClick'], initialClaim: ClaimView | null = null) =>
    renderToStaticMarkup(createElement(ClaimFlow, { settlement: SETTLEMENT, context, initialClaim, nowIso: NOW.toISOString(), oneClick }));
  const base = { view: null, lane: null, canStart: false, loadFailed: false, accountEmail: 'ada@example.com' };

  it('without one-click data it is the page as before, retired assisted filing included', () => {
    const html = flow(null);
    expect(html).toContain('id="authorize"');
    expect(html).toContain(LEGACY_NOTE);
  });

  it('with one-click on, the retired assisted-filing form never shows', () => {
    for (const oneClick of [base, { ...base, lane: DESK_LANE, canStart: true }]) {
      const html = flow(oneClick);
      expect(html).not.toContain('id="authorize"');
      expect(html).not.toContain('We’ll file it for you');
      expect(html).not.toContain('Copy details and file yourself');
    }
  });

  it('a claim handed back to self-file shows its prepared answers and its history', () => {
    const view: ClaimFilingView = readyView({
      status: 'self_file',
      lane: SELF_FILE_LANE,
      timeline: [
        { at: '2026-11-12T14:00:00Z', status: 'preparing', from: null, actor: 'you', action: 'start', confirmation_number: null },
        { at: '2026-11-13T14:00:00Z', status: 'self_file', from: 'queued', actor: 'claimmatch', action: 'hand_back', confirmation_number: null },
      ],
    });
    const html = flow({ ...base, view, lane: SELF_FILE_LANE }, claim('self_file'));
    expect(html).toContain(ONE_CLICK_COPY.prepared.title);
    expect(html).toContain('Moved to finish on the official site');
    expect(html).toContain('Open the official claim form');
    expect(html).toContain(ONE_CLICK_LANE_REASONS.not_offered_for_settlement);
  });

  it('a signed claim shows its status card, not the self-file steps', () => {
    const view = filingView({ status: 'queued', packet: { status: 'signed' }, actions: { can_edit: false, can_reopen: true } });
    const html = flow({ ...base, view, lane: DESK_LANE }, claim('queued'));
    expect(html).toContain('In line to be filed');
    expect(html).toContain(ONE_CLICK_COPY.actions.reopen);
    expect(html).not.toContain('Open the official claim form');
    expect(html).not.toContain('Tell us when you’ve filed');
  });
});
