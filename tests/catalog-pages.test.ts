import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// A fake Supabase client: records the query and returns canned rows.
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => ({
  calls: [] as [string, unknown[]][],
  list: { data: [] as unknown[] | null, error: null as { message: string } | null },
  single: { data: null as unknown, error: null as { message: string } | null },
}));

// The settlement 404 page reads the path to tell fictional listings apart.
const nav = vi.hoisted(() => ({ pathname: null as string | null }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => nav.pathname,
}));

vi.mock('@/lib/supabase/server', () => {
  // A query: every filter returns itself; awaiting it yields db.list.
  function query() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'not', 'order', 'ilike', 'limit']) {
      q[m] = (...args: unknown[]) => {
        db.calls.push([m, args]);
        return q;
      };
    }
    q.maybeSingle = async () => db.single;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(db.list).then(resolve, reject);
    return q;
  }
  // The client itself must not be thenable, or `await createClient()` unwraps it.
  const client = {
    from: (table: string) => {
      db.calls.push(['from', [table]]);
      return query();
    },
  };
  return {
    createClient: async () => client,
    createPublicClient: () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

import { LawsuitCard } from '@/components/LawsuitCard';
import LawsuitDetailPage, { generateMetadata } from '@/app/lawsuits/[slug]/page';
import LawsuitsPage, { generateMetadata as generateLawsuitsMetadata } from '@/app/lawsuits/page';
import SettlementNotFound from '@/app/lawsuits/[slug]/not-found';
import HomePage from '@/app/page';
import { ClosingSoon } from '@/components/claims/ClosingSoon';
import { FILING_FREE_WARNING } from '@/lib/copy';
import { catalogLawsuit } from './helpers';

const lawsuit = catalogLawsuit;

const BANNED = [
  /we file/i,
  /on your behalf/i,
  /receipt number/i,
  /no win,? no fee/i,
  /contingency/i,
  /15%/,
  /autopilot/i,
  /you(?:'|’)re owed/i,
  /ai matched/i,
  /matched \d+%/i,
  /bank-level/i,
];

function expectHonest(html: string) {
  for (const pattern of BANNED) expect(html).not.toMatch(pattern);
}

const page = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  db.calls.length = 0;
  db.list = { data: [], error: null };
  db.single = { data: null, error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LawsuitCard', () => {
  const render = (props: Parameters<typeof LawsuitCard>[0]) =>
    renderToStaticMarkup(createElement(LawsuitCard, props));

  it('shows the D50 label, the official link and "Start your claim" while open', () => {
    const html = render({ lawsuit: lawsuit() });
    expect(html).toContain('Unverified: check the official site.');
    expect(html).toContain('href="https://www.returnsettlement.com/submit-claim"');
    expect(html).toContain('href="/claim/amazon-return-policy-settlement"');
    expect(html).toContain('Start your claim');
    expect(html).toContain('Optional');
    expectHonest(html);
  });

  it('shows "Claims closed" and no call to action when not open', () => {
    for (const l of [lawsuit({ status: 'closed' }), lawsuit({ deadline: '2020-01-01' })]) {
      const html = render({ lawsuit: l });
      expect(html).toContain('Claims closed');
      expect(html).not.toContain('Start your claim');
      expect(html).not.toContain('/claim/');
    }
  });

  it('says Unknown, not None, when proof is not recorded', () => {
    const html = render({ lawsuit: lawsuit({ eligibility: {}, proof_required: false }) });
    expect(html).toContain('Unknown');
    expect(html).not.toMatch(/>None</);
  });

  it('omits Unknown proof when CATALOG_HIDE_UNKNOWNS_ENABLED is on', () => {
    vi.stubEnv('CATALOG_HIDE_UNKNOWNS_ENABLED', '1');
    const html = render({
      lawsuit: lawsuit({ eligibility: {}, proof_required: false, typical_payout: null, deadline: null }),
    });
    expect(html).not.toContain('Unknown');
    expect(html).not.toContain('Not stated');
    expect(html).toContain('have these details yet');
  });

  it('labels cards with no deadline instead of "Not listed"', () => {
    const html = render({ lawsuit: lawsuit({ deadline: null }) });
    expect(html).toContain('No deadline listed');
    expect(html).not.toContain('Not listed');
  });

  it('drops match scores and "Matched" badges', () => {
    const html = render({ lawsuit: lawsuit(), badge: { label: 'Matched 100%' } });
    expect(html).not.toContain('Matched');
    expect(html).not.toContain('100%');
    expect(html).toContain('Consumer Products');
    expect(render({ lawsuit: lawsuit(), badge: { label: 'AI Matched' } })).not.toContain('AI Matched');
    expect(render({ lawsuit: lawsuit(), badge: { label: 'Not filed yet' } })).toContain('Not filed yet');
  });

  it('labels a SettleSignal page as a listing when there is no official link', () => {
    const html = render({ lawsuit: lawsuit({ claim_url: null }) });
    expect(html).toContain('SettleSignal listing');
    expect(html).not.toContain('Official site');
  });
});

describe('settlement page', () => {
  it('shows an open settlement with the label, official link, CTA and SettleSignal credit', async () => {
    db.single = { data: lawsuit(), error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Open for claims');
    expect(html).toContain('Unverified: check the official site');
    expect(html).toContain('We haven’t checked this listing against the official settlement notice yet.');
    expect(html).toContain('Official claim site (returnsettlement.com)');
    expect(html).not.toContain('Go to the official site (returnsettlement.com)');
    expect(html).toContain('href="https://www.returnsettlement.com/submit-claim"');
    expect(html).toContain('href="/claim/amazon-return-policy-settlement"');
    expect(html).toContain('Start your claim');
    expect(html).toContain('Check if you qualify');
    expect(html).toContain('The short answer');
    expect(html).toContain('have these details yet');
    expect(html).toContain('who qualifies');
    expect(html).toContain('administrator');
    expect(html).not.toMatch(/Who qualifies[\s\S]*Not listed/);
    expect(html).not.toMatch(/Claim deadline[\s\S]*Not listed/);
    expect(html).toContain('Frequently asked questions');
    expect(html).toContain('FAQPage');
    expect(html).toContain('BreadcrumbList');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('CC BY 4.0');
    expect(html).toContain('SettleSignal (settlesignal.com)');
    expect(html).not.toContain('Claims closed');
    expectHonest(html);

    const meta = await generateMetadata(page('amazon-return-policy-settlement'));
    expect(meta.title).toBe('Amazon Return Policy Settlement: Official Claim Link & What We Know');
    expect(String(meta.title)).not.toContain('Who Qualifies');
    expect(String(meta.title)).not.toContain('Claim Deadline');
    expect(meta.alternates).toMatchObject({
      canonical: expect.stringContaining('/lawsuits/amazon-return-policy-settlement'),
    });
    expect(meta.openGraph).toMatchObject({ type: 'article' });
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it('does not show the unverified banner on a guided official-notice listing', async () => {
    db.single = {
      data: lawsuit({
        slug: 'toyota-airbag-control-unit-zf-trw-settlement',
        title: 'Toyota Airbag Control Unit ZF-TRW Settlement',
      }),
      error: null,
    };
    const html = renderToStaticMarkup(
      await LawsuitDetailPage(page('toyota-airbag-control-unit-zf-trw-settlement')),
    );
    expect(html).not.toContain('Unverified: check the official site');
    expect(html).not.toContain('We haven’t checked this listing against the official settlement notice');
    expect(html).toContain('Checked against the official notice on Nov 10, 2026');
    expect(html).toContain('Official claim site (airbagcontrolunitsettlement.com)');
    expect(html).not.toContain('Go to the official site (airbagcontrolunitsettlement.com)');
  });

  it('still names the source page from the unverified banner when there is no official site', async () => {
    db.single = { data: lawsuit({ claim_url: null }), error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Unverified: check the official site');
    expect(html).toContain('We don’t have the official site’s link yet.');
    expect(html).toContain('SettleSignal listing');
    expect(html).not.toContain('Official claim site');
  });

  it('shows a plain "Claims closed" state for a closed settlement', async () => {
    db.single = { data: lawsuit({ status: 'closed' }), error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Claims closed');
    expect(html).not.toContain('Open for claims');
    expect(html).not.toContain('Start your claim');
    expect(html).not.toContain('href="/claim/');
    expectHonest(html);

    const meta = await generateMetadata(page('amazon-return-policy-settlement'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  it('noindexes a published settlement whose deadline has passed', async () => {
    db.single = { data: lawsuit({ deadline: '2020-01-01' }), error: null };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Claims closed');
    expect(html).not.toContain('Start your claim');
    expectHonest(html);

    const meta = await generateMetadata(page('amazon-return-policy-settlement'));
    expect(meta.robots).toMatchObject({ index: false, follow: true });
    expect(meta.description).toContain('is not taking claims');
  });

  it('never shows the feed placeholder as who qualifies, and frames real text as an unverified summary', async () => {
    db.single = { data: lawsuit({ eligibility_text: 'Open to eligible US residents.' }), error: null };
    let html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('Who may qualify');
    expect(html).not.toContain('Open to eligible US residents');
    expect(html).toContain('We don’t have the rules for who qualifies. Read the official notice before');
    expect(html).toContain('Read the rules on the official site');

    db.single = { data: lawsuit({ eligibility_text: 'Anyone who returned an item to Amazon in 2023.' }), error: null };
    html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).toContain('What our listing says:');
    expect(html).toContain('Anyone who returned an item to Amazon in 2023.');
    expect(html).toContain('This is a short summary, not the official rules.');
    expect(html).not.toMatch(/bg-success-50/);
  });

  it('tells people arriving at a fictional listing that it was not real and there is nothing to file', () => {
    nav.pathname = '/lawsuits/robocall-tcpa-settlement';
    const html = renderToStaticMarkup(createElement(SettlementNotFound));
    expect(html).toContain('This was not a real settlement');
    expect(html).toContain('test data, not a real settlement');
    expect(html).toContain('nothing to file');
    expect(html).toContain('href="/lawsuits"');
  });

  it('never says "nothing to file" for any other missing settlement', () => {
    // A real listing taken off the list (old match emails linked those too), a
    // closed one, a mistyped link, or no path at all.
    for (const path of ['/lawsuits/amazon-return-policy-settlement', '/lawsuits/robocall-tcpa', '/lawsuits/%E0%A4%A', null]) {
      nav.pathname = path;
      const html = renderToStaticMarkup(createElement(SettlementNotFound));
      expect(html, String(path)).toContain('We couldn’t find this settlement');
      expect(html, String(path)).toContain('check the site it names');
      expect(html, String(path)).not.toContain('nothing to file');
      expect(html, String(path)).not.toContain('test data');
    }
  });

  it('credits SettleSignal only on SettleSignal records', async () => {
    db.single = {
      data: lawsuit({ external_id: null, source_url: null, claim_url: 'https://www.court.gov/notice' }),
      error: null,
    };
    const html = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(html).not.toContain('SettleSignal');
    expect(html).toContain('href="https://www.court.gov/notice"');
  });

  it('indexes a full listing and noindexes a thin one', async () => {
    db.single = {
      data: lawsuit({
        eligibility_text: 'Anyone who returned an item to Amazon in 2023.',
        administrator: 'Angeion Group',
        typical_payout: 'Up to $40',
        deadline: '2099-12-01',
      }),
      error: null,
    };
    const full = await generateMetadata(page('amazon-return-policy-settlement'));
    expect(full.title).toContain('Who Qualifies');
    expect(full.title).toContain('Claim Deadline');
    expect(full.robots).toMatchObject({ index: true });
    const fullHtml = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(fullHtml).toContain('Who qualifies');
    expect(fullHtml).toContain('Anyone who returned an item to Amazon in 2023.');
    expect(fullHtml).toContain('Angeion Group');
    expect(fullHtml).not.toContain("We don't have these details yet");

    db.single = {
      data: lawsuit({
        deadline: null,
        eligibility_text: null,
        administrator: null,
        typical_payout: null,
      }),
      error: null,
    };
    const thin = await generateMetadata(page('amazon-return-policy-settlement'));
    expect(thin.title).toBe('Amazon Return Policy Settlement: Official Claim Link & What We Know');
    expect(String(thin.description)).not.toMatch(/Who Qualifies|Claim deadline/i);
    expect(thin.robots).toMatchObject({ index: false, follow: true });
    const thinHtml = renderToStaticMarkup(await LawsuitDetailPage(page('amazon-return-policy-settlement')));
    expect(thinHtml).toContain('have these details yet');
    expect(thinHtml).not.toContain('Not listed');
  });

  it('returns 404 for fictional settlements', async () => {
    await expect(LawsuitDetailPage(page('robocall-tcpa-settlement'))).rejects.toThrow();
    const meta = await generateMetadata(page('robocall-tcpa-settlement'));
    expect(meta.robots).toMatchObject({ index: false });
  });
});

describe('catalog page', () => {
  const searchParams = (p: Record<string, string>) => ({ searchParams: Promise.resolve(p) });

  it('lists open settlements with the D50 label and the SettleSignal credit', async () => {
    db.list = {
      data: [lawsuit(), lawsuit({ id: '2', slug: 'robocall-tcpa-settlement', title: 'Fake' })],
      error: null,
    };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({})));
    expect(html).toContain('Unverified: check the official site');
    expect(html).toContain('Showing 1 open settlement');
    expect(html).toContain('Amazon Return Policy Settlement');
    expect(html).not.toContain('Fake');
    expect(html).toContain('CC BY 4.0');
    expectHonest(html);
  });

  it('shows a clear empty state for a search with no results', async () => {
    db.list = { data: [lawsuit()], error: null };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({ q: 'zzz' })));
    expect(html).toContain('No open settlements match your search');
    expect(html).toContain('Clear filters');
  });

  it('renders every open row on one page when pagination is off (default)', async () => {
    db.list = {
      data: Array.from({ length: 30 }, (_, i) =>
        lawsuit({
          id: `id-${i}`,
          slug: `settlement-${i}`,
          title: `Settlement ${i}`,
          deadline: i < 5 ? null : `2099-12-${String(((i - 5) % 28) + 1).padStart(2, '0')}`,
        }),
      ),
      error: null,
    };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({})));
    expect(html).toContain('Showing 30 open settlements');
    expect(html).not.toContain('Page 1 of 2');
    expect(html).toContain('No deadline listed');
  });

  it('paginates 24 per page and keeps filters on page links when the flag is on', async () => {
    vi.stubEnv('LAWSUITS_PAGINATION_ENABLED', '1');
    db.list = {
      data: Array.from({ length: 30 }, (_, i) =>
        lawsuit({
          id: `id-${i}`,
          slug: `settlement-${i}`,
          title: `Settlement ${i}`,
          deadline: i < 5 ? null : `2099-12-${String(((i - 5) % 28) + 1).padStart(2, '0')}`,
        }),
      ),
      error: null,
    };
    const page1 = renderToStaticMarkup(await LawsuitsPage(searchParams({})));
    expect(page1).toContain('Showing 1–24 of 30 open settlements');
    expect(page1).toContain('Page 1 of 2');
    expect(page1).toContain('href="/lawsuits?page=2"');
    expect(page1).toContain('rel="next"');
    // Known deadlines sort first, so page 1 is all dated.
    expect(page1).not.toContain('No deadline listed');

    const page2 = renderToStaticMarkup(await LawsuitsPage(searchParams({ page: '2' })));
    expect(page2).toContain('Showing 25–30 of 30 open settlements');
    expect(page2).toContain('No deadline listed');
    expect(page2).toContain('rel="prev"');

    const dated = renderToStaticMarkup(await LawsuitsPage(searchParams({ hasDeadline: '1' })));
    expect(dated).toContain('with a listed deadline');
    expect(dated).toContain('Showing 1–24 of 25 open settlements');
    expect(dated).not.toContain('No deadline listed');
  });

  it('keeps page 1 indexable and canonicalizes later pages to page 1', async () => {
    vi.stubEnv('LAWSUITS_PAGINATION_ENABLED', '1');
    const page1 = await generateLawsuitsMetadata(searchParams({}));
    expect(page1.robots).toMatchObject({ index: true, follow: true });
    expect(page1.alternates).toMatchObject({
      canonical: expect.stringMatching(/\/lawsuits$/),
    });
    const page2 = await generateLawsuitsMetadata(searchParams({ page: '2', q: 'fee' }));
    expect(page2.robots).toMatchObject({ index: true, follow: true });
    expect(page2.alternates).toMatchObject({
      canonical: expect.stringContaining('/lawsuits?q=fee'),
    });
    expect(String(page2.alternates?.canonical)).not.toContain('page=2');
    expect(page2.title).toContain('page 2');
  });

  it('shows an error state, not sample data, when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.list = { data: null, error: { message: 'boom' } };
    const html = renderToStaticMarkup(await LawsuitsPage(searchParams({})));
    expect(html).toContain('We couldn’t load settlements right now');
    expect(html).not.toContain('Nationwide Data Breach');
  });
});

describe('"Closing soon" when the catalog cannot be read', () => {
  it('home shows an error, not "No deadlines coming up"', async () => {
    db.list = { data: null, error: { message: 'timeout' } };
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('We couldn’t load settlements right now.');
    expect(html).not.toContain('No deadlines coming up right now.');
    db.list = { data: [], error: null };
    const empty = renderToStaticMarkup(await HomePage());
    expect(empty).toContain('No deadlines coming up right now.');
    expect(empty).toContain(FILING_FREE_WARNING);
  });

  it('the dashboard module says so too', () => {
    const failed = renderToStaticMarkup(createElement(ClosingSoon, { items: [], failed: true }));
    expect(failed).toContain('couldn&rsquo;t load settlements right now'.replace('&rsquo;', '’'));
    expect(failed).not.toContain('No deadlines are coming up');
    expect(renderToStaticMarkup(createElement(ClosingSoon, { items: [] }))).toContain('No deadlines are coming up');
  });
});
