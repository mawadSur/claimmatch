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

  it('shows the email-to-administrator button once the member has asked', () => {
    const requested = new Date().toISOString();
    const html = notice({ pinAdminRequestedAt: requested });
    expect(html).toContain(PIN_ADMIN_EMAIL_CTA);
    expect(html).toContain('email them for you');
    expect(html).toContain('Email request saved');
  });

  it('shows waiting copy with the send date', () => {
    const sent = new Date(Date.now() - 2 * DAY).toISOString();
    const html = notice({ pinAdminRequestedAt: sent, pinAdminSentAt: sent });
    expect(html).toContain(PIN_ADMIN_EMAIL_WAITING_LABEL);
  });

  it('surfaces the paper-form fallback after 7 days with no reply', () => {
    const sent = new Date(Date.now() - 8 * DAY).toISOString();
    const html = notice({
      pinAdminRequestedAt: sent,
      pinAdminSentAt: sent,
      formUrl: 'https://admin.example/paper.pdf',
    });
    expect(html).toContain(PAPER_FALLBACK_HEADING);
    expect(html).toContain(PAPER_FALLBACK_CTA);
    expect(html).toContain('href="https://admin.example/paper.pdf"');
  });
});

describe('PaperFallbackCard', () => {
  it('links the paper form and, when different, the official site', () => {
    const html = renderToStaticMarkup(
      createElement(PaperFallbackCard, {
        formHref: 'https://admin.example/paper.pdf',
        officialHref: 'https://admin.example/claim',
        days: 7,
      }),
    );
    expect(html).toContain(PAPER_FALLBACK_HEADING);
    expect(html).toContain('No reply after 7 days');
    expect(html).toContain('href="https://admin.example/paper.pdf"');
    expect(html).toContain('href="https://admin.example/claim"');
  });
});
