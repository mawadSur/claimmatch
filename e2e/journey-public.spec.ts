import { expect, test } from '@playwright/test';

/**
 * Public and signed-out gates of the real app journey.
 * Not the 100 simulated-buyer panel. Never signs up, never posts a claim.
 * Authenticated onboarding / matches / confirmed filing stay blocked
 * without local secrets — those paths must land on login.
 */

test('desktop home is the live beta pitch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/official/i);
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
});

test('signed-out onboarding, dashboard, and claim land on login', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/claim/example-settlement');
  await expect(page).toHaveURL(/\/login/);
});
