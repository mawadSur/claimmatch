// End-to-end password reset check against production. Prints step results and
// link SHAPES only (host, path, param names) — never tokens, keys or passwords.
// Usage (from the repo, so playwright/@supabase resolve):
//   node scripts/.tmp-reset-e2e.mjs <prod.env path>
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const envFile = process.argv[2];
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const SITE = env.NEXT_PUBLIC_SITE_URL;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log('[e2e]', ...a);
const shape = (u) => { try { const x = new URL(u); return `${x.origin}${x.pathname}?${[...x.searchParams.keys()].join('&')}${x.hash ? ' #' + [...new URLSearchParams(x.hash.slice(1)).keys()].join('&') : ''}`; } catch { return '(unparseable)'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MT = 'https://api.mail.tm';
async function mt(path, opts = {}, token, tries = 0) {
  const r = await fetch(MT + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (r.status === 429 && tries < 8) { await sleep(4000 * (tries + 1)); return mt(path, opts, token, tries + 1); }
  if (!r.ok && r.status !== 204) throw new Error(`mail.tm ${path} ${r.status}`);
  return r.status === 204 ? null : r.json();
}

const seen = new Set();
async function waitForMail(pred) {
  for (let i = 0; i < 30; i++) {
    await sleep(8000);
    const list = (await mt('/messages', {}, mtToken))['hydra:member'].filter(pred);
    if (list.length) return { ...(await mt(`/messages/${list[0].id}`, {}, mtToken)), id: list[0].id };
  }
  throw new Error('no email within 200s');
}
function linkFrom(msg) {
  const html = Array.isArray(msg.html) ? msg.html.join('') : (msg.html || msg.text || '');
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  return links.find((l) => /verify|auth\/confirm|auth\/callback|token|recovery|confirm/i.test(l)) || null;
}

let userId = null, mtId = null, mtToken = null, browser = null;
let result = 'FAIL';
try {
  const domain = (await mt('/domains'))['hydra:member'][0].domain;
  const address = `lai-reset-${randomBytes(4).toString('hex')}@${domain}`;
  const mtPass = randomBytes(12).toString('hex');
  mtId = (await mt('/accounts', { method: 'POST', body: JSON.stringify({ address, password: mtPass }) })).id;
  mtToken = (await mt('/token', { method: 'POST', body: JSON.stringify({ address, password: mtPass }) })).token;
  log('1. disposable inbox ready');
  global.__addr = address;

  const oldPass = randomBytes(12).toString('hex') + 'Aa1!';
  const newPass = randomBytes(12).toString('hex') + 'Bb2!';
  global.__finalPass = oldPass;
  browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Sign up through Supabase's public API (no service key), then confirm via the real email.
  const su = await anon.auth.signUp({ email: address, password: oldPass, options: { emailRedirectTo: `${SITE}/auth/callback` } });
  if (su.error) throw new Error('signUp: ' + su.error.message);
  userId = su.data.user?.id ?? 'unknown';
  const confirmMsg = await waitForMail((m) => true);
  const confirmLink = linkFrom(confirmMsg);
  log('2a. confirmation email; subject:', JSON.stringify(confirmMsg.subject), '| link shape:', confirmLink ? shape(confirmLink) : '(none)');
  await page.goto(confirmLink, { waitUntil: 'networkidle' });
  const confirmBtn = page.getByRole('button', { name: /Confirm my email/i });
  if (await confirmBtn.count()) await Promise.all([page.waitForNavigation({ timeout: 30000 }).catch(() => {}), confirmBtn.click()]);
  log('2b. after confirming, at:', shape(page.url()));
  // Start the reset from a signed-out browser, like a real user.
  await ctx.clearCookies();
  seen.add(confirmMsg.id);
  await page.goto(`${SITE}/forgot-password`, { waitUntil: 'networkidle' });
  await page.fill('#forgot-email', address);
  await page.click('button[type="submit"]');
  await page.getByText('Check your email').waitFor({ timeout: 20000 });
  log('3. reset requested on /forgot-password');

  const msg = await waitForMail((m) => !seen.has(m.id));
  const link = linkFrom(msg);
  log('4. reset email; subject:', JSON.stringify(msg.subject), '| link shape:', link ? shape(link) : '(none found)');
  if (!link) throw new Error('no reset link in email');

  await page.goto(link, { waitUntil: 'networkidle' });
  log('5. landed on:', shape(page.url()), '| heading:', JSON.stringify(await page.locator('h1').first().textContent().catch(() => null)));

  const btn = page.getByRole('button', { name: /Continue to reset password/i });
  if (await btn.count()) {
    await Promise.all([page.waitForURL(/reset-password|forgot-password|login/, { timeout: 30000 }), btn.click()]);
    log('6. after button:', shape(page.url()));
  } else {
    await page.waitForURL(/reset-password|forgot-password|login/, { timeout: 15000 }).catch(() => {});
    log('6. no button; now at:', shape(page.url()));
  }
  if (!/\/reset-password/.test(page.url())) throw new Error('did not reach /reset-password');

  await page.fill('#new-password', newPass);
  await page.fill('#confirm-password', newPass);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !/\/reset-password/.test(u.pathname), { timeout: 30000 });
  log('7. password saved; redirected to:', shape(page.url()));

  const signin = await anon.auth.signInWithPassword({ email: address, password: newPass });
  const oldTry = await anon.auth.signInWithPassword({ email: address, password: oldPass });
  log('8. login with NEW password:', signin.error ? 'FAILED ' + signin.error.message : 'OK', '| old password:', oldTry.error ? 'rejected (good)' : 'STILL WORKS (bad)');
  if (!signin.error) global.__finalPass = newPass;
  if (!signin.error && oldTry.error) result = 'PASS';
} catch (e) {
  log('ERROR:', e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (userId) {
    // Delete through the product's own endpoint, signed in as the test user.
    try {
      const pw = global.__finalPass;
      const b2 = await chromium.launch({ channel: 'chrome' });
      const p2 = await (await b2.newContext()).newPage();
      await p2.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
      await p2.fill('input[type="email"]', global.__addr);
      await p2.fill('input[type="password"]', pw);
      await Promise.all([p2.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 }), p2.click('button[type="submit"]')]);
      const r = await p2.evaluate(async () => (await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) })).status);
      log('cleanup: account delete endpoint status', r);
      const again = await anon.auth.signInWithPassword({ email: global.__addr, password: pw });
      log('cleanup: test user', again.error ? 'deleted (login now fails)' : 'STILL EXISTS — delete manually');
      await b2.close();
    } catch (e) { log('cleanup: FAILED', e.message, '— delete', 'the lai-reset-* test user manually'); }
  }
  if (mtId && mtToken) { await mt(`/accounts/${mtId}`, { method: 'DELETE' }, mtToken).catch(() => {}); log('cleanup: inbox deleted'); }
  log('RESULT:', result);
}
