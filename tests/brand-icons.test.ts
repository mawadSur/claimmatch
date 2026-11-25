import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('brand icons', () => {
  it('ships app/icon, apple-icon, and a navy+OG favicon', () => {
    const icon = read('src/app/icon.tsx');
    const apple = read('src/app/apple-icon.tsx');
    const svg = read('public/favicon.svg');
    const layout = read('src/app/layout.tsx');
    expect(icon).toContain('BrandScaleGlyph');
    expect(icon).toContain('width: 32');
    expect(apple).toContain('width: 180');
    expect(svg).toContain('#0F243C');
    expect(svg).toContain('#5B21B6');
    expect(layout).toContain('/favicon.svg');
    expect(layout).toContain('/apple-icon');
  });
});
