import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('legacy /settlements redirects', () => {
  const config = read('next.config.mjs');

  it('308s /settlements to /lawsuits and /settlements/:slug to /lawsuits/:slug', () => {
    expect(config).toContain("source: '/settlements'");
    expect(config).toContain("destination: '/lawsuits'");
    expect(config).toContain('statusCode: 308');
    expect(config).toContain("destination: '/lawsuits/:slug'");
  });

  it('does not steal the hub pages that still live under /settlements', () => {
    expect(config).toContain('category');
    expect(config).toContain('closing-soon');
    expect(config).toContain('new');
    expect(config).toContain('recently-closed');
    expect(config).toMatch(
      /:slug\(\(\?!category\|closing-soon\|new\|recently-closed\)\[\^\/\]\+\)/,
    );
  });
});
