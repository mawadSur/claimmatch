import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #53: public pages say "Lawsuit AI never files for you" only while
// one-click is not on for the viewer. The settlement page says Lawsuit AI can
// file only when this settlement has an agent lane the law firm enabled. The
// filing configuration loader and the lane preview are faked.
const m = vi.hoisted(() => ({
  loadSettlementEnvs: vi.fn(),
  previewLaneFor: vi.fn(),
  user: null as { id: string; email: string } | null,
  lawsuit: null as unknown,
}));

vi.mock('@/lib/filing/v2/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/v2/environment')>()),
  loadSettlementEnvs: m.loadSettlementEnvs,
}));
vi.mock('@/lib/filing/v2/view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/v2/view')>()),
  previewLaneFor: m.previewLaneFor,
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => null,
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: () => undefined }) }));
vi.mock('@/lib/supabase/server', () => {
  function query() {
    const q: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'in', 'or', 'not', 'order', 'ilike', 'limit', 'gte', 'lte', 'neq', 'is']) q[name] = () => q;
    q.maybeSingle = async () => ({ data: m.lawsuit, error: null });
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: m.lawsuit ? [m.lawsuit] : [], error: null }).then(resolve, reject);
    return q;
  }
  const client = { from: () => query(), auth: { getUser: async () => ({ data: { user: m.user } }) } };
  return {
    createClient: async () => client,
    createPublicClient: () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

import LawsuitDetailPage from '@/app/lawsuits/[slug]/page';
import InvitePage from '@/app/invite/page';
import OnboardingPage from '@/app/onboarding/page';
import { MAY_FILE_PAGE_COPY, SETTLEMENT_FILING_COPY } from '@/lib/copy';
import { settlementFilingMode, viewerMayFile } from '@/lib/filing/public-filing';
import { makeLawsuit } from './helpers';

const TESTER = 'tester@lawsuitai.example';
const LAWSUIT_ID = '00000000-0000-4000-8000-000000000001';
const ENV = { policy: { allowed_states: ['CA'] } };

function setMode(mode: 'off' | 'test' | 'live') {
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', mode === 'live' ? '1' : '');
  vi.stubEnv('ONE_CLICK_FILING_TEST_MODE', mode === 'test' ? '1' : '');
}
function agentLane(agent: boolean) {
  m.loadSettlementEnvs.mockResolvedValue({ ok: true, envs: new Map([[LAWSUIT_ID, ENV]]), lane: { deskOpenJobs: 0, emailConfigured: true } });
  m.previewLaneFor.mockReturnValue({ lane: agent ? 'filing_desk' : 'self_file', agent, reasons: [], last_day_for_agent: null, deadline: null });
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;|’/g, "'").replace(/\s+/g, ' ');

beforeEach(() => {
  m.loadSettlementEnvs.mockReset();
  m.previewLaneFor.mockReset();
  m.user = null;
  m.lawsuit = null;
  vi.stubEnv('INTERNAL_EMAILS', TESTER);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUBSCRIPTION_BILLING_ENABLED', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('settlementFilingMode', () => {
  it('flag off, or test mode and not a tester: never_files, without reading anything', async () => {
    for (const mode of ['off', 'test'] as const) {
      setMode(mode);
      expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: null })).toBe('never_files');
      expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: { kind: 'member', email: 'someone@example.com' } })).toBe('never_files');
    }
    expect(m.loadSettlementEnvs).not.toHaveBeenCalled();
  });

  it('one-click on for the viewer: agent only when this settlement has an agent lane', async () => {
    setMode('test');
    agentLane(true);
    expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: { kind: 'member', email: TESTER } })).toBe('agent');
    setMode('live');
    expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: null })).toBe('agent');
    // Without a member state the lane is checked for a state the policy covers.
    expect(m.previewLaneFor.mock.calls.at(-1)?.[2]).toBe('CA');
    agentLane(false);
    expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: null })).toBe('self_file');
  });

  it('any doubt is self_file, never "never files" and never agent', async () => {
    setMode('live');
    m.loadSettlementEnvs.mockResolvedValue({ ok: false });
    expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: null })).toBe('self_file');
    m.loadSettlementEnvs.mockRejectedValue(new Error('down'));
    expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: null })).toBe('self_file');
  });

  it('the fee disclosure alone means Lawsuit AI may file: self_file, no lane read', async () => {
    setMode('off');
    vi.stubEnv('SUBSCRIPTION_BILLING_ENABLED', '1');
    expect(viewerMayFile(null)).toBe(true);
    expect(await settlementFilingMode({ lawsuitId: LAWSUIT_ID, viewer: null })).toBe('self_file');
    expect(m.loadSettlementEnvs).not.toHaveBeenCalled();
  });
});

