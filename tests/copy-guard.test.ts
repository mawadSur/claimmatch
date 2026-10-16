import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Copy guard: banned phrases must never appear in anything a user can read.
 *
 * Scans src/**\/*.{ts,tsx}. Matching is case-insensitive, and any run of
 * whitespace (including a line break inside wrapped JSX text) counts as one
 * space. Comments are skipped, using the TypeScript parser to find them, so
 * code notes about legacy data do not trip the guard; strings, template
 * literals and JSX text are all checked.
 *
 * "We file" also covers "we'll file", "we will file" and "we filed".
 * "File on your behalf" also covers files/filed/filing/submit(s/ted/ting) with
 * up to 60 characters between the verb and "on your behalf"; it passes only
 * when a negation word sits in the same clause, within four words before the
 * verb ("ClaimMatch never files on your behalf") or inside the phrase
 * ("files nothing on your behalf"). Anything else needs an ALLOWLIST entry.
 */

interface Rule {
  id: string;
  pattern: RegExp;
  /** Allow the match when it is clearly negated. */
  negatable?: boolean;
}

const RULES: Rule[] = [
  { id: 'we file', pattern: /\bwe(?:['’]ll|['’]ve|\s+will|\s+can|\s+have)?\s+filed?\b/gi },
  {
    id: 'file on your behalf',
    pattern:
      /\b(?:file|files|filed|filing|submit|submits|submitted|submitting)\b[^.!?;:<>{}"`]{0,60}?\bon\s+your\s+behalf\b/gi,
    negatable: true,
  },
  { id: 'receipt number', pattern: /\breceipt\s+numbers?\b/gi },
  { id: 'no win', pattern: /\bno[\s-]+win\b/gi },
  { id: 'contingency', pattern: /\bcontingency\b/gi },
  { id: '15%', pattern: /(?<![\d.])15\s?(?:%|percent\b)/gi },
  { id: "you're owed", pattern: /\byou['’]re\s+owed\b/gi },
  { id: 'matched N%', pattern: /\bmatched\s+(?:100\b|\d{1,3}\s?%|\$\{)/gi },
  { id: 'ai matched', pattern: /\bai[\s-]+matched\b/gi },
  { id: 'bank-level', pattern: /\bbank[\s-]+level\b/gi },
  { id: 'autopilot', pattern: /\bautopilot\b/gi },
  { id: '$50b', pattern: /\$\s?50\s?b/gi },
];

/**
 * Deliberate exceptions. Keep empty unless a banned phrase must appear in
 * user-facing text for a real reason, and say why.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; rule: string; reason: string }> = [];

const NEGATION =
  /^(?:not|never|no|nothing|none|nobody|neither|nor|cannot|without)$|n['’]t$/i;
const CLAUSE_BREAK = /[.!?;:<>{}"`]/;

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
  const jsxText: Array<[number, number]> = [];
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
    // "// like this" inside JSX text is visible copy, not a comment.
    if (jsxText.some(([a, b]) => start >= a && start < b)) continue;
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

function scanSource(file: string, text: string): Violation[] {
  const visible = blankComments(file, text);
  const found: Violation[] = [];
  for (const rule of RULES) {
    for (const m of visible.matchAll(rule.pattern)) {
      const index = m.index ?? 0;
      if (rule.negatable && isNegated(visible, index, m[0])) continue;
      if (ALLOWLIST.some((a) => a.file === file && a.rule === rule.id)) continue;
      found.push({
        file,
        line: visible.slice(0, index).split('\n').length,
        rule: rule.id,
        text: m[0].replace(/\s+/g, ' '),
      });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

function scanFiles(files: string[]): string[] {
  return files
    .flatMap((file) => scanSource(file, readFileSync(path.join(ROOT, file), 'utf8')))
    .map((v) => `${v.file}:${v.line} "${v.text}" (${v.rule})`);
}

describe('copy guard rules', () => {
  const flagged = (text: string, file = 'snippet.ts') => scanSource(file, text).map((v) => v.rule);

  it.each([
    ['const a = "We file claims for you";', 'we file'],
    ["const a = 'We’ll file it today';", 'we file'],
    ['const a = "we will file your claim";', 'we file'],
    ['const a = "claims we filed for you";', 'we file'],
    ['const a = "We’ve filed it";', 'we file'],
    ['const a = "Our team files on your behalf";', 'file on your behalf'],
    ['const a = "We prepare and submit your claims to the official administrators on your behalf";', 'file on your behalf'],
    ['const a = "It isn’t a law firm, and it files claims on your behalf";', 'file on your behalf'],
    ['const a = "Your receipt number is 12";', 'receipt number'],
    ['const a = "No win, no fee";', 'no win'],
    ['const a = "a contingency fee";', 'contingency'],
    ['const a = "we keep 15% of it";', '15%'],
    ['const a = "15 percent of what you get";', '15%'],
    ["const a = \"You're owed ~$180\";", "you're owed"],
    ['const a = "You’re owed";', "you're owed"],
    ['const a = "Matched 100%";', 'matched N%'],
    ['const a = "Matched 87%";', 'matched N%'],
    ['const a = `Matched ${score}%`;', 'matched N%'],
    ['const a = "AI Matched";', 'ai matched'],
    ['const a = "Bank-level security";', 'bank-level'],
    ['const a = "bank level care";', 'bank-level'],
    ['const a = "a money autopilot";', 'autopilot'],
    ['const a = "$50B+ left unclaimed";', '$50b'],
    ['const a = "$50 billion";', '$50b'],
  ])('flags %s', (text, rule) => {
    expect(flagged(text)).toContain(rule);
  });

  it.each([
    'const a = "ClaimMatch never files on your behalf";',
    'const a = "ClaimMatch does not file claims on your behalf";',
    'const a = "Nothing is filed or submitted on your behalf";',
    'const a = "We don’t submit anything on your behalf";',
    'const a = "ClaimMatch files nothing on your behalf";',
    'const a = "We don’t file for you";',
    'const a = "ClaimMatch did not file this claim";',
    'const a = row.receipt_number;',
    'const a = "No receipt needed";',
    'const a = "no winner yet";',
    'const a = 0.15;',
    'const a = "115% sure";',
    'const a = "$500 cap";',
    'const a = "We matched 3 settlements";',
    'const a = "https://example.com/we-file";',
    '// We file on your behalf. No win, no fee. 15% contingency.\nconst a = 1;',
    '/* You’re owed $50B */ const a = 1;',
  ])('allows %s', (text) => {
    expect(flagged(text)).toEqual([]);
  });

  it('skips JSX comments but checks wrapped JSX text', () => {
    const jsx = [
      'const a = (',
      '  <p>',
      '    {/* we file for you */}',
      '    Our team files on',
      '    your behalf.',
      '  </p>',
      ');',
    ].join('\n');
    const found = scanSource('snippet.tsx', jsx);
    expect(found).toEqual([
      { file: 'snippet.tsx', line: 4, rule: 'file on your behalf', text: 'files on your behalf' },
    ]);
  });

  it('treats comment-like JSX text as visible copy', () => {
    const jsx = 'const a = <p><b>Note</b> // we file for you</p>;';
    expect(flagged(jsx, 'snippet.tsx')).toEqual(['we file']);
  });

  it('reports the file and line of each match', () => {
    const found = scanSource('src/x.ts', 'const a = 1;\nconst b = "No win, no fee";\n');
    expect(found).toEqual([{ file: 'src/x.ts', line: 2, rule: 'no win', text: 'No win' }]);
  });
});

