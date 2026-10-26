import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ELIGIBILITY_QUESTIONS, RETIRED_QUESTION_KEYS } from '@/lib/eligibility';
import { GET, POST } from '@/app/api/subscribe/route';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('onboarding questions', () => {
  it('no longer ask the medication question', () => {
    const keys = ELIGIBILITY_QUESTIONS.map((q) => q.key);
    expect(keys).not.toContain('took_medication');
    for (const key of RETIRED_QUESTION_KEYS) expect(keys).not.toContain(key);
  });

  it('never ask about health', () => {
    const health = /medic|prescri|drug|device|health|diagnos|condition|pregnan|symptom/i;
    for (const q of ELIGIBILITY_QUESTIONS) {
      expect(`${q.label} ${q.help ?? ''} ${(q.options ?? []).join(' ')}`).not.toMatch(health);
    }
  });

  it('collect no ZIP code, which nothing uses yet (D50)', () => {
    for (const file of ['src/components/OnboardingWizard.tsx', 'src/app/onboarding/actions.ts', 'src/app/onboarding/page.tsx']) {
      expect(read(file), file).not.toMatch(/setZip|onboarding-zip|postal-code|\bzip\s*:|['"]zip['"]|\.zip\b|zip\s*,/);
    }
    expect(read('src/app/dashboard/page.tsx')).not.toMatch(/ZIP code/);
  });

  it('keep unique keys', () => {
    const keys = ELIGIBILITY_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('retired contact channels', () => {
  it('/api/subscribe is gone and stores nothing', async () => {
    for (const handler of [POST, GET]) {
      const res = handler();
      expect(res.status).toBe(410);
      expect((await res.json()).error).toMatch(/closed/i);
    }
    // No database client and no table writes.
    expect(read('src/app/api/subscribe/route.ts')).not.toMatch(/createServiceClient|createClient|\.from\(/);
  });

  it('Settings neither offers nor sends an SMS opt-in', () => {
    expect(read('src/components/NotificationPrefs.tsx')).not.toMatch(/sms_?opt_?in|smsOptIn|text me time/i);
    expect(read('src/app/api/settings/route.ts')).not.toMatch(/sms_opt_in/);
  });

  it('the home page has no email capture form', () => {
    const home = read('src/app/page.tsx');
    expect(home).not.toMatch(/EmailCapture|api\/subscribe|type="email"/);
  });
});
