import { describe, expect, it } from 'vitest';
import { jsonLd } from '@/lib/jsonld';

describe('jsonLd', () => {
  it('cannot be broken out of with a closing script tag', () => {
    const out = jsonLd({ name: 'Acme </script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ name: 'Acme </script><script>alert(1)</script>' });
  });

  it('round-trips line separators and ampersands', () => {
    const value = { text: 'a\u2028b\u2029c & d > e' };
    expect(JSON.parse(jsonLd(value))).toEqual(value);
  });
});
