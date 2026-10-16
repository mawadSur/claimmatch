import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure logic in src/lib run in Node (no browser, no Next
// runtime). The .mts extension makes Vite load this file as ESM; package.json
// has no "type": "module". The "@" alias mirrors the paths entry in
// tsconfig.json so tests import modules the same way app code does.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
