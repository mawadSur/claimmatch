# Staging Supabase and go-live rehearsal

See `docs/PRODUCTION-RUNBOOK.md` for SQL steps. Use staging before production.

1. New Supabase project + Vercel Preview env pointing at it.
2. Apply migrations in order: **0032**, **0041–0044**, **0046–0048**, **0049** (one file per SQL editor run).
3. Log dates in `scripts/apply-pending-migrations-notes.md`.
4. Internal test: `ONE_CLICK_FILING_TEST_MODE=1`, `INTERNAL_EMAILS`, `ONE_CLICK_TEST_INBOX`, `scripts/one-click-test-settlement.ts`.
5. Mobile Maestro against preview URL.

Prod: repeat the same migration sequence after staging post-checks pass.
