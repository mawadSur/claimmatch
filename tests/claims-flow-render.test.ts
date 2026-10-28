import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The claim page with no claim yet: after the deadline or a closure on our
// list, people who filed can still tell us (WP:122, WP:141).

const h = vi.hoisted(() => ({
  settlement: null as Record<string, unknown> | null,
  claimRow: null as Record<string, unknown> | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/claim/real-settlement',
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: h.claimRow, error: null }),
      };
      return chain;
    },
  }),
  createServiceClient: () => {
    throw new Error('the page reads settlements through the claims-server helpers');
  },
}));

vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return {
    ...actual,
    loadSettlementBySlug: async () => ({ ok: true, settlement: h.settlement }),
    logClaimsError: () => undefined,
  };
});

import ClaimPage from '@/app/claim/[slug]/page';
import { ClaimFlow, type ClaimFlowSettlement } from '@/components/claims/ClaimFlow';
import { settlementContext, type ClaimView } from '@/lib/claims';

// 2026-10-16 18:00 UTC is 08:00 in Honolulu.
const NOW = new Date('2026-10-16T18:00:00Z');
const LAWSUIT_ID = '00000000-0000-4000-8000-0000000000d1';
const OFFICIAL = 'https://www.real-admin.com/file';

const SETTLEMENT: ClaimFlowSettlement = {
  id: LAWSUIT_ID,
  slug: 'real-settlement',
  title: 'Real settlement',
  deadline: '2026-11-30',
  officialUrl: OFFICIAL,
  sourceUrl: null,
  sourceHost: null,
  eligibility: null,
  proof: 'unknown',
};

function renderFlow(
  facts: { status?: string; deadline?: string | null },
  opts: { claim?: ClaimView | null; officialUrl?: string | null; assistedFilingAllowed?: boolean } = {},
): string {
  const deadline = facts.deadline === undefined ? '2026-11-30' : facts.deadline;
  const context = settlementContext(
    { slug: 'real-settlement', status: facts.status ?? 'open', review_status: 'published', deadline },
    NOW,
    () => false,
  );
  const settlement = {
    ...SETTLEMENT,
    deadline,
    officialUrl: opts.officialUrl === undefined ? OFFICIAL : opts.officialUrl,
    assistedFilingAllowed: opts.assistedFilingAllowed,
  };
  return renderToStaticMarkup(
    createElement(ClaimFlow, { settlement, context, initialClaim: opts.claim ?? null, nowIso: NOW.toISOString() }),
  );
}

