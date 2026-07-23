// Sentry initialization for the Edge runtime (middleware, edge routes). Loaded
// from src/instrumentation.ts. NO-OP when SENTRY_DSN is unset so edge functions
// keep working without an error-monitoring backend.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    debug: false,
  });
}
