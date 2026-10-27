import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(fileURLToPath(new URL('../src/components/AuthForm.tsx', import.meta.url)), 'utf8');

describe('AuthForm signed-in path', () => {
  it('sends confirmation links to the site URL /auth/callback, not this tab origin', () => {
    expect(src).toContain("SITE.url.replace(/\\/+$/, '')}/auth/callback");
    expect(src).not.toContain('window.location.origin}/auth/callback');
  });

  it('times out a hung sign-in and leaves the login page with a hard navigation', () => {
    expect(src).toContain('AUTH_TIMEOUT_MS');
    expect(src).toContain('This is taking too long');
    expect(src).toContain('window.location.assign');
    expect(src).not.toContain('router.refresh()');
    expect(src).not.toContain('router.push');
  });

  it('shows a loading label on the signup button', () => {
    expect(src).toContain('Creating your account…');
  });
});
