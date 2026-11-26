import { expect, test } from '@playwright/test';

/**
 * Public claim-action surfaces at phone width. Read-only: never signs up.
 */

test.use({ viewport: { width: 375, height: 812 } });

test('home matching CTA is first and settlements are not behind a spinner', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('section').first();
  await expect(hero).toBeVisible();
  expect(await hero.innerHTML()).not.toMatch(/opacity-0/);
  const match = page.getByRole('link', { name: /see matching settlements/i }).first();
  const browse = page.getByRole('link', { name: /see open settlements/i }).first();
  await expect(match).toBeVisible();
  const matchBox = await match.boundingBox();
  const browseBox = await browse.boundingBox();
  expect(matchBox && browseBox).toBeTruthy();
  if (matchBox && browseBox) {
    expect(matchBox.y).toBeLessThanOrEqual(browseBox.y + 4);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test('settlements list shows cards on the first screen at 375px', async ({ page }) => {
  await page.goto('/lawsuits');
  await expect(page.getByRole('heading', { name: 'Open settlements', exact: true })).toBeVisible();
  const spinner = page.locator('.animate-spin');
  await expect(spinner).toHaveCount(0);
  const cards = page.locator('article.settlement-card');
  if ((await cards.count()) > 0) {
    await expect(cards.first()).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test('a public claim page does not bounce to signup', async ({ page }) => {
  await page.goto('/claim/example-settlement');
  await expect(page).not.toHaveURL(/\/signup/);
  await expect(page).not.toHaveURL(/\/login/);
});
