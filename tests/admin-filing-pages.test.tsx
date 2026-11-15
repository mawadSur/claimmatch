import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The /admin/filing pages: off by default (new pages 404, /admin/filing is
// the legacy page exactly as before), and on, open only to admins and staff
// with a filing role, with controls gated by role.

const h = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  admin: false,
  roles: [] as string[],
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/filing',
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
  createServiceClient: () => ({
    from: (table: string) => {
      const result = table === 'staff_roles' ? { data: h.roles.map((role) => ({ role })), error: null } : { data: [], count: 0, error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain;
      chain.is = async () => result;
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
  }),
}));

vi.mock('@/lib/admin', () => {
  const adminDeniedPath = (signedIn: boolean, path: string) =>
    signedIn ? '/dashboard?denied=admin' : `/login?next=${encodeURIComponent(path)}`;
  return {
    adminDeniedPath,
    getAdminUser: async () => (h.admin && h.user ? { id: h.user.id, email: h.user.email } : null),
    requireAdmin: async (path: string) => {
      if (h.admin && h.user) return { id: h.user.id, email: h.user.email };
      throw new Error(`NEXT_REDIRECT ${adminDeniedPath(Boolean(h.user), path)}`);
    },
  };
});

import AdminLayout from '@/app/admin/layout';
import AdminFilingPage, { generateMetadata } from '@/app/admin/filing/page';
import FilingBulkPage from '@/app/admin/filing/bulk/page';
import FilingDeskPage from '@/app/admin/filing/desk/page';
import SettlementFilingPage from '@/app/admin/filing/settlements/[id]/page';
import { LAWSUIT_ID } from './admin-filing-fixtures';

const USER = { id: '00000000-0000-4000-8000-00000000aa01', email: 'person@example.test' };
const noParams = { searchParams: Promise.resolve({}) };

async function render(page: Promise<ReactElement>): Promise<string> {
  return renderToStaticMarkup(await page);
}

beforeEach(() => {
  h.user = null;
  h.admin = false;
  h.roles = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('flag off (the default)', () => {
  beforeEach(() => vi.stubEnv('ONE_CLICK_FILING_ENABLED', ''));

  it('the new pages are not found, before any sign-in check', async () => {
    h.user = USER;
    h.roles = ['legal_reviewer'];
    await expect(SettlementFilingPage({ params: Promise.resolve({ id: LAWSUIT_ID }) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(FilingDeskPage(noParams)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(FilingBulkPage(noParams)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('/admin/filing is the legacy page, admins only, unchanged', async () => {
    h.user = USER;
    h.admin = true;
    const markup = await render(AdminFilingPage());
    expect(markup).toContain('Assisted filing');
    expect(markup).toContain('This view is off. Set ASSISTED_FILING_ENABLED=1 after counsel review.');
    expect(markup).not.toContain('Filing console');
    expect(generateMetadata().title).toBe('Assisted filing');
    h.admin = false;
    h.roles = ['legal_reviewer'];
    await expect(AdminFilingPage()).rejects.toThrow('NEXT_REDIRECT /dashboard?denied=admin');
  });

  it('the admin nav shows no new link', async () => {
    h.user = USER;
    h.admin = true;
    const markup = await render(AdminLayout({ children: null }));
    expect(markup).not.toContain('href="/admin/filing"');
  });

  it('the admin shell stays admins only: a filing role alone does not get past it', async () => {
    h.user = USER;
    h.roles = ['legal_reviewer'];
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /dashboard?denied=admin');
  });
});

describe('flag on: the admin shell', () => {
  beforeEach(() => vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1'));

  it('lets a legal reviewer or filing agent who is not an admin in, with the filing link only', async () => {
    h.user = USER;
    for (const roles of [['legal_reviewer'], ['filing_agent']]) {
      h.roles = roles;
      const markup = await render(AdminLayout({ children: null }));
      expect(markup).toContain('Filing console');
      expect(markup.match(/href="\/admin\/filing"/g)).toHaveLength(1);
      expect(markup).not.toContain('href="/admin/catalog"');
      expect(markup).not.toContain('href="/admin/review"');
    }
  });

  it('still turns away signed-in members without a role, and signed-out visitors', async () => {
    h.user = USER;
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /dashboard?denied=admin');
    h.user = null;
    await expect(AdminLayout({ children: null })).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent('/admin')}`);
  });

  it('gives an admin with a filing role the full admin nav', async () => {
    h.user = USER;
    h.admin = true;
    h.roles = ['legal_reviewer'];
    const markup = await render(AdminLayout({ children: null }));
    expect(markup).toContain('href="/admin/catalog"');
    expect(markup.match(/href="\/admin\/filing"/g)).toHaveLength(1);
  });
});

describe('flag on', () => {
  beforeEach(() => vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1'));

  it('signed-out visitors go to log in and come back', async () => {
    await expect(AdminFilingPage()).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent('/admin/filing')}`);
    await expect(FilingDeskPage(noParams)).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent('/admin/filing/desk')}`);
  });

  it('signed-in members without a role or admin are turned away', async () => {
    h.user = USER;
    await expect(AdminFilingPage()).rejects.toThrow('NEXT_REDIRECT /dashboard?denied=admin');
    await expect(FilingBulkPage(noParams)).rejects.toThrow('NEXT_REDIRECT /dashboard?denied=admin');
  });

  it('a filing agent opens the console', async () => {
    h.user = USER;
    h.roles = ['filing_agent'];
    const markup = await render(AdminFilingPage());
    expect(markup).toContain('Filing console');
    expect(markup).toContain('Your access: Filing agent');
    expect(markup).toContain('href="/admin/filing/desk"');
    expect(generateMetadata().title).toBe('Filing console');
  });

  it('a settlement id that is not a UUID is not found', async () => {
    h.user = USER;
    h.admin = true;
    await expect(SettlementFilingPage({ params: Promise.resolve({ id: 'kroger' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    const markup = await render(SettlementFilingPage({ params: Promise.resolve({ id: LAWSUIT_ID }) }));
    expect(markup).toContain('Law-firm parameters');
  });

  it('the desk shows "Take the next job" to filing agents only', async () => {
    h.user = USER;
    h.roles = ['legal_reviewer'];
    const reviewer = await render(FilingDeskPage({ searchParams: Promise.resolve({ job: 'not-a-uuid' }) }));
    expect(reviewer).toContain('Desk rules');
    expect(reviewer).not.toContain('Take the next job');
    h.roles = ['filing_agent'];
    expect(await render(FilingDeskPage(noParams))).toContain('Take the next job');
  });

  it('the bulk page opens for staff', async () => {
    h.user = USER;
    h.roles = ['filing_agent'];
    const markup = await render(FilingBulkPage({ searchParams: Promise.resolve({ lawsuit: LAWSUIT_ID }) }));
    expect(markup).toContain('Bulk exports');
  });

  it('the admin nav links to the console (once, also with the legacy flag on)', async () => {
    h.user = USER;
    h.admin = true;
    const markup = await render(AdminLayout({ children: null }));
    expect(markup.match(/href="\/admin\/filing"/g)).toHaveLength(1);
    vi.stubEnv('ASSISTED_FILING_ENABLED', '1');
    const both = await render(AdminLayout({ children: null }));
    expect(both.match(/href="\/admin\/filing"/g)).toHaveLength(1);
  });
});
