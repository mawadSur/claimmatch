import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));

import { POST as authorize } from '@/app/api/filing/authorize/route';
import { GET as claimsExport } from '@/app/api/admin/claims-export/route';
import { authorizedClaimsToCsv } from '@/lib/administrators/export';
import { AUTHORIZATION_TEXT_V1, AUTHORIZATION_VERSION, authorizationText, clientIp } from '@/lib/filing/authorization';
import { assistedFilingAllowed, filingStatusLabel } from '@/lib/filing/queue';
import { renderFilingReceiptEmail } from '@/lib/filing/receipt';
import { makeLawsuit } from './helpers';

// Phase 0 of one-click filing (docs/designs/one-click-filing.md, repoMap
// section 4): the legacy assisted-filing path is retired and its bugs closed.

afterEach(() => {
  vi.unstubAllEnvs();
});

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
function filesUnder(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(rel) : /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

/** The legacy filing files and the channel code (other areas' files are theirs to check). */
const LEGACY_AND_CHANNELS = () => [
  'src/lib/filing/queue.ts',
  'src/lib/filing/authorization.ts',
  'src/lib/filing/receipt.ts',
  'src/lib/filing/v2/jobs.ts',
  ...filesUnder('src/lib/filing/channels'),
  ...filesUnder('src/lib/administrators'),
];

describe('assisted filing flag and the per-settlement marker', () => {
  it('stays off unless the flag is exactly 1 and the settlement itself allows it', () => {
    const allowed = makeLawsuit({}, { assisted_filing_allowed: true });
    const notAllowed = makeLawsuit({}, { assisted_filing_allowed: false });
    expect(assistedFilingAllowed(allowed)).toBe(false);
    vi.stubEnv('ASSISTED_FILING_ENABLED', 'true');
    expect(assistedFilingAllowed(allowed)).toBe(false);
    vi.stubEnv('ASSISTED_FILING_ENABLED', '1');
    expect(assistedFilingAllowed(allowed)).toBe(true);
    expect(assistedFilingAllowed(notAllowed)).toBe(false);
    expect(assistedFilingAllowed(makeLawsuit({}))).toBe(false);
    expect(assistedFilingAllowed(null)).toBe(false);
    expect(assistedFilingAllowed(allowed, false)).toBe(false);
  });
});

describe('the retired assisted path', () => {
  it('answers 410 on /api/filing/authorize and stores nothing', async () => {
    const res = await authorize();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'gone' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 410 on the old claims export (it trusted forgeable rows and logged nothing)', async () => {
    const res = await claimsExport();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'gone' });
  });

  it('has no browser worker: the Playwright/Browserbase option and the queue drain are gone', () => {
    expect(existsSync(join(root, 'src/lib/filing/worker.ts'))).toBe(false);
    const queue = source('src/lib/filing/queue.ts');
    expect(queue).not.toMatch(/processFilingQueue|fillAndSubmit|createFilingWorker/);
    for (const file of LEGACY_AND_CHANNELS()) {
      expect(source(file), file).not.toMatch(/\b(?:playwright|browserbase|puppeteer)\b/i);
    }
  });

  it('never treats a CAPTCHA as something a member is asked to do', () => {
    // 'captcha' survives only as a known challenge of an official form, which is a hard stop.
    for (const file of LEGACY_AND_CHANNELS()) {
      expect(source(file), file).not.toMatch(/['"]captcha['"]/);
    }
    expect(source('src/lib/filing/v2/contract-spec.ts')).toMatch(/OFFICIAL_FORM_CHALLENGES = \['captcha'/);
  });

  it('stops draining the old queue from the daily cron', () => {
    const daily = source('src/app/api/cron/daily/route.ts');
    expect(daily).not.toMatch(/processFilingQueue|@\/lib\/filing\/queue/);
    expect(daily).toMatch(/flags\.oneClickFiling\(\)/);
  });
});

describe('authorization text', () => {
  it('stores a versioned full text and never says Lawsuit AI files for the user', () => {
    expect(AUTHORIZATION_VERSION).toBe('v1');
    expect(authorizationText()).toBe(AUTHORIZATION_TEXT_V1);
    expect(AUTHORIZATION_TEXT_V1).toMatch(/I authorize Lawsuit AI/);
    expect(AUTHORIZATION_TEXT_V1.toLowerCase()).not.toMatch(/we file|on your behalf|receipt number/);
  });

  it('reads the first forwarded IP', () => {
    const req = new Request('https://claimmatch.test/api/filing/authorize', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'TestAgent' },
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });
});

describe('legacy export cells', () => {
  it('keeps a value that starts like a spreadsheet formula as text', () => {
    const csv = authorizedClaimsToCsv([
      {
        claim_id: 'c1',
        user_id: 'u1',
        lawsuit_id: 'l1',
        lawsuit_title: '=HYPERLINK("https://evil.example")',
        authorization_version: 'v1',
        authorized_at: '2026-10-28T00:00:00.000Z',
        full_name: '@SUM(A1)',
        email: 'ada@example.com',
        phone: '+1 555 0100',
        state: 'NY',
        zip: '10001',
        address_line1: '-1 Main',
        address_line2: null,
        city: 'New York',
      },
    ]);
    const row = csv.split('\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(row).toContain("'@SUM(A1)");
    expect(row).toContain("'+1 555 0100");
    expect(row).toContain("'-1 Main");
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
    expect(html).toContain('Lawsuit AI');
    expect(html).not.toContain('ClaimMatch');
    expect(html.toLowerCase()).not.toMatch(/receipt number|we file|on your behalf/);
  });
});
