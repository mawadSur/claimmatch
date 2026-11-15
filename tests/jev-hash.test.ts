import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJsonOf, sha256Hex, utf8Bytes, utf8Length } from '@/lib/jev/hash';

const node = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches node:crypto at every padding boundary and for long input', () => {
    for (let n = 0; n <= 200; n++) expect(sha256Hex('x'.repeat(n))).toBe(node('x'.repeat(n)));
    const long = Array.from({ length: 50_000 }, (_, i) => String.fromCharCode(32 + (i % 90))).join('');
    expect(sha256Hex(long)).toBe(node(long));
  });

  it('hashes UTF-8 the way node does, lone surrogates included', () => {
    for (const text of ['é', 'é', '😀', '日本語', 'Zoë Lovelace', '\u0000', '\ud800', 'a\udc00b', '\ud83d', '\u{10ffff}', ' ']) {
      expect(sha256Hex(text)).toBe(node(text));
      expect(Array.from(utf8Bytes(text))).toEqual(Array.from(Buffer.from(text, 'utf8')));
      expect(utf8Length(text)).toBe(Buffer.byteLength(text, 'utf8'));
    }
  });
});

describe('canonicalJsonOf', () => {
  it('sorts keys, keeps array order, drops undefined and has no whitespace', () => {
    expect(canonicalJsonOf({ b: 1, a: [3, 1, { d: null, c: 'x' }], u: undefined })).toBe('{"a":[3,1,{"c":"x","d":null}],"b":1}');
    expect(canonicalJsonOf({ Z: 1, a: 2, _: 3 })).toBe('{"Z":1,"_":3,"a":2}');
    expect(canonicalJsonOf(['é', true, 1.5, Number.NaN])).toBe('["é",true,1.5,null]');
    expect(canonicalJsonOf('quote " and \\')).toBe(JSON.stringify('quote " and \\'));
  });

  it('gives the same text whatever order keys were written in', () => {
    expect(canonicalJsonOf({ a: 1, b: { y: 2, x: 1 } })).toBe(canonicalJsonOf({ b: { x: 1, y: 2 }, a: 1 }));
  });
});
