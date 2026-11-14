import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Copy guard: banned phrases must never appear in anything a user can read.
 *
 * Scans src/**\/*.{ts,tsx} and the native app's mobile/src/**\/*.{ts,tsx}.
 * Matching is case-insensitive, and any run of whitespace (including a line
 * break inside wrapped JSX text) counts as one space. Comments are skipped,
 * using the TypeScript parser to find them, so
 * code notes about legacy data do not trip the guard; strings, template
 * literals and JSX text are all checked.
 *
 * "We file" also covers "we'll file", "we will file" and "we filed".
 * "File on your behalf" also covers files/filed/filing/submit(s/ted/ting) with
 * up to 60 characters between the verb and "on your behalf"; it passes only
 * when a negation word sits in the same clause, within four words before the
 * verb ("Lawsuit AI never files on your behalf") or inside the phrase
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
  { id: 'matched N%', pattern: /\bmatched\s+(?:100\b|\d{1,3}\s?%|\$\{[^}]*\}\s?%)/gi },
  { id: 'ai matched', pattern: /\bai[\s-]+matched\b/gi },
  { id: 'bank-level', pattern: /\bbank[\s-]+level\b/gi },
  { id: 'autopilot', pattern: /\bautopilot\b/gi },
  { id: '$50b', pattern: /\$\s?50\s?b/gi },
  // The exact strings production showed: "Claim filed", "Receipt #123".
  { id: 'claim filed', pattern: /\bclaims?\s+(?:was\s+|were\s+|has\s+been\s+|is\s+)?filed\b/gi },
  { id: 'receipt id', pattern: /\breceipts?\b\s*(?:#|no\.|number|:)/gi },
  { id: 'receipt label', pattern: /(?:label=\{?["'`]|>\s*)receipts?\s*(?=["'`<{]|\s*:)/gi },
  {
    // "We file" has its own rule above.
    id: 'we submit',
    pattern:
      /\b(?:(?:claimmatch|lawsuit\s*ai|our\s+team)(?:['’]ll|\s+will|\s+can)?\s+(?:files?|filed|submits?|submitted)|we(?:['’]ll|\s+will|\s+can)?\s+(?:submits?|submitted))\b(?!\s+(?:nothing|no)\b)/gi,
    negatable: true,
  },
  { id: 'N% match', pattern: /(?:\d{1,3}|\})\s?%\s*match/gi },
  { id: 'you are owed', pattern: /\byou\s+(?:are|could\s+be|may\s+be|might\s+be)\s+owed\b/gi },
  { id: 'never take a cut', pattern: /\bnever\s+takes?\s+a\s+cut\b/gi },
  // Negation-free: even "we don't take a cut" is a public no-cut promise.
  { id: 'take a cut', pattern: /\btakes?\s+a\s+cut\b/gi },
  { id: "doesn't make money", pattern: /\bdoesn['’]t\s+make\s+money\b/gi },
  { id: 'pending counsel', pattern: /\bpending\s+counsel\b/gi },
  { id: 'draft for review', pattern: /\bdraft\s+for\s+review\b/gi },
  { id: 'fully pre-fill', pattern: /\bfully\s+pre-?fills?\b/gi },
  { id: 'pre-fills the official', pattern: /\bpre-?fills?\s+(?:the|your)\b/gi },
  // C16 / E3: a qualify verdict. "Check if you qualify" / "if you qualify" stay allowed.
  { id: 'you are eligible', pattern: /\byou(?:['’]re|\s+are)\s+eligible\b/gi },
  {
    // Verdict form only. "filing a claim you don’t qualify for" (legal warning) is allowed.
    id: "you don't qualify",
    pattern: /\byou\s+(?:do\s+not|don['’]t)\s+qualify(?:\s+for\s+this\b|(?!\s+for\b))/gi,
  },
  { id: 'you qualify for this', pattern: /\byou\s+qualify\s+for\s+this\b/gi },
  { id: 'we decided you', pattern: /\bwe\s+(?:determined|decided)\s+(?:that\s+)?you\b/gi },
  // C16 / E4: filling the official form (C10 copy-ready packet order is fine).
  { id: 'autofill official', pattern: /\bautofill(?:s|ing)?\s+(?:the\s+)?official\b/gi },
  // Rephrased verdicts, payout promises and filing claims (mobile review). "Check that you
  // qualify", "be sure you qualify", "if/whether you qualify" and "settlements you qualify
  // for" stay allowed; "you qualify for this" has its own rule above.
  {
    id: 'you qualify',
    pattern: /(?<!\b(?:if|whether|sure|check\s+that|see\s+that)\s+)\byou\s+qualify\b(?!\s+for\b)/gi,
    negatable: true,
  },
  {
    id: 'you qualify for a payment',
    pattern: /\byou\s+qualify\s+for\s+(?:up\s+to\b|a\s+(?:payment|payout|share|refund)\b|\$)/gi,
    negatable: true,
  },
  {
    id: 'likely eligible',
    pattern:
      /\byou(?:['’]re|\s+are|\s+(?:may|might|could|would|should)\s+be)?\s+(?:likely|probably|definitely|certainly|almost\s+certainly)\s+(?:to\s+)?(?:be\s+)?(?:eligible|qualify|qualified)\b/gi,
  },
  {
    id: 'you will be paid',
    pattern:
      /\byou(?:['’]ll|\s+will)\s+(?:(?:definitely|likely|probably|soon)\s+)?(?:(?:receive|get|be\s+paid|be\s+sent)\s+(?:up\s+to\s+|about\s+|around\s+|at\s+least\s+|roughly\s+)?(?:\$|a\s+(?:payment|payout|check|refund|share)\b|your\s+(?:payment|payout|money|share|check)\b)|get\s+paid\b)/gi,
    negatable: true,
  },
  {
    id: 'guaranteed payout',
    pattern:
      /\bguaranteed?\s+(?:payouts?|payments?|money|cash|refunds?|compensation|approval)\b|\b(?:payouts?|payments?|approval)\s+(?:is|are)\s+guaranteed\b/gi,
    negatable: true,
  },
  { id: 'being filed', pattern: /\b(?:is|are|was|were)\s+being\s+(?:filed|submitted)\b/gi, negatable: true },
  {
    id: 'filed by claimmatch',
    pattern: /\b(?:filed|submitted|sent)\s+(?:by|through|via)\s+(?:claimmatch|lawsuit\s*ai|our\s+team|us)\b/gi,
    negatable: true,
  },
  {
    id: 'we send your claim',
    pattern:
      /\b(?:we|claimmatch|lawsuit\s*ai|our\s+team)(?:['’]ll|\s+will|\s+can)?\s+(?:sends?|sent|forwards?|forwarded|transmits?|transmitted|delivers?|delivered)\s+(?:your|the|this|each)\s+claims?\b/gi,
    negatable: true,
  },
  { id: 'match score', pattern: /\bmatch(?:ing)?\s+scores?\b|\bscore\s*:?\s*\d{1,3}\s*(?:%|\/\s*100\b|out\s+of\s+100\b)/gi },
];

/**
 * Deliberate exceptions. Keep empty unless a banned phrase must appear in
 * user-facing text for a real reason, and say why. With `text`, only a match
 * inside that exact text is allowed (any run of whitespace matches any other,
 * as in wrapped JSX); without it, every match of the rule in the file is.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; rule: string; reason: string; text?: string }> = [
  {
    file: 'src/components/claims/CorrectiveNotice.tsx',
    rule: 'claim filed',
    reason: 'Quotes the wrong “Claim filed” message the old flow showed, in order to correct it (D42).',
  },
  {
    file: 'src/components/claims/CorrectiveNoticeList.tsx',
    rule: 'claim filed',
    reason: 'Quotes the wrong “Claim filed” message the old flow showed, in order to correct it (D42).',
  },
  {
    file: 'mobile/src/copy/notices.ts',
    rule: 'claim filed',
    reason: 'The app’s copy of the CorrectiveNotice text: quotes the same wrong “Claim filed” message, in order to correct it (D42).',
  },
  {
    file: 'src/app/privacy/page.tsx',
    rule: 'you qualify',
    text: 'not a legal determination that you qualify',
    reason: 'Negated: stored match results are “not a legal determination that you qualify” (the “not” is five words back, past the four-word window). That sentence only.',
  },
  // src/lib/copy.ts: exact texts only, so a new filing claim there always needs its own entry.
  { file: 'src/lib/copy.ts', rule: 'we file', text: 'We’ll file it for you',
    reason: 'Owner: full-service primary CTA (“We’ll file it for you”), shown only when ASSISTED_FILING_ENABLED=1.' },
  { file: 'src/lib/copy.ts', rule: 'we submit', text: 'Lawsuit AI files the claim for you',
    reason: 'Owner: fee disclosure says Lawsuit AI files the claim, shown only when FEE_DISCLOSURE_ENABLED=1.' },
  { file: 'src/lib/copy.ts', rule: 'we submit', text: 'Lawsuit AI files this claim for you',
    reason: 'One-click filing (ONE_CLICK_FILING_ENABLED=1): agent-lane wording, shown only for a claim whose settlement has a filing channel the law firm enabled.' },
  { file: 'src/lib/copy.ts', rule: 'filed by claimmatch', text: 'Filed by Lawsuit AI · waiting for the confirmation number',
    reason: 'One-click filing: the filed_by_claimmatch status, true for that claim; it never reads “Submitted” until the administrator’s number arrives.' },
];

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

/** True when `text` contains `phrase` around [index, index + length); any run of whitespace matches any other. */
function insidePhrase(text: string, phrase: string, index: number, length: number): boolean {
  const words = phrase.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const spans = [...text.matchAll(new RegExp(words.join('\\s+'), 'g'))];
  return spans.some((m) => (m.index ?? 0) <= index && index + length <= (m.index ?? 0) + m[0].length);
}

