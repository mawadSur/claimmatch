import ts from 'typescript';

import { newPasswordPlaceholder, passwordTooShortText } from '@/copy/auth';
import {
  checkOnClaimSentence,
  claim,
  closedIfWrongSentence,
  closedSentence,
  copyFieldLabel,
  deadlinePassedSentence,
  forUpdatesSentence,
  listingSourceSentence,
  loadErrorTitle,
  recheckingSentence,
  reportedTitle,
  stepHeadingLabel,
  submittedNote,
  undoneMessage,
  undoWarning,
} from '@/copy/claim';
import { common } from '@/copy/common';
import { groupHint, introSentence, possibleIntro, possibleMatchesSummary } from '@/copy/dashboard';
import {
  closedOutMessage,
  fictionalNoticeText,
  fictionalRowText,
  gotItForAllLabel,
  noticeListBody,
  noticeListTitle,
  showAllNoticesLabel,
} from '@/copy/notices';
import { signedInAsText, stepOfTwoText } from '@/copy/onboarding';
import { store } from '@/copy/store';
import { catalogStatusText } from '@/features/catalog/catalog-status';

/**
 * Copy guard for the app (plan section 5).
 *
 * The web's copy guard (../tests/copy-guard.test.ts) scans mobile/src too,
 * in the web CI; this suite applies the same rules in the app's own CI, plus
 * the extra filing-fee bans (../tests/filing-free-warning.test.ts). The rules,
 * negation words and deliberate exceptions are read from the web test files
 * with the TypeScript parser, so the two guards cannot drift apart. Matching
 * mirrors the web guard: case-insensitive, comments skipped, strings,
 * template literals and JSX text checked.
 *
 * Beyond mobile/src it scans what else reaches people through the app: the
 * shared web files compiled into it (mobile/shared.json and their relative
 * imports), the sentences the copy builders compose at run time, the strings
 * in app.json, and the store listing text (src/copy/store.ts).
 *
 * It also checks copy parity: every entry in mobile/src/copy that is not
 * `mobileOnly` must appear in its web `source` file (the web CI runs the same
 * check in ../tests/mobile-copy-parity.test.ts), and every `mobileOnly` entry
 * must cite a plan section or an existing web file. Parity cannot check
 * where a fragment is shown or that `mobileOnly` is used only for web-only
 * words: that stays a review step.
 */

// The app's tsconfig has no Node types; these are the only Node APIs used here.
declare const __dirname: string;
const fs = require('node:fs') as {
  readFileSync(file: string, encoding: 'utf8'): string;
  readdirSync(dir: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  existsSync(file: string): boolean;
};
const path = require('node:path') as {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  resolve(...parts: string[]): string;
  dirname(file: string): string;
};

const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');

interface Rule {
  id: string;
  pattern: RegExp;
  negatable: boolean;
}

/**
 * Deliberate exceptions in mobile/src, as in the web guard's ALLOWLIST (plan
 * section 5).
 */
const ALLOWLIST: readonly { file: string; rule: string; reason: string }[] = [
  {
    file: 'mobile/src/copy/notices.ts',
    rule: 'claim filed',
    reason: 'Quotes the wrong “Claim filed” message the old flow showed, in order to correct it (D42), as the web’s CorrectiveNotice files do.',
  },
];

function parse(file: string): ts.SourceFile {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
}

/** The initializer of a top-level `const name = …` in a file. */
function constInitializer(source: ts.SourceFile, name: string): ts.Expression {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        return declaration.initializer;
      }
    }
  }
  throw new Error(`${source.fileName} has no top-level const ${name}`);
}

function regexOf(node: ts.Expression | undefined, source: ts.SourceFile): RegExp {
  if (!node || node.kind !== ts.SyntaxKind.RegularExpressionLiteral) throw new Error('Expected a regular expression literal');
  const literal = node.getText(source);
  const end = literal.lastIndexOf('/');
  return new RegExp(literal.slice(1, end), literal.slice(end + 1));
}