describe('the settlement page', () => {
  const renderRaw = async () => {
    m.lawsuit = makeLawsuit({}, { id: LAWSUIT_ID, slug: 'acme-settlement', title: 'Acme Settlement', deadline: '2099-12-01', claim_url: 'https://official.example.test/claim' });
    return renderToStaticMarkup(await LawsuitDetailPage({ params: Promise.resolve({ slug: 'acme-settlement' }) }));
  };
  const render = async () => text(await renderRaw());

  it('flag off: guide pages say we help you file, not that we file this claim', async () => {
    setMode('off');
    const html = await render();
    expect(html).toContain(SETTLEMENT_FILING_COPY.self_file.step.body);
    expect(html).toContain('We help you file');
    expect(html).not.toContain('We file this claim for you');
  });

  it('test mode (a static page has no viewer): help-you-file, not the agent claim', async () => {
    setMode('test');
    agentLane(true);
    const html = await render();
    expect(html).toContain('We help you file');
    expect(html).not.toContain('We file this claim for you');
  });

  it('live with an agent lane: the per-settlement one-click text, and no "never files" anywhere', async () => {
    setMode('live');
    agentLane(true);
    const html = await render();
    expect(html).toContain(SETTLEMENT_FILING_COPY.agent.step.body.replace(/’/g, "'"));
    expect(html).toContain(SETTLEMENT_FILING_COPY.agent.points[0]);
    expect(html).not.toContain('never files');
  });

  it('Easy submit (desk_file) uses Easy submit how-to and never leftover self-file copy', async () => {
    setMode('off');
    m.lawsuit = makeLawsuit(
      {},
      {
        id: LAWSUIT_ID,
        slug: 'realpage-rental-software-antitrust-settlement',
        title: 'RealPage rental software',
        deadline: '2099-12-01',
        claim_url: 'https://www.realpagerentalsettlement.com/submit-claim',
        claim_action_type: 'desk_file',
      },
    );
    const raw = renderToStaticMarkup(
      await LawsuitDetailPage({ params: Promise.resolve({ slug: 'realpage-rental-software-antitrust-settlement' }) }),
    );
    const html = text(raw);
    expect(html).toContain('Easy submit');
    expect(html).toContain('we submit it for you after you e-sign');
    expect(html).not.toContain("doesn't file claims for you");
    expect(html).not.toContain('never files for you');
    expect(html).not.toContain('Where Lawsuit AI offers one-click filing');
    expect(html).not.toContain('otherwise you file every claim yourself');
  });

  it('live without an agent lane: self-file text, and no "never files" promise', async () => {
    setMode('live');
    agentLane(false);
    const raw = await renderRaw();
    const html = text(raw);
    expect(html).toContain(SETTLEMENT_FILING_COPY.self_file.step.body);
    expect(html).not.toContain('never files');
    expect(html).not.toContain('We file this claim for you');
    expect(html).toContain('We help you file');
    expect(html).toContain('Sign in to save this claim');
    expect(raw).toContain('/signup?next=');
    expect(html).toContain('Listed payout');
    expect(html).toContain('Proof needed');
    expect(html).toContain('Claim deadline');
    expect(raw).toContain('LegalService');
    expect(html).not.toMatch(/15\s?%/);
  });
});

describe('invite and onboarding', () => {
  it('invite: unchanged off and in test mode; the may-file text once live', async () => {
    vi.stubEnv('SOFT_INVITE_LANDING_ENABLED', '1');
    for (const mode of ['off', 'test'] as const) {
      setMode(mode);
      expect(text(renderToStaticMarkup(InvitePage()))).toContain('Lawsuit AI is not a law firm and never files for you.');
    }
    setMode('live');
    const html = text(renderToStaticMarkup(InvitePage()));
    expect(html).toContain(MAY_FILE_PAGE_COPY.inviteStep.body.replace(/’/g, "'"));
    expect(html).not.toContain('never files');
  });

  it('onboarding follows the signed-in viewer: a tester in test mode gets the may-file text, others do not', async () => {
    setMode('test');
    const render = async () => text(renderToStaticMarkup(await OnboardingPage({ searchParams: Promise.resolve({}) })));
    m.user = { id: 'u1', email: 'someone@example.com' };
    expect(await render()).toContain('It never files for you and never handles settlement payments.');
    m.user = { id: 'u2', email: TESTER };
    const tester = await render();
    expect(tester).toContain(MAY_FILE_PAGE_COPY.onboardingIntro);
    expect(tester).not.toContain('never files');
  });
});
