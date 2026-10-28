import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('C7 post-deploy smoke', () => {
  it('covers the public paths and never signs up', () => {
    const spec = read('e2e/smoke.spec.ts');
    for (const path of ['/', '/lawsuits', '/pricing', '/trust', '/login', '/sitemap.xml']) {
      expect(spec).toContain(`'${path}'`);
    }
    expect(spec.toLowerCase()).toContain('official');
    expect(spec).not.toMatch(/signup|signUp|createUser/i);
    const workflow = read('.github/workflows/smoke.yml');
    expect(workflow).toContain('deployment_status');
    expect(workflow).toContain('PLAYWRIGHT_BASE_URL');
  });
});
