import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for ClaimMatch. Tests target pure, framework-free logic
 * (matching, eligibility, utils), so a Node environment is all we need — no
 * jsdom, no Next runtime. The `@/` alias mirrors tsconfig.json paths so tests
 * import modules exactly like app code does.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
