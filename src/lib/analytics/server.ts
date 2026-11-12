/**
 * Best-effort PostHog capture from cron and API routes. No-ops without a key
 * and never runs in tests. Properties must stay free of email and other PII.
 */
import { createHash } from 'crypto';

export function subscriberDistinctId(email: string): string {
  const hash = createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
  return `sub:${hash.slice(0, 24)}`;
}

export async function captureServerEvent(input: {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return false;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
  try {
    const res = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: input.event,
        distinct_id: input.distinctId,
        properties: { ...(input.properties ?? {}), $lib: 'claimmatch-server' },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