function isAllowlisted(file: string, rule: string, visible: string, index: number, match: string): boolean {
  return ALLOWLIST.some(
    (a) => a.file === file && a.rule === rule && (!a.text || insidePhrase(visible, a.text, index, match.length)),
  );
}

function scanSource(file: string, text: string): Violation[] {
  const visible = blankComments(file, text);
  const found: Violation[] = [];
  for (const rule of RULES) {
    for (const m of visible.matchAll(rule.pattern)) {
      const index = m.index ?? 0;
      if (rule.negatable && isNegated(visible, index, m[0])) continue;
      if (isAllowlisted(file, rule.id, visible, index, m[0])) continue;
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
    ['const a = "Claim filed!";', 'claim filed'],
    ['const a = "Your claim was filed";', 'claim filed'],
    ['const a = "Receipt #CM-12345";', 'receipt id'],
    ['const a = "Receipt no. 12";', 'receipt id'],
    ['const a = <dt>Receipt</dt>;', 'receipt label'],
    ['const a = <Row label="Receipt" value={n} />;', 'receipt label'],
    ['const a = "We submit your claim to the administrator";', 'we submit'],
    ['const a = "Lawsuit AI files your claim for you";', 'we submit'],
    ['const a = "Our team submitted it";', 'we submit'],
    ['const a = "92% match";', 'N% match'],
    ['const a = `${pct}% match`;', 'N% match'],
    ['const a = <b>{pct}% match</b>;', 'N% match'],
    ['const a = "You are owed $180";', 'you are owed'],
    ['const a = "you may be owed money";', 'you are owed'],
    ['const a = "We never take a cut";', 'never take a cut'],
    ['const a = "Lawsuit AI never takes a cut";', 'never take a cut'],
    ['const a = "take a cut of a settlement";', 'take a cut'],
    ['const a = "Touch your settlement money or take a cut";', 'take a cut'],
    ["const a = \"Right now, it doesn't make money\";", "doesn't make money"],
    ['const a = "it doesn’t make money today";', "doesn't make money"],
    ['const a = "(Pending counsel review.)";', 'pending counsel'],
    ['const a = "Draft for review — not legal text.";', 'draft for review'],
    ['const a = "we fully pre-fill the official form";', 'fully pre-fill'],
    ['const a = "fully prefill your claim";', 'fully pre-fill'],
    ['const a = "pre-fills your details";', 'pre-fills the official'],
    ['const a = "pre-fills the official claim form";', 'pre-fills the official'],
    ['const a = "You are eligible for this settlement";', 'you are eligible'],
    ["const a = \"You're eligible\";", 'you are eligible'],
    ['const a = "You don’t qualify";', "you don't qualify"],
    ['const a = "you do not qualify based on the answers";', "you don't qualify"],
    ['const a = "You don’t qualify for this settlement";', "you don't qualify"],
    ['const a = "You qualify for this settlement";', 'you qualify for this'],
    ['const a = "We determined you meet the rules";', 'we decided you'],
    ['const a = "We decided that you can file";', 'we decided you'],
    ['const a = "this bookmarklet autofills the official form";', 'autofill official'],
    ['const a = "You qualify!";', 'you qualify'],
    ['const a = "Good news: you qualify.";', 'you qualify'],
    ['const a = "Looks like you qualify";', 'you qualify'],
    ['const a = "You qualify for up to $250";', 'you qualify for a payment'],
    ["const a = \"You're likely eligible for this settlement\";", 'likely eligible'],
    ['const a = "You are probably eligible";', 'likely eligible'],
    ['const a = "you likely qualify";', 'likely eligible'],
    ['const a = "You will receive up to $250";', 'you will be paid'],
    ['const a = "You’ll get a payment in March";', 'you will be paid'],
    ['const a = "You’ll get paid";', 'you will be paid'],
    ['const a = "Guaranteed payout";', 'guaranteed payout'],
    ['const a = "Your payment is guaranteed";', 'guaranteed payout'],
    ['const a = "Your claim is being filed";', 'being filed'],
    ['const a = "Your claim was submitted by Lawsuit AI";', 'filed by claimmatch'],
    ['const a = "We send your claim to the administrator";', 'we send your claim'],
    ['const a = "Lawsuit AI forwards the claim for you";', 'we send your claim'],
    ['const a = "Match score: 87";', 'match score'],
    ['const a = "Score: 87%";', 'match score'],
  ])('flags %s', (text, rule) => {
    expect(flagged(text, text.includes('<') ? 'snippet.tsx' : 'snippet.ts')).toContain(rule);
  });

  it.each([
    'const a = "Lawsuit AI never files claims";',
    'const a = "Lawsuit AI files nothing";',
    'const a = "Lawsuit AI did not file this claim";',
    'const a = "This claim now shows Not filed yet";',
    'const a = "Reported filed by you";',
    'const a = "No receipt needed";',
    'const a = "Keep your receipts and statements";',
  ])('the new rules allow %s', (text) => {
    expect(flagged(text)).toEqual([]);
  });

  it.each([
    'const a = "Lawsuit AI never files on your behalf";',
    'const a = "Lawsuit AI does not file claims on your behalf";',
    'const a = "Nothing is filed or submitted on your behalf";',
    'const a = "We don’t submit anything on your behalf";',
    'const a = "Lawsuit AI files nothing on your behalf";',
    'const a = "We don’t file for you";',
    'const a = "Lawsuit AI did not file this claim";',
    'const a = row.receipt_number;',
    'const a = "No receipt needed";',
    'const a = "no winner yet";',
    'const a = 0.15;',
    'const a = "115% sure";',
    'const a = "$500 cap";',
    'const a = "We matched 3 settlements";',
    'const a = `matched ${rows.length} rows`;',
    'const a = "https://example.com/we-file";',
    '// We file on your behalf. No win, no fee. 15% contingency.\nconst a = 1;',
    '/* You’re owed $50B */ const a = 1;',
    'const a = "copy-ready details";',
    'const a = "We never handle settlement payments";',
    'const a = "Lawsuit AI never files for you";',
    'const a = "Free during beta";',
    'const a = profile.prefill_consent_at;',
    '// We never take a cut. Pending counsel. Draft for review.\nconst a = 1;',
    'const a = "Check if you qualify";',
    'const a = "Read the official notice to see if you qualify";',
    'const a = "If you qualify, file on the official site";',
    'const a = "We can’t tell you if you qualify";',
    'const a = "A listing does not mean you qualify";',
    'const a = "copy-ready details in the official form’s order";',
    'const a = "Filing a claim you don’t qualify for can be against the law.";',
    'const a = "Check that you qualify";',
    'const a = "Read the official notice to be sure you qualify before you file.";',
    'const a = "Find settlements you qualify for";',
    'const a = "settlements you may qualify for";',
    'const a = "A listing does not mean you qualify or that you will be paid.";',
    'const a = "We do not promise that you will receive any payment.";',
    'const a = "We don’t guarantee payment";',
    'const a = "Nothing is being filed for you";',
    'const a = "Lawsuit AI never sends your claim anywhere";',
    'const a = { score: 0, reasons: [] };',
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
      { file: 'snippet.tsx', line: 4, rule: 'we submit', text: 'Our team files' },
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

  it('allows only the privacy page’s negated sentence, never another "you qualify" there', () => {
    const file = 'src/app/privacy/page.tsx';
    const page = readFileSync(path.join(ROOT, file), 'utf8');
    expect(page).toContain('not a legal determination that you qualify');
    expect(scanSource(file, page)).toEqual([]);
    expect(flagged('const a = <p>a ranking aid, not a legal\n    determination that you qualify.</p>;', file)).toEqual([]);
    // Any other un-negated "you qualify" on the page fails, also next to the allowed one.
    const added = `${page}\nexport const extra = 'Good news: you qualify.';\n`;
    expect(scanSource(file, added).map((v) => [v.rule, v.line])).toEqual([['you qualify', added.split('\n').length - 1]]);
    expect(flagged('const a = <p>This is not a legal determination. You qualify.</p>;', file)).toEqual(['you qualify']);
    // The sentence is allowed on that page only.
    expect(flagged('const a = "not a legal determination that you qualify";', 'src/app/terms/page.tsx')).toEqual(['you qualify']);
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
  it('no banned phrase anywhere in src or the native app (mobile/src)', () => {
    expect(scanFiles([...sourceFiles('src'), ...sourceFiles('mobile/src')])).toEqual([]);
  });
});
