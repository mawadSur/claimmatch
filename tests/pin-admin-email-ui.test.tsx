import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/claim/blue-ridge',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { NoticeIdSection } from '@/components/claims/NoticeIdSection';
import { PaperFallbackCard } from '@/components/claims/PaperFallbackCard';
import {
  PAPER_FALLBACK_CTA,
  PAPER_FALLBACK_HEADING,
  PIN_ADMIN_EMAIL_CTA,
  PIN_ADMIN_EMAIL_SIGN_IN,
  PIN_ADMIN_EMAIL_WAITING_LABEL,
} from '@/lib/pin-admin-email';

const DAY = 24 * 60 * 60 * 1000;

function notice(overrides: Partial<Parameters<typeof NoticeIdSection>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(NoticeIdSection, {
      slug: 'blue-ridge',
      lawsuitId: '10000000-0000-4000-8000-000000000001',
      title: 'Blue Ridge Rural Water',
      administrator: 'CBIZ claims@cbiz.com',
      officialHref: 'https://admin.example/claim',
      signedIn: true,
      ...overrides,
    }),
  );
}

describe('NoticeIdSection PIN-gated email', () => {
  it('offers a No notice path, without saying Lawsuit AI never emails', () => {
    const html = notice();
    expect(html).toContain('No notice?');
    expect(html).not.toContain('Lawsuit AI never emails');
  });

  it('keeps the manual path and withholds outreach by default for members and guests', () => {
    for (const signedIn of [true, false]) {
      const requested = new Date().toISOString();
      const html = notice({ signedIn, savedRequestedNoticeAt: requested, pinAdminRequestedAt: requested });
      expect(html).toContain('Use this letter');
      expect(html).toContain('Request marked');
      expect(html).toContain('Official site lookup or contact');
      expect(html).not.toContain(PIN_ADMIN_EMAIL_CTA);
      expect(html).not.toContain(PIN_ADMIN_EMAIL_SIGN_IN);
      expect(html).not.toContain('Email request saved');
    }
  });

  it('shows the email-to-administrator button once outreach is enabled', () => {
    const requested = new Date().toISOString();
    const html = notice({ pinAdminOutreachEnabled: true, pinAdminRequestedAt: requested });
    expect(html).toContain(PIN_ADMIN_EMAIL_CTA);
    expect(html).toContain('Email request saved');
  });

  it('shows waiting copy with the send date', () => {
    const sent = new Date(Date.now() - 2 * DAY).toISOString();
    const html = notice({ pinAdminOutreachEnabled: true, pinAdminRequestedAt: sent, pinAdminSentAt: sent });
    expect(html).toContain(PIN_ADMIN_EMAIL_WAITING_LABEL);
  });

  it('hides a due paper fallback unless its own flag is enabled', () => {
    const requested = new Date(Date.now() - 8 * DAY).toISOString();
    const base = { pinAdminRequestedAt: requested, formUrl: 'https://admin.example/paper.pdf' };
    const disabled = notice({ ...base, pinAdminOutreachEnabled: true });
    expect(disabled).not.toContain(PAPER_FALLBACK_HEADING);
    expect(disabled).not.toContain('paper.pdf');
    expect(disabled).toContain('Email request saved');

    const enabled = notice({ ...base, paperFallbackEnabled: true });
    expect(enabled).toContain(PAPER_FALLBACK_HEADING);
    expect(enabled).toContain(PAPER_FALLBACK_CTA);
    expect(enabled).toContain('href="https://admin.example/paper.pdf"');
    expect(enabled).not.toContain(PIN_ADMIN_EMAIL_CTA);
    expect(enabled).not.toMatch(/no reply|emailed administrator/i);
  });
});

describe('PaperFallbackCard', () => {
  it('links the paper form and, when different, the official site', () => {
    const html = renderToStaticMarkup(
      createElement(PaperFallbackCard, {
        formHref: 'https://admin.example/paper.pdf',
        officialHref: 'https://admin.example/claim',
      }),
    );
    expect(html).toContain(PAPER_FALLBACK_HEADING);
    expect(html).toContain('Your notice ID is not on file yet');
    expect(html).toContain('href="https://admin.example/paper.pdf"');
    expect(html).toContain('href="https://admin.example/claim"');
  });
});
