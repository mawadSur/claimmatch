import { expect, test } from '@playwright/test';

/**
 * Read-only post-deploy smoke. Never signs up, never posts a form.
 * PLAYWRIGHT_BASE_URL is the preview or production origin.
 */

const PUBLIC_PATHS = ['/', '/lawsuits', '/pricing', '/trust'] as const;

for (const path of PUBLIC_PATHS) {
  test(`${path} returns 200 and mentions the official site`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase(), path).toContain('official');
  });
}

test('/login renders the email form', async ({ request }) => {
  const res = await request.get('/login');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/type="email"|id="email"/i);
});

test('/sitemap.xml is valid XML', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('<urlset');
  expect(body).toContain('</urlset>');
  expect(body).not.toContain('<html');
});
