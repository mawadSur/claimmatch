import { describe, expect, it } from 'vitest';
import {
  emailMatchCandidates,
  encodeUnsubscribeToken,
  isPlausibleEmail,
  maskEmail,
  parseUnsubscribeToken,
  unsubscribePageUrl,
} from '@/lib/unsubscribe';
import { unsubscribeUrl } from '@/lib/email';

const BULLETS = String.fromCodePoint(0x2022).repeat(3);

/** What every email sent before this change carried (old email.ts encoder). */
function legacyToken(email: string): string {
  return Buffer.from(email).toString('base64url');
}

function standardBase64(email: string): string {
  return Buffer.from(email).toString('base64');
}

function expectEmail(raw: unknown, email: string) {
  expect(parseUnsubscribeToken(raw)).toEqual({ ok: true, kind: 'unsigned-v0', email });
}

function expectError(raw: unknown, error: string) {
  expect(parseUnsubscribeToken(raw)).toEqual({ ok: false, error });
}

describe('encodeUnsubscribeToken', () => {
  it.each([
    'jane@example.com',
    'Jane.Doe+claims@Example.com',
    'élodie@exemple.fr',
    '用户@例子.广告',
    'a~~?@example.com',
    '???@example.com',
  ])('matches the legacy Buffer base64url encoding for %s', (email) => {
    expect(encodeUnsubscribeToken(email)).toBe(legacyToken(email));
  });
});

describe('parseUnsubscribeToken: valid tokens', () => {
  it.each([
    'jane@example.com',
    'Jane.Doe+claims@Example.com',
    'élodie@exemple.fr',
    '用户@例子.广告',
    "o'brien@example.ie",
  ])('round-trips %s', (email) => {
    expectEmail(encodeUnsubscribeToken(email), email);
  });

  it('reads the link the current email footer builds', () => {
    const email = 'Jane.Doe+claims@Example.com';
    const url = new URL(unsubscribeUrl(email));
    expect(url.pathname).toBe('/unsubscribe');
    expectEmail(url.searchParams.get('e'), email);
  });

  it('reads tokens from emails already sent (old encoder)', () => {
    expectEmail(legacyToken('someone@example.org'), 'someone@example.org');
  });

  it('keeps the address exactly as encoded (no lowercasing)', () => {
    expectEmail(encodeUnsubscribeToken('MiXeD@Example.COM'), 'MiXeD@Example.COM');
  });
});

describe('parseUnsubscribeToken: padding and transport variants', () => {
  // 'Jane@Example.com' is 16 bytes, so standard base64 ends in '=='.
  const email = 'Jane@Example.com';
  const bare = legacyToken(email);

  it('accepts no padding, one or two', () => {
    expect(bare.endsWith('=')).toBe(false);
    expectEmail(bare, email);
    expectEmail(`${bare}==`, email);
    expectEmail(standardBase64(email), email);
  });

  it('accepts one "=" where two belong', () => {
    expectEmail(`${bare}=`, email);
  });

  it('rejects three "="', () => {
    expectError(`${bare}===`, 'malformed');
  });

  it('accepts padding that was percent-encoded twice', () => {
    expectEmail(`${bare}%3D%3D`, email);
  });

  it('accepts the standard alphabet ("+" and "/")', () => {
    for (const e of ['a~~?@example.com', '???@example.com']) {
      const std = standardBase64(e);
      expect(std).toMatch(/[+/]/);
      expectEmail(std, e);
    }
  });

  it('accepts a "+" that a query-string decoder turned into a space', () => {
    const e = 'a~~?@example.com';
    const mangled = standardBase64(e).replace(/\+/g, ' ');
    expect(mangled).toContain(' ');
    expectEmail(mangled, e);
  });

  it('ignores surrounding whitespace and line breaks inside', () => {
    expectEmail(`  ${bare}\n`, email);
    expectEmail(`${bare.slice(0, 8)}\r\n${bare.slice(8)}`, email);
  });

  it('trims whitespace encoded inside the token', () => {
    expectEmail(encodeUnsubscribeToken(`  ${email} `), email);
  });
});

