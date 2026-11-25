/* eslint-disable no-console */
/**
 * Dry-run against REAL official claim forms. Fills a clearly fake identity,
 * walks every step, then STOPS. Never clicks a final submit control.
 *
 *   npx tsx scripts/one-click-dry-run.ts
 *   npx tsx scripts/one-click-dry-run.ts --slug seatgeek-ticket-fees-nevada-class-action-settlement
 *
 * Screenshots land in docs/one-click-e2e/<slug>/. Exit 1 if a run clicked, or
 * would have clicked, a submit control.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { FIVE_ONE_CLICK_SETTLEMENTS } from './one-click-five-settlements';

const FAKE = {
  first: 'Testonly',
  last: 'Claimmatchdryrun',
  legal: 'Testonly Claimmatchdryrun',
  email: 'dryrun.not.a.real.claim@example.com',
  phone: '555-010-0199',
  line1: '123 Fake Street',
  line2: 'Apt 0',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
} as const;

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLAIM_LINK_RE =
  /submit\s+a\s+claim|file\s+a\s+claim|claim\s+form|file\s+claim|start\s+(a\s+)?claim|submit\s+claim/i;
const NEXT_RE = /^(next|continue|start|begin|save and continue|next step)$/i;
const SUBMIT_RE =
  /^(submit|submit claim|submit my claim|submit this claim|file (this |my |the )?claim|complete (my )?claim|confirm and submit|i agree and submit|send claim|finish and submit|submit form)$/i;
const COOKIE_RE = /^(accept|accept all|agree|got it|ok|i understand)$/i;
const LOGIN_RE =
  /claim form login|login with your notice|loginid|unique id and pin|claim number and pin|confirmation code/i;

const CLAIM_PATHS = ['/file-a-claim', '/submit-a-claim', '/submit-claim', '/claim-form', '/file-claim', '/claim'];

export interface DryRunResult {
  slug: string;
  officialUrl: string;
  formUrlTried: string;
  finalUrl: string;
  deadline: string;
  extraUserFields: string[];
  filled: string[];
  stoppedAt: string;
  captcha: boolean;
  accountLogin: boolean;
  proofUpload: boolean;
  submitVisible: boolean;
  submitClicked: boolean;
  screenshot: string | null;
  notes: string[];
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function isHomepage(url: string, officialUrl: string): boolean {
  try {
    const now = new URL(url);
    const home = new URL(officialUrl);
    const path = now.pathname.replace(/\/+$/, '') || '/';
    return now.origin === home.origin && (path === '/' || path === '');
  } catch {
    return false;
  }
}

function looksLikeSubmit(name: string, homepage: boolean): boolean {
  const compact = name.replace(/\s+/g, ' ').trim();
  if (!compact) return false;
  if (homepage && CLAIM_LINK_RE.test(compact) && !/confirm and submit|i agree and submit/i.test(compact)) {
    return false;
  }
  return SUBMIT_RE.test(compact);
}

async function visibleButtons(page: Page): Promise<Locator> {
  return page.locator('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]');
}

async function controlName(locator: Locator): Promise<string> {
  return (
    (await locator.getAttribute('value')) ||
    (await locator.innerText().catch(() => '')) ||
    (await locator.getAttribute('aria-label')) ||
    (await locator.getAttribute('title')) ||
    ''
  ).replace(/\s+/g, ' ').trim();
}

async function pageHasCaptcha(page: Page): Promise<boolean> {
  const frames = page.frames().map((f) => f.url());
  const checkboxRecaptcha = frames.some(
    (url) => /recaptcha\/api2\/anchor/i.test(url) && !/size=invisible/i.test(url),
  );
  if (checkboxRecaptcha) return true;
  const challenge = page.locator(
    'iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[title*="recaptcha challenge" i], .g-recaptcha',
  );
  for (let i = 0; i < (await challenge.count()); i += 1) {
    if (await challenge.nth(i).isVisible().catch(() => false)) return true;
  }
  const visible = page.getByText(/i.?m not a robot|complete the captcha/i);
  return (await visible.count()) > 0 && (await visible.first().isVisible().catch(() => false));
}

async function pageHasAccountLogin(page: Page): Promise<boolean> {
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!LOGIN_RE.test(text)) return false;
  const secret = page.locator(
    'input[type="password"], input[name*="confirmation" i], input[name*="skauth"], input[name*="pin" i], input[name*="passcode" i]',
  );
  return (await secret.count()) > 0;
}

async function fillByHints(page: Page, hints: string[], value: string, filled: string[]): Promise<void> {
  for (const hint of hints) {
    const locators = [
      page.getByLabel(new RegExp(hint, 'i')),
      page.locator(`[name*="${hint}" i], [id*="${hint}" i], [autocomplete="${hint}"]`).first(),
      page.getByPlaceholder(new RegExp(hint, 'i')),
    ];
    for (const loc of locators) {
      const target = loc.first();
      if (await target.count().then((n) => n > 0).catch(() => false) && (await target.isVisible().catch(() => false))) {
        const tag = await target.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
        if (tag === 'select') {
          await target.selectOption({ label: value }).catch(async () => {
            await target.selectOption({ value }).catch(() => undefined);
          });
        } else {
          await target.fill(value).catch(() => undefined);
        }
        filled.push(hint);
        return;
      }
    }
  }
}

async function checkNonSubmitBoxes(page: Page, homepage: boolean, filled: string[]): Promise<void> {
  const boxes = page.locator('input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i += 1) {
    const box = boxes.nth(i);
    if (!(await box.isVisible().catch(() => false))) continue;
    const label = await box.evaluate((el) => {
      const id = el.getAttribute('id');
      if (id) {
        const via = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (via?.textContent) return via.textContent;
      }
      return el.closest('label')?.textContent ?? el.getAttribute('name') ?? '';
    }).catch(() => '');
    if (looksLikeSubmit(label, homepage)) continue;
    if (/opt.?out|exclude|unsubscribe|do not email/i.test(label)) continue;
    if (await box.isChecked().catch(() => false)) continue;
    await box.check({ force: true }).catch(() => undefined);
    filled.push(`checkbox:${label.slice(0, 40)}`);
  }
}

async function pickRadios(page: Page, filled: string[]): Promise<void> {
  const radios = page.locator('input[type="radio"]');
  const n = await radios.count();
  const groups = new Map<string, Locator>();
  for (let i = 0; i < n; i += 1) {
    const radio = radios.nth(i);
    if (!(await radio.isVisible().catch(() => false))) continue;
    const name = (await radio.getAttribute('name')) || `anon-${i}`;
    if (!groups.has(name)) groups.set(name, radio);
  }
  for (const [name, radio] of groups) {
    await radio.check({ force: true }).catch(() => undefined);
    filled.push(`radio:${name}`);
  }
}

async function dismissCookies(page: Page): Promise<void> {
  const buttons = await visibleButtons(page);
  const n = await buttons.count();
  for (let i = 0; i < n; i += 1) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const name = await controlName(btn);
    if (COOKIE_RE.test(name)) {
      await btn.click({ timeout: 2000 }).catch(() => undefined);
      return;
    }
  }
}

async function takeNoNoticePath(page: Page, notes: string[]): Promise<void> {
  const no = page.locator('label').filter({ hasText: /^No$/i }).first();
  if (!(await no.count()) || !(await no.isVisible().catch(() => false))) return;
  await no.click({ force: true }).catch(() => undefined);
  notes.push('clicked No (no-notice path)');
  await page.waitForTimeout(400);
  const cont = page.getByRole('button', { name: /^Continue$/i }).first();
  if (await cont.count()) {
    await cont.click({ force: true }).catch(() => undefined);
    notes.push('clicked Continue after No');
    await page.waitForTimeout(1500);
  }
}

async function openClaimForm(page: Page, officialUrl: string, formUrl: string, notes: string[]): Promise<void> {
  await page.goto(officialUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1500);
  await dismissCookies(page);
  const homepageLink = page.getByRole('link', { name: CLAIM_LINK_RE }).first();
  if (await homepageLink.count()) {
    await homepageLink.click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    notes.push('clicked homepage claim link');
    await takeNoNoticePath(page, notes);
    return;
  }
  const homepageBtn = page.getByRole('button', { name: CLAIM_LINK_RE }).first();
  if (await homepageBtn.count()) {
    await homepageBtn.click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    notes.push('clicked homepage claim button');
    await takeNoNoticePath(page, notes);
    return;
  }
  if (formUrl !== officialUrl) {
    const res = await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
    if (res && res.ok()) {
      notes.push(`opened configured form URL ${formUrl}`);
      await takeNoNoticePath(page, notes);
      return;
    }
    notes.push(`configured form URL failed (${res?.status() ?? 'nav error'})`);
  }
  for (const path of CLAIM_PATHS) {
    const url = new URL(path, officialUrl).toString();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
    if (res && res.ok()) {
      notes.push(`opened ${path}`);
      await takeNoNoticePath(page, notes);
      return;
    }
  }
  notes.push('stayed on homepage; no claim path opened');
  await takeNoNoticePath(page, notes);
}

async function stepOnce(page: Page, officialUrl: string, notes: string[]): Promise<'submit' | 'next' | 'stuck'> {
  const homepage = isHomepage(page.url(), officialUrl);
  const buttons = await visibleButtons(page);
  const n = await buttons.count();
  let next: Locator | null = null;
  for (let i = 0; i < n; i += 1) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const name = await controlName(btn);
    if (looksLikeSubmit(name, homepage)) return 'submit';
    if (!next && NEXT_RE.test(name)) next = btn;
  }
  if (next) {
    const name = await controlName(next);
    notes.push(`clicked ${name}`);
    await next.click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    return 'next';
  }
  return 'stuck';
}

export async function dryRunSlug(
  page: Page,
  slug: string,
  outDir: string,
): Promise<DryRunResult> {
  const target = FIVE_ONE_CLICK_SETTLEMENTS.find((row) => row.slug === slug);
  if (!target) throw new Error(`unknown slug ${slug}`);
  const dir = join(outDir, slug);
  mkdirSync(dir, { recursive: true });
  const result: DryRunResult = {
    slug,
    officialUrl: target.officialUrl,
    formUrlTried: target.formUrl,
    finalUrl: '',
    deadline: target.deadline,
    extraUserFields: [...target.extraUserFields],
    filled: [],
    stoppedAt: '',
    captcha: false,
    accountLogin: false,
    proofUpload: false,
    submitVisible: false,
    submitClicked: false,
    screenshot: null,
    notes: [],
  };

  try {
    await openClaimForm(page, target.officialUrl, target.formUrl, result.notes);
    result.captcha = await pageHasCaptcha(page);
    result.accountLogin = await pageHasAccountLogin(page);
    if (result.captcha) {
      result.stoppedAt = 'captcha';
      result.notes.push('visible captcha detected; swapped-out candidate rule applies');
    } else if (result.accountLogin) {
      result.stoppedAt = 'account-login';
      result.notes.push('official form requires a notice login; not fillable from profile');
    } else {
      await fillByHints(page, ['first name', 'firstname', 'given-name', 'first'], FAKE.first, result.filled);
      await fillByHints(page, ['last name', 'lastname', 'family-name', 'last', 'surname'], FAKE.last, result.filled);
      await fillByHints(page, ['full name', 'legal name'], FAKE.legal, result.filled);
      await fillByHints(page, ['email'], FAKE.email, result.filled);
      await fillByHints(page, ['confirm email', 'email_address_confirm'], FAKE.email, result.filled);
      await fillByHints(page, ['phone', 'tel', 'mobile'], FAKE.phone, result.filled);
      await fillByHints(page, ['address 1', 'address1', 'street', 'street address', 'line1'], FAKE.line1, result.filled);
      await fillByHints(page, ['address 2', 'address2', 'line2', 'apt'], FAKE.line2, result.filled);
      await fillByHints(page, ['city'], FAKE.city, result.filled);
      await fillByHints(page, ['state', 'province'], FAKE.state, result.filled);
      await fillByHints(page, ['state', 'province'], 'Illinois', result.filled);
      await fillByHints(page, ['zip', 'postal'], FAKE.zip, result.filled);
      await fillByHints(page, ['country'], 'United States', result.filled);
      await fillByHints(page, ['signature'], FAKE.legal, result.filled);
      await fillByHints(page, ['signature date', 'date'], '11/25/2026', result.filled);
      await checkNonSubmitBoxes(page, isHomepage(page.url(), target.officialUrl), result.filled);
      await pickRadios(page, result.filled);
      result.proofUpload = (await page.locator('input[type="file"]').count()) > 0;

      for (let step = 0; step < 8; step += 1) {
        const action = await stepOnce(page, target.officialUrl, result.notes);
        if (action === 'submit') {
          result.submitVisible = true;
          result.stoppedAt = 'final-step-before-submit';
          result.notes.push('submit control visible; refusing to click');
          break;
        }
        if (action === 'stuck') {
          result.stoppedAt = result.stoppedAt || 'no-further-safe-control';
          break;
        }
        result.captcha = result.captcha || (await pageHasCaptcha(page));
        result.accountLogin = result.accountLogin || (await pageHasAccountLogin(page));
        if (result.captcha) {
          result.stoppedAt = 'captcha';
          break;
        }
        if (result.accountLogin) {
          result.stoppedAt = 'account-login';
          break;
        }
        await fillByHints(page, ['first name', 'firstname', 'first'], FAKE.first, result.filled);
        await fillByHints(page, ['last name', 'lastname', 'last'], FAKE.last, result.filled);
        await fillByHints(page, ['email'], FAKE.email, result.filled);
        await fillByHints(page, ['confirm email'], FAKE.email, result.filled);
        await fillByHints(page, ['signature'], FAKE.legal, result.filled);
        await checkNonSubmitBoxes(page, false, result.filled);
      }
    }
  } catch (err) {
    result.stoppedAt = result.stoppedAt || 'error';
    result.notes.push(err instanceof Error ? err.message : String(err));
  }

  result.finalUrl = page.url();
  if (!result.stoppedAt) result.stoppedAt = 'end-of-walk';
  const shot = join(dir, 'final-step.png');
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  result.screenshot = join('docs/one-click-e2e', slug, 'final-step.png');
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
  return result;
}

export function refusesSubmit(argv: string[] = process.argv): boolean {
  return argv.includes('--submit');
}

async function main() {
  if (refusesSubmit()) {
    console.error('Refusing --submit. This script never submits a claim.');
    process.exit(1);
  }
  const only = arg('--slug');
  const targets = only
    ? FIVE_ONE_CLICK_SETTLEMENTS.filter((row) => row.slug === only)
    : FIVE_ONE_CLICK_SETTLEMENTS;
  if (targets.length === 0) {
    console.error('No matching slug.');
    process.exit(1);
  }
  const outDir = join(process.cwd(), 'docs', 'one-click-e2e');
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: DryRunResult[] = [];
  try {
    for (const row of targets) {
      console.log(`\n=== ${row.slug} ===`);
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: 'en-US',
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      page.on('dialog', (dialog) => dialog.dismiss());
      const result = await dryRunSlug(page, row.slug, outDir);
      results.push(result);
      console.log(JSON.stringify({
        slug: result.slug,
        stoppedAt: result.stoppedAt,
        submitVisible: result.submitVisible,
        submitClicked: result.submitClicked,
        captcha: result.captcha,
        accountLogin: result.accountLogin,
        proofUpload: result.proofUpload,
        filled: result.filled,
        finalUrl: result.finalUrl,
        screenshot: result.screenshot,
        notes: result.notes,
      }, null, 2));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const submitted = results.filter((row) => row.submitClicked);
  if (submitted.length > 0) {
    console.error('FATAL: a dry-run clicked submit', submitted.map((row) => row.slug));
    process.exit(1);
  }
  console.log(`\nWrote ${join(outDir, 'results.json')}`);
}

if (process.argv[1]?.endsWith('one-click-dry-run.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
