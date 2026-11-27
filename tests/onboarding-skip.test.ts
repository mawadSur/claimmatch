import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// "Skip for now" used to look dead on the first tap: the handler left the page
// with a soft router.push onto the force-dynamic dashboard, and the server
// action reported success even when it updated no row at all.
const db = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  updated: [] as { patch: Record<string, unknown>; id: string }[],
  rows: [{ id: 'u1' }] as Array<{ id: string }>,
  error: null as { code: string } | null,
  cookieSets: [] as { name: string; value: string }[],
}));

vi.mock('@/lib/supabase/server', () => {
  function query() {
    const q: Record<string, unknown> = {};
    let patch: Record<string, unknown> = {};
    let id = '';
    q.select = (columns: string) => {
      if (columns === 'attributes') {
        return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
      }
      db.updated.push({ patch, id });
      return Promise.resolve({ data: db.error ? null : db.rows, error: db.error });
    };
    q.update = (next: Record<string, unknown>) => {
      patch = next;
      return q;
    };
    q.eq = (_column: string, value: string) => {
      id = value;
      return q;
    };
    return q;
  }
  return {
    isSupabaseConfigured: () => true,
    createClient: async () => ({
      from: query,
      auth: { getUser: async () => ({ data: { user: db.user } }) },
    }),
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string) => {
      db.cookieSets.push({ name, value });
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => null }));

import { skipOnboarding } from '@/app/onboarding/actions';
import { MATCH_PREVIEW_COOKIE } from '@/lib/match-preview';
import { OnboardingWizard } from '@/components/OnboardingWizard';

const wizard = readFileSync(
  fileURLToPath(new URL('../src/components/OnboardingWizard.tsx', import.meta.url)),
  'utf8',
);

beforeEach(() => {
  db.user = { id: 'u1' };
  db.updated = [];
  db.rows = [{ id: 'u1' }];
  db.error = null;
  db.cookieSets = [];
  vi.stubGlobal('window', {
    location: { origin: 'https://lawsuitai.org', pathname: '/onboarding', search: '' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('skipOnboarding', () => {
  it('marks the profile onboarded and drops the preview cookie', async () => {
    expect(await skipOnboarding()).toEqual({ ok: true });
    expect(db.updated).toEqual([{ patch: { onboarded: true }, id: 'u1' }]);
    expect(db.cookieSets).toEqual([{ name: MATCH_PREVIEW_COOKIE, value: '' }]);
  });

  it('does not report success when the update matched no row', async () => {
    // PostgREST returns no error for zero matched rows, and only the
    // handle_new_user trigger can create the profiles row (migration 0032
    // revoked client INSERT), so a missing row has to surface as an error.
    db.rows = [];
    const result = await skipOnboarding();
    expect(result.ok).toBe(false);
    expect(db.cookieSets).toEqual([]);
  });

  it('still reports the signed-out case so the wizard can send people to log in', async () => {
    db.user = null;
    expect(await skipOnboarding()).toMatchObject({ ok: false, signedOut: true });
  });
});

describe('the onboarding wizard leaves the page on the first tap', () => {
  it('uses a hard navigation, not a soft router.push plus refresh', () => {
    expect(wizard).toContain('window.location.assign');
    expect(wizard).not.toContain('router.refresh()');
    expect(wizard).not.toContain('startTransition');
    // The signed-out branch is the one navigation that stays soft.
    expect(wizard).toContain("router.push('/login?next=/onboarding')");
  });

  it('keeps a skip out of profile_completed', () => {
    expect(wizard).toContain('saved.profile');
    expect(wizard).toContain('profileCompletedProperties');
    expect(wizard).toContain("kind === 'save'");
    expect(wizard).not.toContain("kind === 'save' || Boolean(preview)");
  });

  it('shows the skip as a real button in the action row, with a working label', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingWizard, {
        initial: { fullName: '', state: '' },
        email: null,
        next: '/dashboard?welcome=1',
      }),
    );
    const skip = /<button[^>]*btn-ghost[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? '';
    expect(skip).toContain('type="button"');
    expect(skip).toContain('Skip for now');
    expect(html).toContain('aria-busy="false"');
    expect(wizard).toContain('Skipping…');
  });
});
