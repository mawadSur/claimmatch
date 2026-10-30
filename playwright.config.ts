import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders: Record<string, string> = { 'user-agent': 'ClaimMatchSmoke/1.0' };
if (bypass) {
  extraHTTPHeaders['x-vercel-protection-bypass'] = bypass;
  extraHTTPHeaders['x-vercel-set-bypass-cookie'] = 'samesitenone';
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    extraHTTPHeaders,
  },
});
