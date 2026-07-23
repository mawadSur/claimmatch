// Sentry initialization for the browser. Runs on every client page load.
// Guarded by NEXT_PUBLIC_SENTRY_DSN so it is a NO-OP when unset — nothing loads,
// nothing is sent, and local/sample builds are unaffected.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    debug: false,
  });
}

// NOTE: client-navigation tracing via `Sentry.captureRouterTransitionStart`
// (the `onRouterTransitionStart` hook) is a Sentry v9 API. This project is on
// @sentry/nextjs v8, where browser navigation spans are handled automatically
// by the browser tracing integration, so no explicit export is needed here.
