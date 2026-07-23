// Sentry initialization for the Node.js server runtime. Loaded from
// src/instrumentation.ts. This is a NO-OP when SENTRY_DSN is unset, so local
// development and sample-data / CI builds run without an error-monitoring
// backend and without noise.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Keep tracing conservative by default; tune per environment.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    // We surface our own logs; don't print the SDK banner.
    debug: false,
  });
}
