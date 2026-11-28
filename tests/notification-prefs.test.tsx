import type { FormEvent, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationPrefs } from '@/components/NotificationPrefs';
import type { Profile } from '@/lib/types';

// The web suite runs in Node. Keep the form's initial state and call its submit
// handler directly to verify what the form sends to the settings API.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: <T,>(initial: T | (() => T)) => [
    typeof initial === 'function' ? (initial as () => T)() : initial,
    vi.fn(),
  ],
}));

afterEach(() => vi.unstubAllGlobals());

async function submitSettings(alertsRequireMembership: boolean, emailOptIn: boolean) {
  const profile = { full_name: 'Ada', email_opt_in: emailOptIn, email_frequency: 'weekly' } as Profile;
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false }, { status: 400 }));
  vi.stubGlobal('fetch', request);
  const form: ReactElement<{ onSubmit: (e: FormEvent) => Promise<void> }> =
    NotificationPrefs({ profile, alertsRequireMembership });
  await form.props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent);
  const [path, options] = request.mock.calls[0];
  expect(path).toBe('/api/settings');
  return JSON.parse(options?.body as string);
}

describe('web notification preferences', () => {
  it.each([true, false])('leaves the locked email preference (%s) untouched when saving details', async (optIn) => {
    const payload = await submitSettings(true, optIn);
    expect(payload.full_name).toBe('Ada');
    expect(payload).not.toHaveProperty('email_opt_in');
    expect(payload).not.toHaveProperty('email_frequency');
  });

  it.each([true, false])('still sends the actual choice (%s) when alerts are available', async (optIn) => {
    expect(await submitSettings(false, optIn)).toMatchObject({ email_opt_in: optIn, email_frequency: 'weekly' });
  });
});