describe('parseUnsubscribeToken: invalid tokens', () => {
  it.each([undefined, null, 42, {}, ['x']])('treats %j as missing', (raw) => {
    expectError(raw, 'missing');
  });

  it.each(['', '   ', '\n'])('treats %j as missing', (raw) => {
    expectError(raw, 'missing');
  });

  it('rejects characters outside base64', () => {
    expectError('not base64!', 'malformed');
    expectError('abc$def', 'malformed');
    expectError('ab=cd', 'malformed');
  });

  it('rejects an impossible length', () => {
    expectError('abcde', 'malformed');
  });

  it('rejects broken percent-encoding', () => {
    expectError('abc%E0%A4%A', 'malformed');
  });

  it('rejects bytes that are not UTF-8', () => {
    const token = Buffer.from([0xff, 0xfe, 0x40, 0x61, 0x2e, 0x63, 0x6f]).toString('base64url');
    expectError(token, 'malformed');
  });

  it('reports signed-looking tokens as unsupported for now', () => {
    expectError(`v1.${legacyToken('jane@example.com')}.c2ln`, 'unsupported');
  });

  it('rejects very long tokens before decoding', () => {
    expectError('A'.repeat(401), 'too_long');
  });

  it.each([
    'hello world',
    'jane',
    'jane@',
    '@example.com',
    'jane@example',
    'jane@@example.com',
    'jane doe@example.com',
    'jane,doe@example.com',
    'jane(doe)@example.com',
    '"jane"@example.com',
    'jane@exa mple.com',
    `jane@example.com${String.fromCharCode(0)}`,
    `${'a'.repeat(250)}@example.com`,
  ])('rejects a token that decodes to %j', (decoded) => {
    expectError(encodeUnsubscribeToken(decoded), 'not_an_email');
  });
});

describe('isPlausibleEmail', () => {
  it('accepts ordinary and international addresses', () => {
    expect(isPlausibleEmail('jane@example.com')).toBe(true);
    expect(isPlausibleEmail('jane.doe+x@sub.example.co.uk')).toBe(true);
    expect(isPlausibleEmail('élodie@exemple.fr')).toBe(true);
  });

  it('rejects control characters', () => {
    expect(isPlausibleEmail(`jane${String.fromCharCode(7)}@example.com`)).toBe(false);
    expect(isPlausibleEmail(`jane${String.fromCharCode(0x7f)}@example.com`)).toBe(false);
  });

  it('caps the length at 254', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(254 - 64 - 1 - 4)}.com`;
    expect(isPlausibleEmail(`${local}@${domain}`)).toBe(true);
    expect(isPlausibleEmail(`${local}a@${domain}`)).toBe(false);
  });
});

describe('maskEmail', () => {
  it('keeps one character of a short local part', () => {
    expect(maskEmail('jane@example.com')).toBe(`j${BULLETS}@example.com`);
    expect(maskEmail('a@b.co')).toBe(`a${BULLETS}@b.co`);
  });

  it('keeps two characters of a longer local part', () => {
    expect(maskEmail('jonathan@example.com')).toBe(`jo${BULLETS}@example.com`);
  });

  it('lowercases the domain only', () => {
    expect(maskEmail('Mixed.Case@Example.COM')).toBe(`Mi${BULLETS}@example.com`);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(maskEmail('élodie@exemple.fr')).toBe(`él${BULLETS}@exemple.fr`);
    expect(maskEmail('😀abc@example.com')).toBe(`😀${BULLETS}@example.com`);
  });

  it('never shows the hidden part or its length', () => {
    const short = maskEmail('ab@x.com');
    const long = maskEmail('abcdefghijklmnop@x.com');
    expect(long).not.toContain('cdefghijklmnop');
    expect(short.length).toBe(`a${BULLETS}@x.com`.length);
    expect(long.length).toBe(`ab${BULLETS}@x.com`.length);
  });

  it('masks anything that is not an address entirely', () => {
    expect(maskEmail('nope')).toBe(BULLETS);
    expect(maskEmail('@example.com')).toBe(BULLETS);
    expect(maskEmail('jane@')).toBe(BULLETS);
  });
});

describe('emailMatchCandidates', () => {
  it('tries the address as sent and its lowercase form', () => {
    expect(emailMatchCandidates('Jane@Example.com')).toEqual([
      'Jane@Example.com',
      'jane@example.com',
    ]);
  });

  it('does not repeat an address that is already lowercase', () => {
    expect(emailMatchCandidates('jane@example.com')).toEqual(['jane@example.com']);
  });
});

describe('unsubscribePageUrl', () => {
  it('builds the confirm-page link for an email footer', () => {
    const url = unsubscribePageUrl('jane@example.com', 'https://claimmatch.test/');
    expect(url).toBe(`https://claimmatch.test/unsubscribe?e=${legacyToken('jane@example.com')}`);
  });

  it('is what email.ts puts in footers', () => {
    expect(unsubscribeUrl('jane@example.com')).toBe(unsubscribePageUrl('jane@example.com'));
  });
});
