import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closingSoonEmailGate,
  isVerifiedSender,
  pickClosingSoonEmailRows,
} from '@/lib/closing-soon-email';
import { renderClosingSoonEmail, sendClosingSoonEmail } from '@/lib/email';
import { makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const verified = {
  verified_at: '2026-10-20T12:00:00Z',
  eligibility_verified: 'People who bought the product.',
  proof_verified: 'no' as const,
  administrator: 'Example Admin',
};

describe('closing-soon email gate', () => {
  it('refuses unless the flag is exactly 1, with a postal address and verified sender', () => {
    expect(isVerifiedSender('ClaimMatch <onboarding@resend.dev>')).toBe(false);
    expect(isVerifiedSender('ClaimMatch <hello@claimmatch.com>')).toBe(true);
    expect(closingSoonEmailGate({}).reason).toBe('flag_off');
    expect(closingSoonEmailGate({ CLOSING_SOON_EMAIL_ENABLED: 'true' }).reason).toBe('flag_off');

    vi.stubEnv('NEXT_PUBLIC_POSTAL_ADDRESS', '1 Main St, City, ST 00000');
    expect(
      closingSoonEmailGate({
        CLOSING_SOON_EMAIL_ENABLED: '1',
        RESEND_FROM: 'ClaimMatch <hello@claimmatch.com>',
      }).reason,
    ).toBe('missing_resend_key');

    expect(
      closingSoonEmailGate({
        CLOSING_SOON_EMAIL_ENABLED: '1',
        RESEND_FROM: 'ClaimMatch <hello@claimmatch.com>',
        RESEND_API_KEY: 're_test',
      }).ok,
    ).toBe(true);
  });

  it('picks only verified rows with a deadline in the next 14 days', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    const rows = [
      makeLawsuit({}, { ...verified, title: 'Soon', deadline: '2026-11-05' }),
      makeLawsuit({}, { ...verified, title: 'Far', deadline: '2027-01-01' }),
      makeLawsuit({}, { title: 'Unverified', deadline: '2026-11-05' }),
    ];
    expect(pickClosingSoonEmailRows(rows, now).map((r) => r.title)).toEqual(['Soon']);
  });
});

describe('closing-soon email send', () => {
  it('never sends when the flag is off, even if Resend is configured', async () => {
    const send = vi.fn();
    vi.doMock('resend', () => ({ Resend: class { emails = { send }; } }));
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM', 'ClaimMatch <hello@claimmatch.com>');
    vi.stubEnv('NEXT_PUBLIC_POSTAL_ADDRESS', '1 Main St');
    await sendClosingSoonEmail('jane@example.com', {
      items: [{ title: 'Soon', slug: 'soon', deadline: '2026-11-05' }],
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('renders an unsubscribe link and the postal address, with no match language', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTAL_ADDRESS', '1 Main Street\nCity, ST 00000');
    const html = renderClosingSoonEmail({
      name: 'Jane',
      to: 'jane@example.com',
      items: [{ title: 'Amazon Return Policy Settlement', slug: 'amazon', deadline: '2026-11-05' }],
    });
    expect(html).toContain('Amazon Return Policy Settlement');
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('1 Main Street');
    expect(html).not.toMatch(/\bmatch/i);
    expect(html).toContain('ClaimMatch never files for you');
  });
});
