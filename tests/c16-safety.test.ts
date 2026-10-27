import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  C16_BLOCKERS,
  SETTLEMENT_ELIGIBILITY_QUESTIONS,
  eligibilityVerdict,
  officialFormAutofillBookmarklet,
  officialFormAutofillScript,
  partnerWidgetAllowed,
  partnerWidgetSnippet,
  settlementEligibilityQuestions,
} from '@/lib/c16-safety';
import { packetFieldOrder } from '@/lib/form-field-order';
import { ELIGIBILITY_QUESTIONS } from '@/lib/eligibility';

afterEach(() => {
  vi.unstubAllEnvs();
});

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(ROOT, 'src');
const APP = path.join(SRC, 'app');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

describe('C16 / E3 settlement eligibility questions', () => {
  it('ships no top-10 question bank', () => {
    expect(SETTLEMENT_ELIGIBILITY_QUESTIONS).toEqual([]);
  });

  it('returns no per-settlement questions when the flag is off or on', () => {
    expect(settlementEligibilityQuestions('equifax-data-breach')).toEqual([]);
    vi.stubEnv('ELIGIBILITY_QUESTIONS_ENABLED', '1');
    expect(settlementEligibilityQuestions('equifax-data-breach')).toEqual([]);
    expect(settlementEligibilityQuestions('  ')).toEqual([]);
  });

  it('never issues a qualify or not_qualify verdict', () => {
    const off = eligibilityVerdict({ slug: 'any', answers: { state: 'CA' } });
    expect(off.offered).toBe(false);
    expect(off.verdict).toBeNull();
    expect(off.message).toBe(C16_BLOCKERS.e3);

    vi.stubEnv('ELIGIBILITY_QUESTIONS_ENABLED', '1');
    const on = eligibilityVerdict({ slug: 'any', answers: { state: 'CA' } });
    expect(on.offered).toBe(false);
    expect(on.verdict).toBeNull();
    expect(on.verdict).not.toBe('qualify');
    expect(on.verdict).not.toBe('not_qualify');
  });

  it('does not treat the onboarding questionnaire as E3', () => {
    expect(ELIGIBILITY_QUESTIONS.length).toBeGreaterThan(0);
    expect(
      SETTLEMENT_ELIGIBILITY_QUESTIONS.some((q) =>
        ELIGIBILITY_QUESTIONS.some((onboarding) => onboarding.key === q.key),
      ),
    ).toBe(false);
  });
});

describe('C16 / E4 official-form autofill', () => {
  it('never emits a bookmarklet or fill script', () => {
    expect(officialFormAutofillBookmarklet(false)).toBeNull();
    expect(officialFormAutofillScript(false)).toBeNull();
    vi.stubEnv('FORM_AUTOFILL_ENABLED', '1');
    expect(officialFormAutofillBookmarklet()).toBeNull();
    expect(officialFormAutofillScript()).toBeNull();
  });

  it('keeps C10 packet field order separate from autofill', () => {
    const order = packetFieldOrder(['email', 'full_name'], true);
    expect(order[0]).toBe('email');
    expect(officialFormAutofillBookmarklet(true)).toBeNull();
    expect(JSON.stringify(order)).not.toMatch(/javascript:|bookmarklet|content_script/i);
  });
});

describe('C16 / E7 partner widget', () => {
  it('never allows or emits an embed snippet', () => {
    expect(partnerWidgetAllowed(false)).toBe(false);
    expect(partnerWidgetSnippet(false)).toBeNull();
    vi.stubEnv('PARTNER_WIDGET_ENABLED', '1');
    expect(partnerWidgetAllowed()).toBe(false);
    expect(partnerWidgetSnippet()).toBeNull();
  });
});

describe('C16 surface scan', () => {
  const BANNED_ROUTE = /(?:^|\/)(?:embed|widget|bookmarklet|autofill|eligibility-questions)(?:\/|$)/i;
  const INJECTION =
    /(?:javascript:|chrome\.scripting|browser\.scripting|content_scripts|manifest_version)/i;

  it('registers no E3/E4/E7 public app routes', () => {
    const hits = walk(APP)
      .map(rel)
      .filter((file) => BANNED_ROUTE.test(file.replace(/^src\/app\//, '')));
    expect(hits).toEqual([]);
  });

  it('does not ship bookmarklet, extension, or partner-embed injection in src', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (INJECTION.test(text)) hits.push(rel(file));
    }
    expect(hits).toEqual([]);
  });
});
