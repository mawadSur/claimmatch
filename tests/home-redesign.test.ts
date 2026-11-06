import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lawsuit } from '@/lib/types';
import { makeLawsuit } from './helpers';

const catalog = vi.hoisted(() => ({ lawsuits: [] as Lawsuit[], error: false }));

vi.mock('@/lib/lawsuits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lawsuits')>()),
  lookupLawsuits: async () => ({ lawsuits: catalog.lawsuits, error: catalog.error }),
}));

import HomePage from '@/app/page';

afterEach(() => {
  catalog.lawsuits = [];
  catalog.error = false;
  vi.unstubAllEnvs();
});

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const render = async () => renderToStaticMarkup(await HomePage());

/** Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): { width: number; height: number } {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`not a WebP file (chunk ${chunk})`);
}

describe('home page redesign', () => {
  it('no longer shows "Not a law firm", and keeps the trust lines that are true', async () => {
    const html = await render();
    expect(html).not.toMatch(/not a law firm/i);
    expect(html).toContain('We never handle settlement payments');
    expect(html).toContain('You file on the official site');
  });

  it('walks through four real app screens and says the account is a sample', async () => {
    const html = await render();
    for (const title of [
      'Find an open settlement',
      'Check who qualifies',
      'File on the official site',
      'Keep track of every claim',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('the account details are a sample');
    expect(html).toContain('id="how-it-works"');
  });

  it('shows live counts only when the catalog loaded', async () => {
    catalog.lawsuits = [
      makeLawsuit({ proof: 'no' }, { id: 'a', slug: 'a', deadline: '2099-01-10' }),
      makeLawsuit({ proof: 'yes' }, { id: 'b', slug: 'b', deadline: '2099-02-10' }),
    ];
    expect(await render()).toContain('Live from the catalog');

    catalog.error = true;
    const failed = await render();
    expect(failed).not.toContain('Live from the catalog');
    expect(failed).toContain('We couldn’t load settlements right now.');

    catalog.error = false;
    catalog.lawsuits = [];
    expect(await render()).not.toContain('Live from the catalog');
  });

  it('uses no match language with the default flags', async () => {
    catalog.lawsuits = [makeLawsuit({}, { deadline: '2099-01-10' })];
    expect(await render()).not.toMatch(/\bmatch(?:ed|es|ing)?\b/i);
  });

  it('adds the logged-out preview entry only when MATCH_PREVIEW_ENABLED=1', async () => {
    expect(await render()).not.toContain('See matching settlements');
    vi.stubEnv('MATCH_PREVIEW_ENABLED', '1');
    expect(await render()).toContain('See matching settlements');
    expect(await render()).toContain('href="/preview"');
  });

  it('every screenshot it references exists, at the size the page declares', () => {
    const src = readFileSync(root('src/app/page.tsx'), 'utf8');
    const screens = [...src.matchAll(/src: '(\/screens\/[^']+\.webp)',\s*width: (\d+),\s*height: (\d+)/g)];
    expect(screens.length).toBeGreaterThanOrEqual(5);
    for (const [, file, width, height] of screens) {
      const path = root(`public${file}`);
      expect(existsSync(path), file).toBe(true);
      expect(webpSize(readFileSync(path)), file).toEqual({ width: Number(width), height: Number(height) });
    }
  });
});