function claim(overrides: Partial<ClaimView> = {}): ClaimView {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    lawsuit_id: LAWSUIT_ID,
    lawsuit_title: 'Real settlement',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const SAVE = 'Not yet: save to my claims';
const REPORT = 'I filed my claim';

describe('ClaimFlow without a claim', () => {
  it('offers both "I filed my claim" and saving while the settlement is open', () => {
    const html = renderFlow({});
    expect(html).toContain(REPORT);
    expect(html).toContain(SAVE);
    expect(html).toContain('Open the official claim form');
  });

  it('the day after the deadline: the deadline-passed card with the report form, no saving', () => {
    const html = renderFlow({ deadline: '2026-10-15' });
    expect(html).toContain('The deadline has passed');
    expect(html).toContain('Did you file before then? Tell us by Nov 14, 2026.');
    expect(html).toContain(REPORT);
    expect(html).not.toContain(SAVE);
    expect(html).not.toContain('Open the official claim form');
  });

  it('on day 31 there is nothing left to report', () => {
    const html = renderFlow({ deadline: '2026-09-15' });
    expect(html).toContain('The deadline has passed');
    expect(html).not.toContain('Tell us by');
    expect(html).not.toContain(REPORT);
    expect(html).toContain('a claim can no longer be reported here');
  });

  it('on a listing our list marks closed: the re-check wording (D41) and the report form', () => {
    const html = renderFlow({ status: 'closed' });
    expect(html).toContain('Our list shows this settlement as closed');
    expect(html).toContain('re-checking it');
    expect(html).toContain('to see if it still takes claims.');
    expect(html).toContain(`href="${OFFICIAL}"`);
    expect(html).toContain('Already filed? Tell us here');
    expect(html).toContain(REPORT);
    expect(html).not.toContain(SAVE);
    expect(html).not.toContain('Open the official claim form');
  });

  it('points to the notice when there is no official link', () => {
    const html = renderFlow({ status: 'closed', deadline: null }, { officialUrl: null });
    expect(html).toContain('to see if it still takes claims: use the link in the notice you got by mail or email.');
    expect(html).toContain(REPORT);
  });
});

describe('ClaimFlow with a tracked claim', () => {
  it('keeps the filing steps on a listing our list marks closed', () => {
    const html = renderFlow({ status: 'closed' }, { claim: claim() });
    expect(html).toContain('Our list marks this settlement as closed');
    expect(html).toContain('Open the official claim form');
    expect(html).toContain(REPORT);
    expect(html).not.toContain(SAVE);
  });

  it('accepts the report the day after the deadline', () => {
    const html = renderFlow({ deadline: '2026-10-15' }, { claim: claim() });
    expect(html).toContain('Tell us by Nov 14, 2026.');
    expect(html).toContain(REPORT);
  });
});

describe('ClaimFlow when full-service filing is on', () => {
  it('makes authorization the primary action and keeps self-file as a link', async () => {
    const { FILE_FOR_YOU_CTA, SELF_FILE_SECONDARY } = await import('@/lib/copy');
    const html = renderFlow({}, { assistedFilingAllowed: true });
    expect(html).toContain(FILE_FOR_YOU_CTA);
    expect(html).toContain('id="authorize"');
    expect(html).toContain(SELF_FILE_SECONDARY);
    expect(html).toContain(`href="${OFFICIAL}"`);
    expect(html).not.toContain('Open the official claim form');
    expect(html).toContain('goes to the filing queue');
  });

  it('keeps the official-form primary button when the flag is off', () => {
    const html = renderFlow({});
    expect(html).toContain('Open the official claim form');
    expect(html).not.toContain('id="authorize"');
    expect(html).not.toContain('Copy details and file yourself');
  });
});

describe('the claim page without a claim', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    h.claimRow = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function settlementRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: LAWSUIT_ID,
      slug: 'real-settlement',
      title: 'Real settlement',
      category: 'Consumer',
      status: 'open',
      review_status: 'published',
      deadline: '2026-11-30',
      claim_url: OFFICIAL,
      source_url: null,
      eligibility_text: null,
      eligibility: null,
      proof_required: null,
      ...overrides,
    };
  }
  const render = async () =>
    renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ slug: 'real-settlement' }) }));

  it('the day after the deadline, shows the report form instead of only "Browse open settlements"', async () => {
    h.settlement = settlementRow({ deadline: '2026-10-15' });
    const html = await render();
    expect(html).toContain('The deadline has passed');
    expect(html).toContain('Tell us by Nov 14, 2026.');
    expect(html).toContain(REPORT);
    expect(html).not.toContain('Browse open settlements');
  });

  it('after a closure on our list, shows the report form with the re-check wording', async () => {
    h.settlement = settlementRow({ status: 'closed' });
    const html = await render();
    expect(html).toContain('Our list shows this settlement as closed');
    expect(html).toContain(REPORT);
    expect(html).not.toContain('Browse open settlements');
  });

  it('on day 31, says it is closed and sends people to open settlements', async () => {
    h.settlement = settlementRow({ deadline: '2026-09-15' });
    const html = await render();
    expect(html).toContain('This settlement is closed');
    expect(html).toContain('Browse open settlements');
    expect(html).toContain('keep the confirmation the settlement administrator');
    expect(html).not.toContain(REPORT);
  });

  it('is still a 404 for an unpublished or fictional settlement', async () => {
    h.settlement = settlementRow({ review_status: 'rejected', deadline: '2026-10-15' });
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    h.settlement = settlementRow({ slug: 'robocall-tcpa-settlement', deadline: '2026-10-15' });
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
