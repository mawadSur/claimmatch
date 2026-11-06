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

test('correct /api/health/schema is JSON 401 without the cron secret', async ({ request }) => {
  const res = await request.get('/api/health/schema');
  expect(res.status()).toBe(401);
  expect(res.headers()['content-type'] || '').toMatch(/json/i);
  const body = await res.text();
  expect(body).not.toMatch(/<html/i);
});

test("malformed /api/health/schema' is JSON 404, not HTML", async ({ request }) => {
  const res = await request.get("/api/health/schema'");
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type'] || '').toMatch(/json/i);
  const body = await res.text();
  expect(body).not.toMatch(/<html/i);
  expect(body).toContain('Not found');
});

test('home describes the live beta, not a 15 percent fee', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.toLowerCase()).toMatch(/free during beta|official filing stays free|file on the official/);
  expect(body).not.toMatch(/15\s*%/);
});
