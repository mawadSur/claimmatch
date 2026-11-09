import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure logic in src/lib run in Node (no browser, no Next
// runtime). The .mts extension makes Vite load this file as ESM; package.json
// has no "type": "module". The "@" alias mirrors the paths entry in
// tsconfig.json so tests import modules the same way app code does.
export default defineConfig({
  // One tsconfig for every file. The copy-parity tests import app files under
  // mobile/, whose own tsconfig extends expo/tsconfig.base from
  // mobile/node_modules, which CI's verify job does not install.
  tsconfig: './tsconfig.json',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // tsconfig keeps JSX for Next ("preserve"); tests need it compiled to render components.
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  test: {
    environment: 'node',
    // Every test file runs, wherever it sits; a .tsx test or one next to the
    // code it covers must not be skipped while CI stays green.
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
