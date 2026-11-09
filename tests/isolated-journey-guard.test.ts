import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('isolated journey is not production E2E', () => {
  it('the fixture binds loopback only and the runner refuses real hosts', () => {
    const backend = read('scripts/isolated-backend.mjs');
    expect(backend).toContain("process.env.ISOLATED_BACKEND_HOST || '127.0.0.1'");
    expect(backend).toContain('refusing to bind a non-loopback host');
    expect(backend).toContain('isolated-admin.claimmatch.test');
    const runner = read('scripts/run-isolated-journey.sh');
    expect(runner).toContain('supabase.co');
    expect(runner).toContain('refusing to point the isolated runner at a real host');
    expect(runner).toContain('ISOLATED_JOURNEY=1');
    expect(runner).toContain('already in use');
    expect(runner).toContain('PANEL_TRUST_COPY_ENABLED=1');
    expect(runner).toContain('CATALOG_VALUE_RANK_ENABLED=1');
    expect(runner).toContain('SETTLEMENT_QUIZ_ENABLED=1');
    expect(runner).toContain('Production leaves these unset');
  });

  it('post-deploy smoke cannot load authenticated isolated specs', () => {
    const playwright = read('playwright.config.ts');
    expect(playwright).toContain("testIgnore: process.env.ISOLATED_JOURNEY ? [] : ['**/isolated/**']");
    const spec = read('e2e/isolated/journey-authenticated.spec.ts');
    expect(spec).toContain("test.skip(!process.env.ISOLATED_JOURNEY");
    expect(spec).toContain('Not production E2E');
  });

  it('CI verify runs the isolated journey and smoke stays read-only', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('bash scripts/run-isolated-journey.sh');
    expect(ci).not.toContain('lawsuitai.org');
    const smoke = read('.github/workflows/smoke.yml');
    expect(smoke).toContain('e2e/smoke.spec.ts');
    expect(smoke).toContain('e2e/journey-public.spec.ts');
    expect(smoke).not.toMatch(/e2e\/isolated/);
  });
});
