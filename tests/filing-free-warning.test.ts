import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FILING_FREE_WARNING } from '@/lib/copy';
import PricingPage from '@/app/pricing/page';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('C1 filing-free warning', () => {
  it('is the planned sentence and is not the old “never have to pay” line', () => {
    expect(FILING_FREE_WARNING).toBe(
      'Filing on the official site is always free. Be careful with anyone who says you must pay to file or to get your money.',
    );
    expect(FILING_FREE_WARNING.toLowerCase()).not.toMatch(/never have to pay/);
  });

  it('renders on / and /pricing from the shared constant', () => {
    expect(read('src/app/page.tsx')).toContain('FILING_FREE_WARNING');
    expect(read('src/app/pricing/page.tsx')).toContain('FILING_FREE_WARNING');
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain(FILING_FREE_WARNING);
  });
});
