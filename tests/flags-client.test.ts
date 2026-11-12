import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_FLAG_NAMES, clientFlagValues, flags, setFlagOverrides } from '@/lib/flags';

// The native app's flag values (S6): the server sends the allow-listed env
// flags in GET /api/mobile/config and the app applies them with
// setFlagOverrides. Server code never calls setFlagOverrides.

afterEach(() => {
  setFlagOverrides(null);
  vi.unstubAllEnvs();
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

describe('setFlagOverrides stays out of the web app', () => {
  it('is used nowhere under src/ but its definition (plan 2.5)', () => {
    const src = path.join(process.cwd(), 'src');
    const definition = path.join(src, 'lib', 'flags.ts');
    const users = sourceFiles(src)
      .filter((file) => file !== definition && /\bsetFlagOverrides\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(process.cwd(), file));
    expect(users).toEqual([]);
  });

  it('is ignored on the Next server, so a stray call cannot change flags for every request', () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('ASSISTED_FILING_ENABLED', '');
    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    setFlagOverrides({ ASSISTED_FILING_ENABLED: true, VERIFIED_FIELDS_ENABLED: false });
    expect(flags.assistedFiling()).toBe(false);
    expect(flags.verifiedFields()).toBe(true);

    vi.stubEnv('NEXT_RUNTIME', 'edge');
    expect(flags.assistedFiling()).toBe(false);

    // The native app has no NEXT_RUNTIME, and the browser bundle has it empty.
    vi.stubEnv('NEXT_RUNTIME', '');
    expect(flags.assistedFiling()).toBe(true);
    expect(flags.verifiedFields()).toBe(false);
  });
});

describe('setFlagOverrides', () => {
  it('wins only for the names given; the environment decides the rest', () => {
    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    vi.stubEnv('CALENDAR_ICS_ENABLED', '1');
    vi.stubEnv('CLOSES_IN_CHIPS_ENABLED', '');
    vi.stubEnv('FORM_FIELD_ORDER_ENABLED', '');

    setFlagOverrides({ VERIFIED_FIELDS_ENABLED: false, CLOSES_IN_CHIPS_ENABLED: true });
    expect(flags.verifiedFields()).toBe(false);
    expect(flags.closesInChips()).toBe(true);
    expect(flags.calendarIcs()).toBe(true);
    expect(flags.formFieldOrder()).toBe(false);

    setFlagOverrides(null);
    expect(flags.verifiedFields()).toBe(true);
    expect(flags.closesInChips()).toBe(false);
  });

  it('cannot turn on a server-only flag, and only `true` turns a flag on', () => {
    vi.stubEnv('PAYOUT_REPORT_ENABLED', '1');
    setFlagOverrides({
      MATCH_EMAILS_ENABLED: true,
      DIRECT_FILING_ENABLED: true,
      PAYOUT_REPORT_ENABLED: 'yes',
    } as never);
    expect(flags.matchEmails()).toBe(false);
    expect(flags.directFiling()).toBe(false);
    expect(flags.payoutReport()).toBe(false);
  });

  it('keeps its own copy of the values', () => {
    const next = { ASSISTED_FILING_ENABLED: true };
    setFlagOverrides(next);
    next.ASSISTED_FILING_ENABLED = false;
    expect(flags.assistedFiling()).toBe(true);
  });
});

describe('clientFlagValues', () => {
  it('allow-lists exactly the ten flags the native app may see', () => {
    // Pinned, so a server-only flag cannot join the app's config unreviewed.
    expect(CLIENT_FLAG_NAMES).toEqual([
      'VERIFIED_FIELDS_ENABLED',
      'CLOSES_IN_CHIPS_ENABLED',
      'CALENDAR_ICS_ENABLED',
      'FORM_FIELD_ORDER_ENABLED',
      'PROOF_FEEDBACK_ENABLED',
      'ASSISTED_FILING_ENABLED',
      'PAYOUT_REPORT_ENABLED',
      'MATCH_METRICS_ENABLED',
      'FEE_DISCLOSURE_ENABLED',
      'CATALOG_HIDE_UNKNOWNS_ENABLED',
    ]);
  });

  it('is the allow-list only, as booleans read from the environment', () => {
    for (const name of CLIENT_FLAG_NAMES) vi.stubEnv(name, '');
    vi.stubEnv('MATCH_EMAILS_ENABLED', '1');
    vi.stubEnv('ASSISTED_FILING_ENABLED', '1');
    vi.stubEnv('FEE_DISCLOSURE_ENABLED', 'true');

    const values = clientFlagValues();
    expect(Object.keys(values).sort()).toEqual([...CLIENT_FLAG_NAMES].sort());
    expect(Object.values(values).every((value) => typeof value === 'boolean')).toBe(true);
    expect(values.ASSISTED_FILING_ENABLED).toBe(true);
    expect(values.FEE_DISCLOSURE_ENABLED).toBe(false);
    expect(values).not.toHaveProperty('MATCH_EMAILS_ENABLED');
  });

  it('reports the environment, never overrides', () => {
    vi.stubEnv('PROOF_FEEDBACK_ENABLED', '');
    setFlagOverrides({ PROOF_FEEDBACK_ENABLED: true });
    expect(clientFlagValues().PROOF_FEEDBACK_ENABLED).toBe(false);
  });

  it('names only flags that `flags` reads (a typo would send a flag no screen uses)', () => {
    const accessors = Object.values(flags);
    for (const name of CLIENT_FLAG_NAMES) {
      for (const other of CLIENT_FLAG_NAMES) vi.stubEnv(other, '');
      const before = accessors.map((read) => read());
      vi.stubEnv(name, '1');
      expect(accessors.map((read) => read()), name).not.toEqual(before);
    }
  });
});
