import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The native app shares the web's pure rule modules in place (plan 2.5):
 * mobile/shared.json lists the src/ files, Metro bundles them from ../src,
 * and the app's tsc and jest compile them with only mobile/node_modules
 * installed. So every listed file, and every file it imports, may import only
 * relative paths inside src/ and the npm packages shared.json allows: never
 * '@/' (it means mobile/src in the app), next, react, server-only, Supabase
 * or Node built-ins. Type-only imports count too, since the app's tsc reads
 * them. shared.json lists exactly the src/ files the app reaches, so a new
 * shared import shows up in review.
 *
 * That no file under src/ calls setFlagOverrides is checked in
 * tests/flags-client.test.ts.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = path.join(ROOT, 'src');
const MOBILE_SRC = path.join(ROOT, 'mobile', 'src');

interface SharedConfig {
  root: string;
  npm: string[];
  entries: string[];
}

const shared = JSON.parse(readFileSync(path.join(ROOT, 'mobile', 'shared.json'), 'utf8')) as SharedConfig;

/**
 * Every module a file names: imports and re-exports (type-only included),
 * `import x = require()`, import(), require() and `import('x')` types. A
 * dynamic import or require of anything but a string literal is "<dynamic>".
 */
function moduleSpecifiers(fileName: string, text: string): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      found.push(ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '<dynamic>');
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const { expression } = node.moduleReference;
      found.push(ts.isStringLiteral(expression) ? expression.text : '<dynamic>');
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const [argument] = node.arguments;
      found.push(argument && ts.isStringLiteralLike(argument) ? argument.text : '<dynamic>');
    } else if (ts.isImportTypeNode(node)) {
      const { argument } = node;
      found.push(ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal) ? argument.literal.text : '<dynamic>');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The package a bare specifier names: "zod", "@scope/name". */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** The file a path names, as the bundler resolves it (extension or index file optional). */
function resolveFile(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

const fromSrc = (file: string) => path.relative(SRC, file).split(path.sep).join('/');
const fromRoot = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

/** The files `starts` reach through relative imports, and every import that breaks the rules above. */
function walk(starts: string[]): { files: string[]; problems: string[] } {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = [...starts];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of moduleSpecifiers(file, readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        const target = resolveFile(path.resolve(path.dirname(file), specifier));
        if (!target) problems.push(`${fromRoot(file)} imports "${specifier}", which is not a file`);
        else if (!isInside(SRC, target)) problems.push(`${fromRoot(file)} imports "${specifier}", outside src/`);
        else queue.push(target);
      } else if (!shared.npm.includes(packageName(specifier))) {
        problems.push(
          `${fromRoot(file)} imports "${specifier}"; shared files may import only relative paths and ${shared.npm.join(', ')}`,
        );
      }
    }
  }
  return { files: [...seen].map(fromSrc).sort(), problems };
}

/** The src/ files mobile/src imports through '@shared/…', and any such import that is not a src/ file. */
function appImports(): { files: string[]; problems: string[] } {
  const files = new Set<string>();
  const problems: string[] = [];
  for (const file of sourceFiles(MOBILE_SRC)) {
    for (const specifier of moduleSpecifiers(file, readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('@shared/')) continue;
      const target = resolveFile(path.join(SRC, specifier.slice('@shared/'.length)));
      if (target && isInside(SRC, target)) files.add(target);
      else problems.push(`${fromRoot(file)} imports "${specifier}", which is not a file under src/`);
    }
  }
  return { files: [...files], problems };
}

describe('moduleSpecifiers', () => {
  it('finds every kind of import, type-only ones included', () => {
    const text = [
      "import a from './a';",
      "import type { B } from '../b';",
      "import './side-effect';",
      "export { c } from './c';",
      "export * from 'zod';",
      "import fs = require('node:fs');",
      "const d = import('./d');",
      "const e = require('next/server');",
      "const f = require(name);",
      "type G = import('react').ReactNode;",
    ].join('\n');
    expect(moduleSpecifiers('x.ts', text).sort()).toEqual(
      ['../b', './a', './c', './d', './side-effect', '<dynamic>', 'next/server', 'node:fs', 'react', 'zod'].sort(),
    );
  });

  it('ignores imports inside comments and strings', () => {
    expect(moduleSpecifiers('x.ts', "// import x from 'next';\nconst s = \"import y from 'react'\";")).toEqual([]);
  });
});

describe('mobile/shared.json', () => {
  it('allows only the npm packages of plan 2.4, from src/', () => {
    expect(shared.root).toBe('../src');
    expect(shared.npm).toEqual(['zod', 'clsx', 'tailwind-merge']);
  });

  it('lists only files that exist under src/, once each', () => {
    const missing = shared.entries.filter((entry) => resolveFile(path.join(SRC, entry)) !== path.join(SRC, entry));
    expect(missing).toEqual([]);
    expect(new Set(shared.entries).size).toBe(shared.entries.length);
  });

  it('lists files that, with everything they import, use only relative imports and the allowed packages', () => {
    const { problems } = walk(shared.entries.map((entry) => path.join(SRC, entry)));
    expect(problems).toEqual([]);
  });

  it('lists exactly the src/ files the app imports, directly or through other shared files', () => {
    const app = appImports();
    expect(app.problems).toEqual([]);
    expect(app.files.length).toBeGreaterThan(0);
    expect(walk(app.files).files).toEqual([...shared.entries].sort());
  });
});
