// Next.js instrumentation hook. Loads the correct Sentry config for whichever
// server runtime is active. Both configs are no-ops without SENTRY_DSN, so this
// stays inert in local/sample mode.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Capture errors thrown in nested React Server Components. Harmless when Sentry
// is uninitialized (no DSN) — nothing is transmitted.
export const onRequestError = Sentry.captureRequestError;
