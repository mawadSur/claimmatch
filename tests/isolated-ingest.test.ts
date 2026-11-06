import { describe, expect, it } from 'vitest';
import { eventsFromPostData } from '../e2e/isolated/ingest';

describe('isolated ingest parser', () => {
  it('reads a PostHog capture object', () => {
    const rows = eventsFromPostData(
      JSON.stringify({
        event: 'signup_completed',
        properties: { evidence: 'session_after_signup', cm_traffic_kind: 'test' },
      }),
    );
    expect(rows).toEqual([
      {
        event: 'signup_completed',
        properties: { evidence: 'session_after_signup', cm_traffic_kind: 'test' },
      },
    ]);
  });

  it('reads a batch array', () => {
    const rows = eventsFromPostData(
      JSON.stringify({
        batch: [{ event: 'profile_completed', properties: { evidence: 'onboarding_saved' } }],
      }),
    );
    expect(rows[0]?.event).toBe('profile_completed');
  });
});
