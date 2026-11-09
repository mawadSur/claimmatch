import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindColors from 'tailwindcss/colors';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import tailwindConfig from '../tailwind.config';

/**
 * The native app's design tokens (mobile/src/theme/tokens.ts) mirror the
 * website's colors (plan 3.2): `brandPalette` is exactly tailwind.config.ts
 * theme.extend.colors, and `tailwindDefaults` are Tailwind's own default
 * colors the website uses. tokens.ts imports react-native, so its object
 * literals are read with the TypeScript parser instead of being imported.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TOKENS = path.join(ROOT, 'mobile', 'src', 'theme', 'tokens.ts');

type Palette = { [key: string]: string | Palette };

function literalValue(node: ts.Expression): string | Palette {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return literalValue(node.expression);
  }
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isObjectLiteralExpression(node)) {
    const palette: Palette = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) throw new Error(`Unexpected ${ts.SyntaxKind[property.kind]} in a palette`);
      const { name } = property;
      if (!(ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))) {
        throw new Error('A palette key must be a plain name or number');
      }
      palette[name.text] = literalValue(property.initializer);
    }
    return palette;
  }
  throw new Error(`Unexpected ${ts.SyntaxKind[node.kind]} in a palette`);
}

/** The value of `export const name = { … } as const` in tokens.ts. */
function tokensConst(name: string): Palette {
  const source = ts.createSourceFile(TOKENS, readFileSync(TOKENS, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        const value = literalValue(declaration.initializer);
        if (typeof value === 'string') throw new Error(`${name} is not an object`);
        return value;
      }
    }
  }
  throw new Error(`mobile/src/theme/tokens.ts has no const ${name}`);
}

/** "#fff" and "#FFFFFF" compare equal. */
function hex(value: string): string {
  const upper = value.toUpperCase();
  return /^#[0-9A-F]{3}$/.test(upper) ? `#${[...upper.slice(1)].map((c) => c + c).join('')}` : upper;
}

describe('mobile design tokens', () => {
  it('use exactly the website brand palette (tailwind.config.ts theme.extend.colors)', () => {
    expect(tokensConst('brandPalette')).toEqual(tailwindConfig.theme?.extend?.colors);
  });

  it('copy the Tailwind default colors they name correctly', () => {
    const defaults = tokensConst('tailwindDefaults');
    const lookup = tailwindColors as unknown as Record<string, string | Record<string, string>>;
    const mismatches: string[] = [];
    for (const [name, value] of Object.entries(defaults)) {
      const expected = lookup[name];
      if (typeof value === 'string') {
        if (typeof expected !== 'string' || hex(expected) !== hex(value)) mismatches.push(`${name}: ${value}`);
        continue;
      }
      for (const [shade, color] of Object.entries(value)) {
        const actual = typeof expected === 'object' ? expected[shade] : undefined;
        if (typeof color !== 'string' || !actual || hex(actual) !== hex(color)) mismatches.push(`${name}-${shade}: ${String(color)}`);
      }
    }
    expect(Object.keys(defaults).length).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
