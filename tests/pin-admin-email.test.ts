import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAPER_FALLBACK_DAYS,
  PIN_ADMIN_EMAIL_WAITING_LABEL,
  paperFallbackAfterDays,
  paperFallbackDue,
  paperFormHref,
  pinAdminAdministratorEmail,
  pinAdminStatus,
} from '@/lib/pin-admin-email';
import { pickPaperFallback } from '@/lib/paper-fallback-reminder';

const NOW = new Date('2026-11-27T12:00:00Z');

describe('paperFallbackAfterDays', () => {
  it('defaults to 7 and clamps junk', () => {
    expect(paperFallbackAfterDays(undefined)).toBe(DEFAULT_PAPER_FALLBACK_DAYS);
    expect(paperFallbackAfterDays('0')).toBe(DEFAULT_PAPER_FALLBACK_DAYS);
    expect(paperFallbackAfterDays('8')).toBe(8);
    expect(paperFallbackAfterDays('nope')).toBe(DEFAULT_PAPER_FALLBACK_DAYS);
  });
});

describe('paperFallbackDue', () => {
  it('is false with no request, a notice ID, or before 7 days', () => {
    expect(paperFallbackDue({ now: NOW })).toBe(false);
    expect(
      paperFallbackDue({
        now: NOW,
        pin_admin_email_sent_at: '2026-11-20T12:00:00Z',
        notice_id: 'ABC-1',
      }),
    ).toBe(false);
    expect(paperFallbackDue({ now: NOW, pin_admin_email_sent_at: '2026-11-21T12:00:00Z' })).toBe(false);
  });

  it('is true 7 days after send, or after the request if it never went out', () => {
    expect(paperFallbackDue({ now: NOW, pin_admin_email_sent_at: '2026-11-20T12:00:00Z' })).toBe(true);
    expect(paperFallbackDue({ now: NOW, pin_admin_email_requested_at: '2026-11-01T00:00:00Z' })).toBe(true);
  });
});

describe('pinAdminStatus', () => {
  it('waits after send, then offers paper fallback', () => {
    const waiting = pinAdminStatus({
      now: NOW,
      pin_admin_email_requested_at: '2026-11-25T12:00:00Z',
      pin_admin_email_sent_at: '2026-11-25T12:05:00Z',
    });
    expect(waiting.kind).toBe('waiting');
    expect(waiting.headline).toContain(PIN_ADMIN_EMAIL_WAITING_LABEL);
    expect(waiting.headline).toContain('Nov 25, 2026');

    const paper = pinAdminStatus({
      now: NOW,
      paperFallbackEnabled: true,
      pin_admin_email_requested_at: '2026-11-20T12:00:00Z',
    });
    expect(paper.kind).toBe('paper_fallback');
    expect(paper.headline).toContain('Your notice ID is not on file yet');
    expect(paper.headline).not.toMatch(/no reply|emailed/i);
  });

  it('queues when requested but not sent', () => {
    const queued = pinAdminStatus({
      now: NOW,
      pin_admin_email_requested_at: '2026-11-26T12:00:00Z',
    });
    expect(queued.kind).toBe('queued');
    expect(queued.headline).toContain('Email request saved');
  });
});

describe('pinAdminAdministratorEmail', () => {
  it('builds a sendable letter that says Lawsuit AI is sending it', () => {
    const mail = pinAdminAdministratorEmail({
      title: 'Blue Ridge Rural Water',
      slug: 'blue-ridge-rural-water',
      administrator: 'CBIZ claims@cbiz.com',
      officialHref: 'https://example.test/claim',
      senderName: 'Ada Lovelace',
      senderEmail: 'ada@example.com',
    });
    expect(mail?.to).toBe('claims@cbiz.com');
    expect(mail?.subject).toContain('Blue Ridge Rural Water');
    expect(mail?.text).toContain('Lawsuit AI is writing at the request of');
    expect(mail?.text).toContain('ada@example.com');
    expect(mail?.text).not.toContain('Lawsuit AI did not send this message');
    expect(mail?.text).toContain('does not collect the official site');
  });

  it('returns null without an administrator email', () => {
    expect(
      pinAdminAdministratorEmail({
        title: 'Example',
        slug: 'example',
        senderName: 'Ada',
        senderEmail: 'ada@example.com',
      }),
    ).toBeNull();
  });
});

describe('paperFormHref', () => {
  it('prefers a paper form URL, then the official site', () => {
    expect(paperFormHref({ formUrl: 'https://admin.example/form.pdf', officialHref: 'https://admin.example', slug: 'x' })).toBe(
      'https://admin.example/form.pdf',
    );
    expect(paperFormHref({ officialHref: 'https://admin.example', slug: 'x' })).toBe('https://admin.example');
    expect(paperFormHref({ slug: 'x' })).toBe('/lawsuits/x');
  });
});

describe('pickPaperFallback', () => {
  const base = {
    userId: 'u1',
    email: 'ada@example.com',
    claimId: 'c1',
    slug: 'blue-ridge',
    title: 'Blue Ridge',
    now: NOW,
  };

  it('picks a due claim that has not been emailed yet', () => {
    const picked = pickPaperFallback({
      ...base,
      pin_admin_email_sent_at: '2026-11-20T12:00:00Z',
      alreadySent: false,
    });
    expect(picked?.claimId).toBe('c1');
    expect(picked?.days).toBe(7);
  });

  it('skips when already sent, too soon, or a notice ID is on file', () => {
    expect(pickPaperFallback({ ...base, pin_admin_email_sent_at: '2026-11-20T12:00:00Z', alreadySent: true })).toBeNull();
    expect(pickPaperFallback({ ...base, pin_admin_email_sent_at: '2026-11-26T12:00:00Z', alreadySent: false })).toBeNull();
    expect(
      pickPaperFallback({
        ...base,
        pin_admin_email_sent_at: '2026-11-20T12:00:00Z',
        notice_id: 'N-1',
        alreadySent: false,
      }),
    ).toBeNull();
  });
});