// Public pages, legal pages and shared site copy that Phase 0 Part A rewrote.
const PART_A_COPY = [
  'src/app/page.tsx',
  'src/app/how-it-works/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/trust/page.tsx',
  'src/app/about/page.tsx',
  'src/app/terms/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/signup/page.tsx',
  'src/app/login/page.tsx',
  'src/app/layout.tsx',
  'src/app/not-found.tsx',
  'src/app/settings/page.tsx',
  'src/app/api/settings/route.ts',
  'src/app/api/subscribe/route.ts',
  'src/components/Footer.tsx',
  'src/components/Nav.tsx',
  'src/components/NavAuthLinks.tsx',
  'src/components/TrustBadges.tsx',
  'src/components/Disclaimer.tsx',
  'src/components/NotificationPrefs.tsx',
  'src/components/CountUp.tsx',
  'src/components/ReferralCard.tsx',
  'src/lib/disclaimer.ts',
  'src/lib/eligibility.ts',
  'src/lib/utils.ts',
  'src/lib/legal-contact.ts',
  'src/lib/closing-soon.ts',
  'src/lib/settings-input.ts',
];

describe('copy guard', () => {
  it('public pages, legal pages and site copy contain no banned phrase', () => {
    expect(scanFiles(PART_A_COPY)).toEqual([]);
  });

  // Fails until every Phase 0 branch that owns the remaining surfaces merges.
  it('no banned phrase anywhere in src', () => {
    expect(scanFiles(sourceFiles('src'))).toEqual([]);
  });
});
