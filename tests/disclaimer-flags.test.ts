import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAIM_AGENT_LEGAL_SENTENCE } from '@/lib/copy';
import { claimAppLegalDisclaimer, claimLegalDisclaimer } from '@/lib/disclaimer-flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('claimAppLegalDisclaimer', () => {
  it('uses agent sentence on app when one-click is on', () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    expect(claimAppLegalDisclaimer(true)).toContain(CLAIM_AGENT_LEGAL_SENTENCE);
    expect(claimLegalDisclaimer(true)).toContain(CLAIM_AGENT_LEGAL_SENTENCE);
  });
});
