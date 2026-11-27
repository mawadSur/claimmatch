import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLAG_CATALOG, listFlagStatus } from '@/lib/flag-catalog';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FLAG_CATALOG', () => {
  it('lists every env var flags.ts reads with on() or equals()', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/lib/flags.ts', import.meta.url)), 'utf8');
    const fromFlags = [...src.matchAll(/\b(?:on|equals|onUnlessOff)\('([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(fromFlags.length).toBeGreaterThan(20);
    expect(FLAG_CATALOG.map((f) => f.env).sort()).toEqual([...new Set(fromFlags)].sort());
  });

  it('reports booleans only, and defaults off except the claim-profile CTAs', () => {
    const status = listFlagStatus();
    expect(status.some((row) => row.env === 'LLMS_TXT_ENABLED')).toBe(true);
    expect(status.some((row) => row.env === 'INDEXNOW_ENABLED')).toBe(true);
    expect(status.some((row) => row.env === 'AI_REFERRER_ATTRIBUTION_ENABLED')).toBe(true);
    const defaultOn = new Set([
      'CLAIM_PROFILE_ENABLED',
      'CLAIM_ACTION_CTAS_ENABLED',
      // Correctness fix, default on: MATCH_SPECIFICITY_GATE_ENABLED=0 rolls it back.
      'MATCH_SPECIFICITY_GATE_ENABLED',
    ]);
    for (const row of status) {
      expect(typeof row.enabled).toBe('boolean');
      expect(row.enabled).toBe(defaultOn.has(row.env));
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

  it('AGENT_AUTH_CURRENT_VERSION reads on for agent-auth-v2 or agent-auth-v3', () => {
    const row = () => listFlagStatus().find((r) => r.env === 'AGENT_AUTH_CURRENT_VERSION')?.enabled;
    expect(row()).toBe(false);
    for (const value of ['1', 'agent-auth-v1', 'AGENT-AUTH-V2', ' agent-auth-v2']) {
      vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', value);
      expect(row()).toBe(false);
    }
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v2');
    expect(row()).toBe(true);
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v3');
    expect(row()).toBe(true);
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
