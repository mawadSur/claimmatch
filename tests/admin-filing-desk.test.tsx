import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The desk screen shows the signed packet with copy buttons and a plain link
// to the official form. It never embeds, scripts or proxies the official
// site, and any challenge there is a hard stop for the person filing.

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/filing/desk',
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

import { DeskResultForm } from '@/components/admin/filing/DeskForms';
import { DeskPacket, DeskRules } from '@/components/admin/filing/DeskPacket';
import { RESULT_OUTCOMES } from '@/components/admin/filing/labels';
import { ATTESTATION, deskView, HASH, NOW, OFFICIAL_URL } from './admin-filing-fixtures';

const packet = (view = deskView()) => renderToStaticMarkup(createElement(DeskPacket, { view, now: NOW }));

/** The radio <input> with this value (attribute order is React's). */
function radio(markup: string, value: string): string {
  return [...markup.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`value="${value}"`)) ?? '';
}

describe('desk packet', () => {
  it('links to the official form in a new tab of the staff member’s own browser', () => {
    const markup = packet();
    expect(markup).toContain(`href="${OFFICIAL_URL}" target="_blank" rel="noopener noreferrer"`);
    expect(markup).toContain('Open the official form');
    expect(markup).toContain('You fill it in and submit it yourself');
  });

  it('never embeds, frames or scripts anything', () => {
    const markup = packet();
    for (const tag of ['<iframe', '<embed', '<object', '<script', '<form', '<webview', '<portal']) expect(markup).not.toContain(tag);
  });

  it('lists every field in the official order with an exact copy button', () => {
    const markup = packet();
    const order = ['Full Name', 'Email Address', 'How many units did you buy?', 'Payout method'].map((label) => markup.indexOf(label));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(markup).toContain('aria-label="Copy Full Name"');
    expect(markup).toContain('jordan@example.test');
  });

  it('shows the sworn statement verbatim, the typed name and the packet hash', () => {
    const markup = packet();
    expect(markup).toContain(ATTESTATION);
    expect(markup).toContain('Jordan Q. Member');
    expect(markup).toContain(HASH);
    expect(markup).toContain('Use the long form, not the quick claim.');
  });

  it('offers each proof document for download, with its fingerprint', () => {
    const markup = packet();
    expect(markup).toContain('Receipt');
    expect(markup).toContain('Download');
    expect(markup).toContain('bbbbbbbbbbbb…');
  });

  it('a link that is not https is never rendered', () => {
    const markup = packet(deskView({ settlement: { title: 'X', official_form_url: 'javascript:alert(1)', deadline: null } }));
    expect(markup).not.toContain('javascript:');
    expect(markup).not.toContain('Open the official form');
    expect(markup).toContain('no usable official form link');
  });

  it('a Jev block says not to submit, and the result form will not record a filing', () => {
    const blocked = deskView({
      checks: {
        outcome: 'block',
        issues: [
          { rule_id: 'global.deadline_cutoff', source: 'global', severity: 'block', code: 'deadline_passed', message: 'Past the cutoff.', field: null, audience: 'member' },
          { rule_id: 'global.duplicate_identity', source: 'global', severity: 'warn', code: 'duplicate_identity', message: 'Same name and address on another account.', field: null, audience: 'staff' },
        ],
      },
    });
    const markup = packet(blocked);
    expect(markup).toContain('Jev blocks sending this claim. Do not submit it.');
    expect(markup).toContain('staff only');
    const form = renderToStaticMarkup(createElement(DeskResultForm, { view: blocked, onDone: () => undefined }));
    expect(radio(form, 'filed')).toContain('disabled=""');
    expect(radio(form, 'stopped_at_challenge')).not.toContain('disabled');
  });
});

describe('desk rules and result choices', () => {
  it('a challenge on the official site is a hard stop, never solved or passed on', () => {
    const rules = renderToStaticMarkup(createElement(DeskRules));
    expect(rules).toContain('Do not solve it or ask anyone to.');
    expect(rules).toContain('Never submit a claim a second time.');
    const challenge = RESULT_OUTCOMES.find((o) => o.value === 'stopped_at_challenge');
    expect(challenge?.help).toMatch(/Do not solve it/);
  });

  it('offers every contract outcome, unsure-ones never retried', () => {
    expect(RESULT_OUTCOMES.map((o) => o.value)).toEqual(['filed', 'rejected', 'not_submitted', 'needs_member', 'stopped_at_challenge', 'needs_attention']);
    expect(RESULT_OUTCOMES.find((o) => o.value === 'needs_attention')?.help).toMatch(/Never submit it again/);
  });

  it('the result form starts with nothing chosen and nothing to send', () => {
    const form = renderToStaticMarkup(createElement(DeskResultForm, { view: deskView(), onDone: () => undefined }));
    expect(form).not.toMatch(/type="radio"[^>]*checked/);
    expect(form).toMatch(/<button[^>]*disabled=""[^>]*>Save the result<\/button>/);
  });
});
