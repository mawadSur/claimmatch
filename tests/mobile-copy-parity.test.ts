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
