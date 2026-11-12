import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PUBLIC_BRAND } from '@/lib/utils';
import { resendEnvelope, resendFrom, resendReplyTo } from '@/lib/resend-mail';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resendEnvelope', () => {
  it('uses RESEND_FROM when set and omits reply_to until RESEND_REPLY_TO is set', () => {
    vi.stubEnv('RESEND_FROM', 'LawsuitAI <alerts@lawsuitai.org>');
    vi.stubEnv('RESEND_REPLY_TO', '');
    expect(resendFrom()).toBe('LawsuitAI <alerts@lawsuitai.org>');
    expect(resendReplyTo()).toBeUndefined();
    expect(resendEnvelope()).toEqual({ from: 'LawsuitAI <alerts@lawsuitai.org>' });
  });

  it('adds reply_to when RESEND_REPLY_TO is set', () => {
    vi.stubEnv('RESEND_FROM', 'LawsuitAI <alerts@lawsuitai.org>');
    vi.stubEnv('RESEND_REPLY_TO', ' hello@lawsuitai.org ');
    expect(resendReplyTo()).toBe('hello@lawsuitai.org');
    expect(resendEnvelope()).toEqual({
      from: 'LawsuitAI <alerts@lawsuitai.org>',
      reply_to: 'hello@lawsuitai.org',
    });
  });

  it('falls back to a LawsuitAI onboarding sender', () => {
    vi.stubEnv('RESEND_FROM', '');
    expect(resendFrom()).toBe(`${PUBLIC_BRAND} <onboarding@resend.dev>`);
  });
});

describe('.env.example', () => {
  it('documents the LawsuitAI sender and optional RESEND_REPLY_TO', () => {
    const env = readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8');
    expect(env).toContain('RESEND_FROM="LawsuitAI <alerts@lawsuitai.org>"');
    expect(env).toContain('RESEND_REPLY_TO=hello@lawsuitai.org');
    expect(env).toMatch(/reply_to/i);
  });
});

describe('every Resend send uses the shared envelope', () => {
  const senders = [
    '../src/lib/email.ts',
    '../src/lib/match-alert-email.ts',
    '../src/lib/ingest-alerts.ts',
    '../src/lib/filing/receipt.ts',
  ];

  it('spreads resendEnvelope into every emails.send call', () => {
    for (const relative of senders) {
      const src = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
      expect(src, relative).toContain('...resendEnvelope()');
      expect(src, relative).toContain('emails.send');
      const sends = src.split('emails.send').length - 1;
      const envelopes = src.split('...resendEnvelope()').length - 1;
      expect(envelopes, relative).toBe(sends);
    }
  });
});
