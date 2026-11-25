import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Copy parity for the native app (plan 3.2 rule 1, plan 5). The app keeps
 * its text in mobile/src/copy as { text, source, mobileOnly? } entries. An
 * entry without `mobileOnly` reuses the website's wording verbatim, so its
 * text must appear in its `source` web file once whitespace, HTML entities,
 * curly or straight quotes and JSX quote expressions are normalized.
 *
 * The copy modules are loaded at run time from their file URLs, so the root
 * typecheck (tsconfig excludes mobile/) never compiles the app's files.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COPY_DIR = path.join(ROOT, 'mobile', 'src', 'copy');

interface CopyEntry {
  text: string;
  source: string;
  mobileOnly?: true;
}

const NAMED_ENTITIES: Record<string, string> = {
  '&apos;': "'",
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&quot;': '"',
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&amp;': '&',
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&lt;': '<',
  '&gt;': '>',
};

/**
 * Text as a reader sees it: HTML entities decoded, quote marks straightened,
 * escaped quotes in string literals unescaped, JSX quote expressions such as
 * {"'"} and spacers such as {' '} turned into their characters, and every run
 * of whitespace one space.
 */
function normalize(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_entity, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_entity, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\\(['"`])/g, '$1')
    .replace(/\{\s*(['"`])(['"])\1\s*\}/g, '$2')
    .replace(/\{\s*(['"`])\s+\1\s*\}/g, ' ')
    .replace(/\s+/g, ' ');
}

function isCopyEntry(value: unknown): value is CopyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.text === 'string' && typeof entry.source === 'string';
}

/** Every entry of every exported copy group, named "file: group.key". */
async function loadCopy(): Promise<{ files: string[]; entries: Array<[string, CopyEntry]> }> {
  const files = readdirSync(COPY_DIR)
    .filter((name) => name.endsWith('.ts') && name !== 'types.ts')
    .sort();
  const entries: Array<[string, CopyEntry]> = [];
  for (const name of files) {
    const exported = (await import(pathToFileURL(path.join(COPY_DIR, name)).href)) as Record<string, unknown>;
    for (const [group, value] of Object.entries(exported)) {
      if (!value || typeof value !== 'object') continue;
      for (const [key, entry] of Object.entries(value)) {
        if (isCopyEntry(entry)) entries.push([`${name}: ${group}.${key}`, entry]);
      }
    }
  }
  return { files, entries };
}

const copy = await loadCopy();
const fromWeb = copy.entries.filter(([, entry]) => !entry.mobileOnly);

describe('normalize', () => {
  it.each([
    ['We couldn&rsquo;t load it', 'We couldn’t load it'],
    ['Claim filed&#8221; for', 'Claim filed” for'],
    ["it isn{\"'\"}t", "it isn't"],
    ["Log in{' '}\n      to continue", 'Log in to continue'],
    ["'It doesn\\'t'", "'It doesn't'"],
  ])('reads %j as %j', (source, text) => {
    expect(normalize(source)).toContain(normalize(text));
  });
});

describe('mobile copy parity', () => {
  it('reads every copy file in mobile/src/copy', () => {
    expect(copy.files.length).toBeGreaterThan(5);
    for (const file of copy.files) {
      expect(copy.entries.some(([name]) => name.startsWith(`${file}:`)), file).toBe(true);
    }
    expect(fromWeb.length).toBeGreaterThan(100);
  });

  it('cites a source for every entry, the plan section for mobileOnly text', () => {
    const missing = copy.entries.filter(([, entry]) => entry.source.trim() === '').map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it.each(fromWeb)('%s appears in its web source', (_name, entry) => {
    expect(entry.source.startsWith('mobile/')).toBe(false);
    const file = path.join(ROOT, entry.source);
    expect(existsSync(file)).toBe(true);
    expect(normalize(readFileSync(file, 'utf8'))).toContain(normalize(entry.text));
  });
});

/**
 * One-click filing (issue #51): the app's filing copy covers every web
 * ONE_CLICK_* text that is a whole sentence or label (status labels and
 * details, timeline events, lane reasons and timing), so a new web status
 * or reason cannot ship without its app wording.
 */
const web = await import('@/lib/copy');
const filingTexts = new Set(
  copy.entries.filter(([name]) => name.startsWith('filing.ts:')).map(([, entry]) => normalize(entry.text)),
);
const requiredFiling: Array<[string, string]> = [
  ['ONE_CLICK_AGENT_TITLE', web.ONE_CLICK_AGENT_TITLE],
  ['ONE_CLICK_SELF_FILE_TITLE', web.ONE_CLICK_SELF_FILE_TITLE],
  ['ONE_CLICK_AGENT_NOTE', web.ONE_CLICK_AGENT_NOTE],
  ['ONE_CLICK_SELF_FILE_NOTE', web.ONE_CLICK_SELF_FILE_NOTE],
  ...Object.entries(web.ONE_CLICK_STATUS).flatMap(([status, s]): Array<[string, string]> => [
    [`ONE_CLICK_STATUS.${status}.label`, s.label],
    [`ONE_CLICK_STATUS.${status}.detail`, s.detail],
  ]),
  ...Object.entries(web.ONE_CLICK_EVENTS).map(([k, v]): [string, string] => [`ONE_CLICK_EVENTS.${k}`, v]),
  ...Object.entries(web.ONE_CLICK_LANE_REASONS).map(([k, v]): [string, string] => [`ONE_CLICK_LANE_REASONS.${k}`, v]),
  ...Object.entries(web.ONE_CLICK_TIMING).map(([k, v]): [string, string] => [`ONE_CLICK_TIMING.${k}`, v]),
];

describe('mobile one-click filing copy parity', () => {
  it('has mobile/src/copy/filing.ts', () => {
    expect(copy.files).toContain('filing.ts');
  });

  it.each(requiredFiling)('%s has an app entry', (_name, text) => {
    expect(filingTexts.has(normalize(text))).toBe(true);
  });
});

/**
 * Issue #53 leftovers: flag-on public copy already on the web must exist in
 * the app's copy modules (onboarding, settlement, claim packet, store drafts).
 */
const allMobileTexts = new Set(copy.entries.map(([, entry]) => normalize(entry.text)));
const requiredMayFile: Array<[string, string]> = [
  ['MAY_FILE_PAGE_COPY.onboardingIntro', web.MAY_FILE_PAGE_COPY.onboardingIntro],
  ['MAY_FILE_PAGE_COPY.onboardingStep lead', 'File on the official site yourself, where it’s free.'],
  ['SOME_SETTLEMENTS', web.SOME_SETTLEMENTS],
  ['MAY_FILE_SHORT_SENTENCE', web.MAY_FILE_SHORT_SENTENCE],
  ['MAY_FILE_SENTENCE tail', 'You can always file on the official site yourself instead, where filing is free.'],
  ['SETTLEMENT_FILING_COPY.agent.step.title', web.SETTLEMENT_FILING_COPY.agent.step.title],
  ['SETTLEMENT_FILING_COPY.agent.step.body', web.SETTLEMENT_FILING_COPY.agent.step.body],
  ['SETTLEMENT_FILING_COPY.agent.points.0', web.SETTLEMENT_FILING_COPY.agent.points[0]],
  ['SETTLEMENT_FILING_COPY.self_file.step.body', web.SETTLEMENT_FILING_COPY.self_file.step.body],
  ['PREFILL_AGENT_LANE_NOTE', web.PREFILL_AGENT_LANE_NOTE],
  ['OFFICIAL_FILING_IS_FREE', web.OFFICIAL_FILING_IS_FREE],
  ['BETA_FEE_COPY', web.BETA_FEE_COPY],
];

describe('mobile may-file copy parity (issues #52/#53)', () => {
  it.each(requiredMayFile)('%s has an app entry', (_name, text) => {
    expect(allMobileTexts.has(normalize(text))).toBe(true);
  });
});