function property(object: ts.ObjectLiteralExpression, name: string, source: ts.SourceFile): ts.Expression | undefined {
  for (const entry of object.properties) {
    if (ts.isPropertyAssignment(entry) && entry.name.getText(source) === name) return entry.initializer;
  }
  return undefined;
}

const webGuard = parse(path.join(REPO, 'tests/copy-guard.test.ts'));
const webFeeTest = parse(path.join(REPO, 'tests/filing-free-warning.test.ts'));

const RULES: Rule[] = (() => {
  const list = constInitializer(webGuard, 'RULES');
  if (!ts.isArrayLiteralExpression(list)) throw new Error('RULES is not an array literal');
  return list.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) throw new Error('A rule is not an object literal');
    const id = property(element, 'id', webGuard);
    if (!id || !ts.isStringLiteral(id)) throw new Error('A rule has no string id');
    return {
      id: id.text,
      pattern: regexOf(property(element, 'pattern', webGuard), webGuard),
      negatable: property(element, 'negatable', webGuard)?.kind === ts.SyntaxKind.TrueKeyword,
    };
  });
})();
const NEGATION = regexOf(constInitializer(webGuard, 'NEGATION'), webGuard);
const CLAUSE_BREAK = regexOf(constInitializer(webGuard, 'CLAUSE_BREAK'), webGuard);
const BANNED_WARNING = regexOf(constInitializer(webFeeTest, 'BANNED_WARNING'), webFeeTest);

/** The web guard's deliberate exceptions (its ALLOWLIST), for the shared web files scanned here. */
const WEB_ALLOWLIST: { file: string; rule: string }[] = (() => {
  const list = constInitializer(webGuard, 'ALLOWLIST');
  if (!ts.isArrayLiteralExpression(list)) throw new Error('ALLOWLIST is not an array literal');
  return list.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) throw new Error('An ALLOWLIST entry is not an object literal');
    const file = property(element, 'file', webGuard);
    const rule = property(element, 'rule', webGuard);
    if (!file || !rule || !ts.isStringLiteral(file) || !ts.isStringLiteral(rule)) {
      throw new Error('An ALLOWLIST entry has no string file or rule');
    }
    return { file: file.text, rule: rule.text };
  });
})();
const EXCEPTIONS = [...ALLOWLIST, ...WEB_ALLOWLIST];

