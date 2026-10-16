import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/dashboard',
}));

import { CorrectiveNoticeList } from '@/components/claims/CorrectiveNoticeList';
import type { NoticeItem } from '@/components/claims/dashboard-model';

function item(overrides: Partial<NoticeItem> = {}): NoticeItem {
  return {
    claimId: '00000000-0000-4000-8000-000000000001',
    title: 'Real settlement',
    kind: 'legacy',
    deadline: '2026-11-30',
    deadlinePassed: false,
    filing: 'open',
    officialUrl: 'https://www.realsettlement-admin.com/file',
    ...overrides,
  };
}

const render = (items: NoticeItem[]) => renderToStaticMarkup(createElement(CorrectiveNoticeList, { items }));

describe('CorrectiveNoticeList markup', () => {
  it('has one polite live region from the first render, so answers are announced', () => {
    const html = render([item()]);
    expect(html).toMatch(/<p role="status" aria-live="polite" class="sr-only"><\/p>/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it('keeps the answer buttons focusable while saving (aria-disabled, not disabled)', () => {
    const html = render([item(), item({ claimId: '00000000-0000-4000-8000-000000000002', kind: 'fictional' })]);
    expect(html).toContain('I already filed');
    expect(html).toContain('Got it');
    expect(html).toMatch(/aria-disabled="false"/);
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it('says "I didn’t file" after the deadline, and how to find the official link without one', () => {
    const html = render([item({ deadlinePassed: true, filing: 'deadline_passed', deadline: '2026-08-01', officialUrl: null })]);
    expect(html).toContain('I didn’t file');
    const open = render([item({ officialUrl: null })]);
    expect(open).toContain('Use the link in the notice you got by');
  });
});

describe('long notice lists (File-all accounts)', () => {
  let next = 100;
  const many = (n: number, kind: NoticeItem['kind'] = 'legacy') =>
    Array.from({ length: n }, () => {
      const i = next++;
      return item({ claimId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `Settlement ${i}`, kind });
    });

  it('shows the first 5 rows and a "Show all" button', () => {
    const html = render(many(12));
    expect(html.match(/<li /g)).toHaveLength(5);
    expect(html).toContain('Show all 12');
    expect(render(many(5))).not.toContain('Show all');
  });

  it('offers one "Got it for all" for several fictional rows', () => {
    expect(render([...many(2), ...many(3, 'fictional')])).toContain('Got it for all 3 that were not real');
    expect(render([...many(2), ...many(1, 'fictional')])).not.toContain('Got it for all');
  });
});
