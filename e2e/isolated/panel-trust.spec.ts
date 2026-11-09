import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasEvent,
  interceptAnalytics,
  interceptOfficialForm,
  type CapturedEvent,
} from './ingest';

/**
 * Panel-objection UI against the isolated fixture (flags on in the runner).
 * Signed-out only. Not production E2E.
 */

test.skip(!process.env.ISOLATED_JOURNEY, 'needs the isolated fixture runner');

const ARTIFACTS = process.env.ARTIFACTS_DIR || '/opt/cursor/artifacts';
const FIXTURE_SLUG = 'isolated-fixture-data-breach';
const SETTLEMENT_PATH = `/lawsuits/${FIXTURE_SLUG}`;

async function shot(page: Page, name: string) {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS, name), fullPage: true });
}

async function clientEvents(page: Page): Promise<CapturedEvent[]> {
  return page
    .evaluate(() => {
      try {
        return JSON.parse(sessionStorage.getItem('__cmEvents') || '[]') as CapturedEvent[];
      } catch {
        return [] as CapturedEvent[];
      }
    })
    .catch(() => [] as CapturedEvent[]);
}

test.describe('panel-trust signed-out surfaces', () => {
  test.describe.configure({ timeout: 60_000 });

  test('home and signup say browsing needs no account and show what we store', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const events: CapturedEvent[] = [];
    await interceptAnalytics(page, events);

    await page.goto('/');
    await expect(page.locator('body')).toContainText(/browsing listings and opening the official claim form need no account/i);
    await expect(page.locator('body')).toContainText(/create an account only to save matches or get deadline alerts/i);
    await shot(page, 'panel-trust-home-desktop.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('body')).toContainText(/need no account/i);
    await shot(page, 'panel-trust-home-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/signup');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#full_name')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/phone number/i);
    await expect(page.locator('body')).toContainText(/no phone/i);
    await expect(page.locator('body')).toContainText(/street address only if a claim form needs it/i);
    await expect(page.locator('body')).toContainText(/free during beta\. any future pricing will be shown before you use it/i);
    await shot(page, 'panel-trust-signup.png');

    await page.goto('/lawsuits');
    await expect(page.locator('body')).toContainText(/no proof required/i);
    await expect(page.getByText('Unknown', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Not stated', { exact: true })).toHaveCount(0);
    await expect(page.locator('body')).toContainText(/don.t have these details yet/i);
    await shot(page, 'panel-trust-catalog.png');
  });

  test('settlement page shows administrator, official link, quiz, and signed-out form intent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const events: CapturedEvent[] = [];
    await interceptAnalytics(page, events);
    await interceptOfficialForm(page);

    await page.goto(SETTLEMENT_PATH);
    await expect(page.getByRole('heading', { name: /isolated fixture data breach/i })).toBeVisible();
    await expect(page.locator('body')).toContainText(/Isolated Fixture Administrator/);
    await expect(page.locator('body')).toContainText(/need no account/i);
    await expect(page.getByRole('link', { name: /official claim site/i }).first()).toBeVisible();

    await expect(page.getByText(/this checklist is not a qualification decision/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/you qualify for this/i);
    await expect(page.locator('body')).toContainText(/People in California who received a data-breach notice/i);
    await shot(page, 'panel-trust-settlement-desktop.png');

    await page.getByText('This may describe me', { exact: true }).first().click();
    await page.getByRole('button', { name: /see what the listing suggests/i }).click();
    await expect(page.getByRole('status')).toContainText(/official notice/i);
    await expect(page.getByRole('status')).not.toContainText(/you qualify/i);

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: /official claim site/i }).first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toContain('isolated-admin.claimmatch.test');
    await expect(popup.locator('body')).toContainText(/nothing was submitted/i);
    await popup.close();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SETTLEMENT_PATH);
    await expect(page.getByRole('link', { name: /official claim site/i }).first()).toBeVisible();
    await shot(page, 'panel-trust-settlement-mobile.png');

    const merged = [...events, ...(await clientEvents(page))];
    expect(
      hasEvent(merged, 'eligibility_quiz_started') ||
        hasEvent(events, 'eligibility_quiz_started'),
    ).toBeTruthy();
    expect(
      hasEvent(merged, 'eligibility_quiz_completed') ||
        hasEvent(events, 'eligibility_quiz_completed'),
    ).toBeTruthy();
    expect(
      hasEvent(merged, 'official_form_opened', (props) => props.is_filing === false) ||
        hasEvent(events, 'official_form_opened'),
    ).toBeTruthy();
  });
});
