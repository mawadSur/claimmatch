import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { YourMatches } from '@/components/claims/YourMatches';
import { FILE_FOR_YOU_CTA, SELF_FILE_SECONDARY } from '@/lib/copy';
import type { DashboardMatch } from '@/components/claims/dashboard-model';

const MATCH: DashboardMatch = {
  id: '00000000-0000-4000-8000-0000000000a1',
  slug: 'ny-auto',
  title: 'NY Auto Settlement',
  deadlineText: 'Deadline Nov 30, 2026',
  reasons: ['Your state is listed'],
  strength: 'strong',
  label: 'Strong match',
  officialUrl: 'https://admin.example/file',
  score: 1,
  payoutMin: null,
  payoutMax: null,
};

function html(fileForYou = false) {
  return renderToStaticMarkup(
    createElement(YourMatches, { items: [MATCH], fileForYou }),
  );
}

describe('match filing CTA', () => {
  it('stays “How to file” when assisted filing is off', () => {
    const out = html(false);
    expect(out).toContain('How to file');
    expect(out).toContain('href="/claim/ny-auto"');
    expect(out).not.toContain(FILE_FOR_YOU_CTA);
    expect(out).not.toContain(SELF_FILE_SECONDARY);
    expect(out).not.toContain('#authorize');
  });

  it('uses the file-for-you primary CTA when assisted filing is on', () => {
    const out = html(true);
    expect(out).toContain(FILE_FOR_YOU_CTA);
    expect(out).toContain('href="/claim/ny-auto#authorize"');
    expect(out).toContain(SELF_FILE_SECONDARY);
    expect(out).toContain('href="/claim/ny-auto"');
    expect(out).not.toContain('How to file');
  });

  it('adds “I filed this myself” without changing the existing self-file copy', () => {
    const out = renderToStaticMarkup(
      createElement(YourMatches, { items: [MATCH], selfFiledReportEnabled: true }),
    );
    expect(out).toContain('How to file');
    expect(out).toContain('I filed this myself');
    expect(out).toContain('href="/claim/ny-auto#self-filed"');
    expect(out).not.toContain(SELF_FILE_SECONDARY);
    const withFileForYou = renderToStaticMarkup(
      createElement(YourMatches, { items: [MATCH], fileForYou: true, selfFiledReportEnabled: true }),
    );
    expect(withFileForYou).toContain(SELF_FILE_SECONDARY);
    expect(withFileForYou).toContain('I filed this myself');
  });
});
