import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('public site URL leftovers', () => {
  it('uses lawsuitai.org as the SITE.url fallback and scraper user agent', () => {
    expect(read('src/lib/utils.ts')).toContain("'https://lawsuitai.org'");
    expect(read('src/lib/utils.ts')).not.toContain('claimmatch.vercel.app');
    expect(read('src/lib/scraper/sources/settlesignal.ts')).toContain(
      'ClaimMatchBot/1.0 (+https://lawsuitai.org)',
    );
    expect(read('src/lib/scraper/sources/settlesignal.ts')).not.toContain('claimmatch.vercel.app');
    expect(read('src/components/AuthForm.tsx')).toContain('SITE.url');
    expect(read('src/components/AuthForm.tsx')).toContain('/auth/callback');
  });
});