// The next three functions are the web guard's, unchanged.
function hasNegation(words: string[]): boolean {
  return words.some((w) => NEGATION.test(w.replace(/[^\w'’]/g, '')));
}

function isNegated(text: string, index: number, match: string): boolean {
  const clause = text.slice(Math.max(0, index - 200), index).split(CLAUSE_BREAK).pop() ?? '';
  const before = clause.trim().split(/\s+/).filter(Boolean).slice(-4);
  const inside = match.trim().split(/\s+/).slice(1);
  return hasNegation(before) || hasNegation(inside);
}

/** Replace every comment with spaces (keeping line breaks) so offsets and lines stay put. */
function blankComments(fileName: string, text: string): string {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const jsxText: [number, number][] = [];
  const comments = new Map<number, number>();

  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end]);
      return;
    }
    for (const r of ts.getLeadingCommentRanges(text, node.pos) ?? []) comments.set(r.pos, r.end);
    for (const r of ts.getTrailingCommentRanges(text, node.end) ?? []) comments.set(r.pos, r.end);
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);

  const chars = text.split('');
  for (const [start, end] of comments) {
    if (jsxText.some(([a, b]) => start >= a && start < b)) continue;
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

function scanSource(file: string, text: string): string[] {
  const visible = blankComments(file, text);
  const found: string[] = [];
  const line = (index: number) => visible.slice(0, index).split('\n').length;
  for (const rule of RULES) {
    for (const m of visible.matchAll(rule.pattern)) {
      const index = m.index ?? 0;
      if (rule.negatable && isNegated(visible, index, m[0])) continue;
      if (EXCEPTIONS.some((a) => a.file === file && a.rule === rule.id)) continue;
      found.push(`${file}:${line(index)} "${m[0].replace(/\s+/g, ' ')}" (${rule.id})`);
    }
  }
  const warning = new RegExp(BANNED_WARNING.source, `${BANNED_WARNING.flags.replace('g', '')}g`);
  for (const m of visible.matchAll(warning)) {
    found.push(`${file}:${line(m.index ?? 0)} "${m[0]}" (filing-fee warning)`);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const APP_FILES = sourceFiles(path.join(MOBILE, 'src'));

const SHARED = JSON.parse(fs.readFileSync(path.join(MOBILE, 'shared.json'), 'utf8')) as { root: string; entries: string[] };
const SHARED_ROOT = path.resolve(MOBILE, SHARED.root);

/** A relative import as a source file (with .ts or .tsx, or a folder's index.ts), or null. */
function resolveImport(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = /\.tsx?$/.test(base) ? [base] : [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** The shared web files compiled into the app: the shared.json entries and everything they import relatively. */
function sharedFiles(): string[] {
  const seen = new Set<string>();
  const queue = SHARED.entries.map((entry) => path.join(SHARED_ROOT, entry));
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const statement of parse(file).statements) {
      const specifier =
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
      if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
      const target = resolveImport(file, specifier.text);
      if (target) queue.push(target);
    }
  }
  return [...seen].sort();
}

/** A sentence a copy builder composes at run time, scanned as if it sat in the file it comes from. */
function composed(file: string, text: string | null): [string, string] {
  return [file, text ?? ''];
}

const DAY = 'Oct 30, 2026';
const CLAIM_COPY = 'mobile/src/copy/claim.ts';
const NOTICES_COPY = 'mobile/src/copy/notices.ts';
const GROUPS = ['needs_filing', 'reported', 'submitted', 'closed', 'other'] as const;

/** Every copy builder, with each argument that changes its wording. */
const COMPOSED: [string, string][] = [
  composed('mobile/src/copy/auth.ts', passwordTooShortText(10)),
  composed('mobile/src/copy/auth.ts', newPasswordPlaceholder(10)),
  ...[claim.step1Title, claim.step2Title, claim.step3Title].map((title, i) =>
    composed(CLAIM_COPY, stepHeadingLabel(i + 1, title.text)),
  ),
  ...(['your claim', 'this settlement', null] as const).map((what) =>
    composed(CLAIM_COPY, loadErrorTitle(what, common.loadErrorTitle.text)),
  ),
  composed(CLAIM_COPY, closedSentence(DAY)),
  composed(CLAIM_COPY, closedSentence(null)),
  composed(CLAIM_COPY, closedIfWrongSentence()),
  ...[true, false].flatMap((canReport) => [
    composed(CLAIM_COPY, deadlinePassedSentence(DAY, canReport, DAY)),
    composed(CLAIM_COPY, deadlinePassedSentence(DAY, canReport, null)),
  ]),
  composed(CLAIM_COPY, recheckingSentence(true)),
  composed(CLAIM_COPY, recheckingSentence(false)),
  composed(CLAIM_COPY, forUpdatesSentence()),
  composed(CLAIM_COPY, checkOnClaimSentence()),
  composed(CLAIM_COPY, listingSourceSentence('settlesignal.com')),
  composed(CLAIM_COPY, listingSourceSentence(null)),
  composed(CLAIM_COPY, reportedTitle(DAY)),
  composed(CLAIM_COPY, reportedTitle(null)),
  composed(CLAIM_COPY, undoWarning(DAY)),
  composed(CLAIM_COPY, undoWarning(null)),
  composed(CLAIM_COPY, undoneMessage('Not filed yet', DAY)),
  composed(CLAIM_COPY, undoneMessage('Not filed yet', null)),
  composed(CLAIM_COPY, submittedNote(DAY)),
  composed(CLAIM_COPY, submittedNote(null)),
  composed(CLAIM_COPY, copyFieldLabel(claim.fullName.text)),
  ...GROUPS.map((group) => composed('mobile/src/copy/dashboard.ts', groupHint(group))),
  composed('mobile/src/copy/dashboard.ts', introSentence(true)),
  composed('mobile/src/copy/dashboard.ts', introSentence(false)),
  composed('mobile/src/copy/dashboard.ts', possibleMatchesSummary(20, 4)),
  composed('mobile/src/copy/dashboard.ts', possibleMatchesSummary(3, 0)),
  composed('mobile/src/copy/dashboard.ts', possibleIntro(20)),
  ...[0, 1, 2].flatMap((count) => [
    composed(NOTICES_COPY, noticeListTitle(count)),
    composed(NOTICES_COPY, noticeListBody(count)),
    composed(NOTICES_COPY, gotItForAllLabel(count + 2)),
    composed(NOTICES_COPY, closedOutMessage(count + 1)),
    composed(NOTICES_COPY, showAllNoticesLabel(count + 6)),
  ]),
  composed(NOTICES_COPY, fictionalNoticeText('Acme Data Breach')),
  composed(NOTICES_COPY, fictionalRowText()),
  composed('mobile/src/copy/onboarding.ts', stepOfTwoText(1)),
  composed('mobile/src/copy/onboarding.ts', stepOfTwoText(2)),
  composed('mobile/src/copy/onboarding.ts', signedInAsText('ana@example.com')),
  ...[
    { failed: false, count: 1, category: 'Data breach', q: 'overdraft', hasDeadline: true, proofNotRequired: true },
    { failed: false, count: 12 },
    { failed: false, count: 0 },
    { failed: true, count: 0 },
  ].map((input) => composed('mobile/src/copy/catalog.ts', catalogStatusText(input))),
];

/** Every string in app.json (name, descriptions, permission texts). */
function appConfigStrings(): string[] {
  const strings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(JSON.parse(fs.readFileSync(path.join(MOBILE, 'app.json'), 'utf8')));
  return strings;
}

/** Character limits of the store listing fields (App Store Connect, Play Console). */
const STORE_LIMITS: Record<keyof typeof store, number> = {
  name: 30,
  subtitle: 30,
  shortDescription: 80,
  descriptionLead: 4000,
};

describe('mobile copy guard', () => {
  it('reads all of the web guard rules and its exceptions', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(30);
    expect(RULES.map((r) => r.id)).toEqual(
      expect.arrayContaining(['we file', "you're owed", 'claim filed', 'N% match', 'you qualify', 'being filed', 'match score']),
    );
    expect(WEB_ALLOWLIST).toEqual(expect.arrayContaining([{ file: 'mobile/src/copy/notices.ts', rule: 'claim filed' }]));
  });

  it.each([
    ['const a = "We’ll file it today";', 'we file'],
    ['const a = "You’re owed $180";', "you're owed"],
    ['const a = <Text>Claim filed!</Text>;', 'claim filed'],
    ['const a = `${pct}% match`;', 'N% match'],
    ['const a = "You are eligible for this settlement";', 'you are eligible'],
    ['const a = "Be careful if a site asks for a fee";', 'filing-fee warning'],
    ['const a = "You qualify!";', 'you qualify'],
    ["const a = \"You're likely eligible for this settlement\";", 'likely eligible'],
    ['const a = "You will receive up to $250";', 'you will be paid'],
    ['const a = "Guaranteed payout";', 'guaranteed payout'],
    ['const a = "Your claim is being filed";', 'being filed'],
    ['const a = "Your claim was submitted by ClaimMatch";', 'filed by claimmatch'],
    ['const a = "We send your claim to the administrator";', 'we send your claim'],
    ['const a = "Match score: 87";', 'match score'],
  ])('flags %s', (text, rule) => {
    expect(scanSource('snippet.tsx', text).join('\n')).toContain(`(${rule})`);
  });

  it.each([
    'const a = "ClaimMatch never files claims";',
    'const a = "If you qualify, file on the official site";',
    'const a = "Check that you qualify";',
    'const a = "Read the official notice to be sure you qualify before you file.";',
    '// We file for you. You’re owed money.\nconst a = 1;',
  ])('allows %s', (text) => {
    expect(scanSource('snippet.tsx', text)).toEqual([]);
  });

  it('finds no banned phrase anywhere in mobile/src', () => {
    expect(APP_FILES.length).toBeGreaterThan(0);
    const found = APP_FILES.flatMap((file) => scanSource(path.relative(REPO, file), fs.readFileSync(file, 'utf8')));
    expect(found).toEqual([]);
  });

  it('finds no banned phrase in the shared web files compiled into the app', () => {
    const files = sharedFiles();
    expect(files.length).toBeGreaterThanOrEqual(SHARED.entries.length);
    expect(files.map((file) => path.relative(REPO, file))).toEqual(expect.arrayContaining(['src/lib/matching.ts']));
    const found = files.flatMap((file) => scanSource(path.relative(REPO, file), fs.readFileSync(file, 'utf8')));
    expect(found).toEqual([]);
  });

  it.each(COMPOSED)('the sentence %s composes has no banned phrase: %s', (file, text) => {
    expect(scanSource(file, `const a = ${JSON.stringify(text)};`)).toEqual([]);
  });

  it('finds no banned phrase in app.json', () => {
    const strings = appConfigStrings();
    expect(strings).toContain('ClaimMatch');
    const found = strings.flatMap((text) => scanSource('mobile/app.json', `const a = ${JSON.stringify(text)};`));
    expect(found).toEqual([]);
  });

  it.each(Object.entries(store))('store listing %s fits its store limit', (key, entry) => {
    expect(entry.text.length).toBeLessThanOrEqual(STORE_LIMITS[key as keyof typeof store]);
  });
});

interface CopyEntry {
  text: string;
  source: string;
  mobileOnly?: true;
}

const ENTITIES: Record<string, string> = {
  '&apos;': "'",
  '&#39;': "'",
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&quot;': '"',
  '&#34;': '"',
  '&ldquo;': '"',
  '&rdquo;': '"',
  '&amp;': '&',
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

/** Entities, curly quotes, JSX `{' '}` spacers and runs of whitespace compare equal. */
function normalize(text: string): string {
  return text
    .replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\{\s*(['"])\s\1\s*\}/g, ' ')
    .replace(/\s+/g, ' ');
}

function copyEntries(): [string, CopyEntry][] {
  const dir = path.join(MOBILE, 'src/copy');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => /\.ts$/.test(entry.name) && entry.name !== 'types.ts')
    .flatMap((entry) => {
      const module = require(path.join(dir, entry.name)) as Record<string, Record<string, CopyEntry>>;
      return Object.entries(module).flatMap(([group, entries]) =>
        Object.entries(entries).map(([key, value]): [string, CopyEntry] => [`${group}.${key}`, value]),
      );
    });
}

describe('mobile copy parity', () => {
  const entries = copyEntries();
  const fromWeb = entries.filter(([, entry]) => !entry.mobileOnly);
  const appOnly = entries.filter(([, entry]) => entry.mobileOnly);

  it('reads the copy files', () => {
    expect(fromWeb.length).toBeGreaterThan(10);
    expect(appOnly.length).toBeGreaterThan(10);
  });

  it.each(fromWeb)('%s matches its web source', (_name, entry) => {
    const file = path.join(REPO, entry.source);
    expect(fs.existsSync(file)).toBe(true);
    expect(normalize(fs.readFileSync(file, 'utf8'))).toContain(normalize(entry.text));
  });

  it.each(appOnly)('%s (app-only wording) cites a plan section or the web file it replaces', (_name, entry) => {
    expect(/^plan \d/.test(entry.source) || fs.existsSync(path.join(REPO, entry.source))).toBe(true);
  });
});
