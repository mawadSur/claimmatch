import { expect, test } from '@playwright/test';

/**
 * Public and signed-out gates of the real app journey.
 * Not the 100 simulated-buyer panel. Never signs up, never posts a claim.
 * Authenticated paths live in e2e/isolated (fixture backend, not production).
 */

test('desktop home is the live beta pitch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/official/i);
  await expect(page.locator('body')).toContainText(/is lawsuit ai legit/i);
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/15\s*%/);
});

test('mobile home is the live beta pitch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/official/i);
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/15\s*%/);
});

test('signup is a free-account form, not a paid checkout', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.locator('#email, input[type="email"]').first()).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text.toLowerCase()).not.toMatch(/15\s*%/);
  expect(text).toMatch(/why an account/i);
  expect(text).toMatch(/hello@lawsuitai\.org/i);
});

test('signed-out onboarding and dashboard land on login; claim pages stay public', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/settings/claim-profile');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/claim/example-settlement');
  await expect(page).not.toHaveURL(/\/signup/);
  await expect(page).not.toHaveURL(/\/login/);
});

test('Easy submit settlement pages have no leftover self-file copy', async ({ page }) => {
  for (const slug of [
    'realpage-rental-software-antitrust-settlement',
    'john-deere-repair-services-antitrust-settlement',
  ]) {
    const lawsuit = await page.goto(`/lawsuits/${slug}`);
    if (lawsuit && lawsuit.ok()) {
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/doesn['’]t file claims for you/i);
      expect(text).not.toMatch(/Lawsuit AI never files for you/i);
      expect(text).not.toMatch(/Where Lawsuit AI offers one-click filing/i);
      expect(text).toMatch(/Easy submit/i);
    }
    const claim = await page.goto(`/claim/${slug}`);
    if (claim && claim.ok()) {
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/doesn['’]t file claims for you/i);
      expect(text).not.toMatch(/Lawsuit AI never files for you/i);
      expect(text).not.toMatch(/Where Lawsuit AI offers one-click filing/i);
    }
  }
});
