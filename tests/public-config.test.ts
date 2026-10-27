import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicConfig } from '@/lib/public-config';

afterEach(() => {
  vi.unstubAllEnvs();
});

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('public config', () => {
  it('reads contact, PostHog, and the site URL from env and stays empty when unset', () => {
    const unset = publicConfig({});
    expect(unset.contact.email).toBeNull();
    expect(unset.posthog.key).toBeNull();
    expect(unset.posthog.project).toBeNull();

    vi.stubEnv('NEXT_PUBLIC_CONTACT_EMAIL', 'hello@claimmatch.com');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT', 'ClaimMatch');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://claimmatch.example');
    const set = publicConfig({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
      NEXT_PUBLIC_POSTHOG_PROJECT: 'ClaimMatch',
      NEXT_PUBLIC_SITE_URL: 'https://claimmatch.example',
    });
    expect(set.posthog.project).toBe('ClaimMatch');
    expect(set.siteUrl).toBe('https://claimmatch.example');
  });

  it('keeps Sur Consulting addresses out of public source', () => {
    const banned = /surconsulting|info@surconsultinggroup\.com/i;
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      if (banned.test(readFileSync(file, 'utf8'))) hits.push(path.relative(SRC, file));
    }
    expect(hits).toEqual([]);
  });
});
