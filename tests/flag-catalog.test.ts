import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG_CATALOG, listFlagStatus } from '@/lib/flag-catalog';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FLAG_CATALOG', () => {
  it('lists every env var flags.ts reads with on()', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/lib/flags.ts', import.meta.url)), 'utf8');
    const fromFlags = [...src.matchAll(/\bon\('([A-Z0-9_]+)'\)/g)].map((m) => m[1]);
    expect(fromFlags.length).toBeGreaterThan(20);
    expect(FLAG_CATALOG.map((f) => f.env).sort()).toEqual([...new Set(fromFlags)].sort());
  });

  it('reports booleans only, and defaults off', () => {
    const status = listFlagStatus();
    expect(status.some((row) => row.env === 'LLMS_TXT_ENABLED')).toBe(true);
    expect(status.some((row) => row.env === 'INDEXNOW_ENABLED')).toBe(true);
    expect(status.some((row) => row.env === 'AI_REFERRER_ATTRIBUTION_ENABLED')).toBe(true);
    for (const row of status) {
      expect(typeof row.enabled).toBe('boolean');
      expect(row.enabled).toBe(false);
      expect(row.env).not.toMatch(/KEY|SECRET|TOKEN/i);
      expect(JSON.stringify(row)).not.toMatch(/sk-|re_|eyJ/);
    }
  });

  it('flips a flag on only when the env var is exactly 1', () => {
    vi.stubEnv('LLMS_TXT_ENABLED', '1');
    vi.stubEnv('INDEXNOW_KEY', 'super-secret-indexnow-key');
    const llms = listFlagStatus().find((row) => row.env === 'LLMS_TXT_ENABLED');
    expect(llms?.enabled).toBe(true);
    expect(JSON.stringify(listFlagStatus())).not.toContain('super-secret-indexnow-key');
  });
});

describe('/admin/flags page', () => {
  it('is admin-gated, read-only, and does not print secret env values', async () => {
    const src = readFileSync(fileURLToPath(new URL('../src/app/admin/flags/page.tsx', import.meta.url)), 'utf8');
    expect(src).toContain('requireAdmin');
    expect(src).toContain('listFlagStatus');
    expect(src).not.toMatch(/process\.env\.[A-Z0-9_]*KEY/);
    expect(src).not.toContain('INDEXNOW_KEY');
  });
});
