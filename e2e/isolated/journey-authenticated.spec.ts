import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasEvent,
  interceptAnalytics,
  interceptOfficialForm,
  recordApi,
  type CapturedEvent,
  type IngestHit,
} from './ingest';

/**
 * Authenticated product path against the isolated fixture backend.
 * Real Next.js UI + mocked GoTrue/PostgREST + intercepted /ingest.
 * Not production E2E. Never hits lawsuitai.org, never sends email,
 * never submits an administrator form.
 */

test.skip(!process.env.ISOLATED_JOURNEY, 'needs the isolated fixture runner');

const ARTIFACTS = process.env.ARTIFACTS_DIR || '/opt/cursor/artifacts';
const FIXTURE_TITLE = 'Isolated Fixture Data Breach Settlement';
const PASSWORD = 'isolated-pass-ok';

async function shot(page: Page, name: string) {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS, name), fullPage: true });
}

async function runJourney(page: Page, label: 'desktop' | 'mobile') {
  const events: CapturedEvent[] = [];
  const ingestHits: IngestHit[] = [];
  const network: string[] = [];
  await interceptAnalytics(page, events, ingestHits);
  await interceptOfficialForm(page);
  page.on('request', recordApi(network));

  const email = `journey+${label}+${Date.now()}@isolated.test`;

  await page.goto('/signup');
  await expect(page.locator('#email')).toBeVisible();
  await shot(page, `journey-${label}-01-signup.png`);

  await page.locator('#full_name').fill('Isolated Journey');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create my account' }).click();

  await page.waitForURL(/\/onboarding/, { timeout: 20_000 });
  expect(network.some((row) => row.includes('POST') && row.includes('/auth/v1/signup'))).toBeTruthy();
  await shot(page, `journey-${label}-02-onboarding.png`);

  await page.locator('#onboarding-name').fill('Isolated Journey');
  await page.locator('#onboarding-state').selectOption('CA');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#onboarding-had_data_breach').check();
  await page.getByRole('button', { name: /save and continue/i }).click();

  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /your matches/i })).toBeVisible();
  await expect(page.getByText(FIXTURE_TITLE).first()).toBeVisible();
  await expect(page.getByText(/strong match/i).first()).toBeVisible();
  await shot(page, `journey-${label}-03-dashboard-match.png`);

  await page.getByRole('link', { name: /how to file/i }).first().click();
  await page.waitForURL(/\/claim\/isolated-fixture-data-breach/);
  await expect(page.getByRole('link', { name: /open the official claim form/i })).toBeVisible();
  await shot(page, `journey-${label}-04-claim-intent.png`);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: /open the official claim form/i }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toContain('isolated-admin.claimmatch.test');
  await expect(popup.locator('body')).toContainText(/nothing was submitted/i);
  await popup.close();

  await page.getByRole('button', { name: /not yet: save to my claims/i }).click();
  await expect(page.getByText(/saved to your claims/i)).toBeVisible({ timeout: 15_000 });
  expect(network.some((row) => row.includes('POST') && row.includes('/api/claims'))).toBeTruthy();
  await shot(page, `journey-${label}-05-saved-progress.png`);

  await page.getByRole('button', { name: /i filed my claim/i }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Reported filed by you$/ })).toBeVisible({
    timeout: 15_000,
  });
  expect(network.some((row) => row.includes('PATCH') && row.includes('/api/claims/'))).toBeTruthy();
  await shot(page, `journey-${label}-06-reported-filed.png`);

  await page.goto('/dashboard');
  await expect(page.getByText(FIXTURE_TITLE).first()).toBeVisible();
  await expect(page.getByText(/reported filed/i).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, `journey-${label}-07-dashboard-filed.png`);

  const clientEvents = await page
    .evaluate(() => {
      try {
        return JSON.parse(sessionStorage.getItem('__cmEvents') || '[]') as CapturedEvent[];
      } catch {
        return [] as CapturedEvent[];
      }
    })
    .catch(() => [] as CapturedEvent[]);
  for (const row of clientEvents) {
    if (!events.some((e) => e.event === row.event)) events.push(row);
  }

  const evidence = {
    mocked: ['GoTrue', 'PostgREST', 'claim RPCs', 'official form HTML', 'PostHog /ingest'],
    real: ['Next.js UI', 'browser clicks', 'session cookies', '/api/claims routes'],
    production_e2e: false,
    email,
    events,
    clientEvents,
    ingestHits,
    network,
  };
  writeFileSync(join(ARTIFACTS, `journey-${label}-evidence.json`), JSON.stringify(evidence, null, 2));

  const seen = (name: string) =>
    hasEvent(events, name) || ingestHits.some((h) => (h.body || h.url || '').includes(name));
  expect(seen('signup_completed'), `signup_completed missing; ingestHits=${ingestHits.length}`).toBeTruthy();
  expect(seen('profile_completed'), 'profile_completed').toBeTruthy();
  expect(seen('matches_viewed'), 'matches_viewed').toBeTruthy();
  expect(seen('official_form_opened'), 'official_form_opened').toBeTruthy();
  expect(seen('claim_reported_filed'), 'claim_reported_filed').toBeTruthy();

  return { events, network, email };
}

test.describe('isolated authenticated journey', () => {
  test.describe.configure({ timeout: 120_000 });

  test('desktop: signup through self-reported filing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const result = await runJourney(page, 'desktop');
    expect(result.email).toMatch(/@isolated\.test$/);
  });

  test('mobile: signup through self-reported filing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const result = await runJourney(page, 'mobile');
    expect(result.email).toMatch(/@isolated\.test$/);
  });

  test('public browsing needs no account (site fact vs buyer assumption)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await interceptAnalytics(page, []);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'See open settlements' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'See open settlements' }).first().click();
    await expect(page).toHaveURL(/\/lawsuits/);
    await page.goto('/trust');
    await expect(page.locator('body')).toContainText(/browsing is free and needs no account/i);
    await shot(page, 'journey-public-no-login-browse.png');
  });
});
