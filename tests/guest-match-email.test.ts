import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGuestMatchEmail, renderGuestMatchEmail } from '@/lib/guest-match-email';
import { makeLawsuit } from './helpers';

const sent = vi.hoisted(() => ({
  mail: null as { to: string; subject: string; html: string; text: string } | null,
  result: { status: 'sent' as const, id: 'msg_1' },
}));

vi.mock('@/lib/email-transactional', () => ({
  sendTransactionalEmail: async (mail: { to: string; subject: string; html: string; text: string }) => {
    sent.mail = mail;
    return sent.result;
  },
}));

const catalog = vi.hoisted(() => ({
  lawsuits: [] as ReturnType<typeof makeLawsuit>[],
  openingSoon: [] as ReturnType<typeof makeLawsuit>[],
  error: false,
}));

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupLawsuits: async () => catalog,
  };
});

import { POST } from '@/app/api/match-preview/email/route';

describe('guest match email', () => {
  beforeEach(() => {
    sent.mail = null;
    sent.result = { status: 'sent', id: 'msg_1' };
    catalog.lawsuits = [
      makeLawsuit(
        { states: ['CA'], requires: ['had_data_breach'] },
        {
          id: 'open-breach',
          slug: 'open-breach',
          title: 'Open Breach Settlement',
          deadline: '2099-12-01',
          status: 'open',
          review_status: 'published',
          typical_payout: 'Up to $100',
        },
      ),
    ];
    catalog.error = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses a valid email and rejects junk', () => {
    expect(parseGuestMatchEmail('  You@Example.COM ')).toBe('you@example.com');
    expect(parseGuestMatchEmail('not-an-email')).toBeNull();
    expect(parseGuestMatchEmail('')).toBeNull();
  });

  it('renders a one-shot transactional body with no marketing opt-in', () => {
    const mail = renderGuestMatchEmail({
      matches: [
        {
          slug: 'open-breach',
          title: 'Open Breach Settlement',
          typical_payout: 'Up to $100',
          deadline: '2099-12-01',
          strength: 'possible',
          strengthLabel: 'Possible',
          reasons: [],
          claim_action_type: null,
        },
      ],
      shareUrl: 'https://www.lawsuitai.com/preview?had_data_breach=1',
    });
    expect(mail.subject).toMatch(/match result/i);
    expect(mail.html).toContain('one-time message');
    expect(mail.html).not.toMatch(/unsubscribe|opt in|newsletter/i);
    expect(mail.text).toContain('https://www.lawsuitai.com/preview?had_data_breach=1');
  });

  it('re-runs the match and sends through Resend', async () => {
    const res = await POST(
      new Request('http://localhost/api/match-preview/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'guest@example.com',
          state: 'CA',
          attributes: { had_data_breach: true, bought_consumer_goods: false, used_banking: false, used_streaming: false },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sent.mail?.to).toBe('guest@example.com');
    expect(sent.mail?.html).toContain('Open Breach Settlement');
    const json = (await res.json()) as { ok: boolean; matchCount: number };
    expect(json).toEqual({ ok: true, matchCount: 1 });
  });

  it('rejects a missing JSON content type', async () => {
    const res = await POST(
      new Request('http://localhost/api/match-preview/email', {
        method: 'POST',
        body: JSON.stringify({ email: 'guest@example.com', state: 'CA' }),
      }),
    );
    expect(res.status).toBe(415);
  });
});
