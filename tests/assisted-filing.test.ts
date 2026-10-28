import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHORIZATION_TEXT_V1, AUTHORIZATION_VERSION, authorizationText, clientIp } from '@/lib/filing/authorization';
import { assistedFilingAllowed, filingStatusLabel, processFilingQueue } from '@/lib/filing/queue';
import { renderFilingReceiptEmail } from '@/lib/filing/receipt';
import { MockFilingWorker, PlaywrightFilingWorker, setFilingWorkerFactory } from '@/lib/filing/worker';
import { makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
  setFilingWorkerFactory(null);
});

describe('assisted filing flags and allowlist', () => {
  it('stays off unless the flag is 1 and the settlement is allowlisted', () => {
    const lawsuit = makeLawsuit({}, { assisted_filing_allowed: true });
    expect(assistedFilingAllowed(lawsuit)).toBe(false);
    vi.stubEnv('ASSISTED_FILING_ENABLED', '1');
    expect(assistedFilingAllowed(lawsuit)).toBe(true);
    expect(assistedFilingAllowed(makeLawsuit({}, { assisted_filing_allowed: false }))).toBe(false);
    expect(assistedFilingAllowed(makeLawsuit({}))).toBe(false);
  });
});

describe('authorization text', () => {
  it('stores a versioned full text and never says ClaimMatch files for the user', () => {
    expect(AUTHORIZATION_VERSION).toBe('v1');
    expect(authorizationText()).toBe(AUTHORIZATION_TEXT_V1);
    expect(AUTHORIZATION_TEXT_V1).toMatch(/I authorize ClaimMatch/);
    expect(AUTHORIZATION_TEXT_V1.toLowerCase()).not.toMatch(/we file|on your behalf|receipt number/);
  });

  it('reads the first forwarded IP', () => {
    const req = new Request('https://claimmatch.test/api/filing/authorize', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'TestAgent' },
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });
});

describe('filing worker stub', () => {
  it('never submits an official form', async () => {
    const worker = new PlaywrightFilingWorker();
    const result = await worker.fillAndSubmit({
      jobId: 'job-1',
      claimId: 'claim-1',
      lawsuitId: 'lawsuit-1',
      claimUrl: 'https://admin.example/file',
      mapping: { fields: [{ profileKey: 'full_name', selector: '#name' }] },
      profile: { full_name: 'Ada', email: 'ada@example.com' } as never,
    });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toMatch(/stub/i);
    }
  });

  it('lets tests inject a mock that still never talks to a network', async () => {
    const mock = new MockFilingWorker();
    mock.nextResult = {
      status: 'submitted',
      administratorClaimId: 'ADM-99',
      screenshotUrl: 'stub://screenshot',
    };
    setFilingWorkerFactory(() => mock);
    expect(mock.calls).toHaveLength(0);
    const result = await mock.fillAndSubmit({
      jobId: 'j',
      claimId: 'c',
      lawsuitId: 'l',
      claimUrl: 'https://example.test',
      mapping: {},
      profile: {} as never,
    });
    expect(result).toEqual(mock.nextResult);
  });
});

describe('processFilingQueue', () => {
  it('does nothing while the flag is off', async () => {
    const mock = new MockFilingWorker();
    const out = await processFilingQueue({ worker: mock });
    expect(out).toEqual({ processed: 0, results: [] });
    expect(mock.calls).toHaveLength(0);
  });
});

describe('filing copy', () => {
  it('labels queue states without banned phrases', () => {
    expect(filingStatusLabel('queued')).toBe('Queued');
    expect(filingStatusLabel('needs_user')).toBe('Needs your input');
    expect(filingStatusLabel('submitted')).toBe('Sent to the administrator');
    expect(filingStatusLabel('confirmed')).toBe('Confirmed by the administrator');
    expect(filingStatusLabel('failed')).toBe('Did not go through');
  });

  it('renders a confirmation email with the administrator id', () => {
    const html = renderFilingReceiptEmail({
      to: 'ada@example.com',
      name: 'Ada',
      lawsuitTitle: 'NY Auto Settlement',
      administratorClaimId: 'ADM-42',
      screenshotUrl: 'stub://shot',
    });
    expect(html).toContain('ADM-42');
    expect(html).toContain('Authorized submission confirmation');
    expect(html.toLowerCase()).not.toMatch(/receipt number|we file|on your behalf/);
  });
});
