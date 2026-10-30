# Production runbook (trust reset + pre-fill)

Production Supabase currently has only `0001`–`0003` applied. Apply the rest
in this order. Every file is additive: nothing is deleted.

## Migration list (repo order)

1. `0004_prefill.sql` — address columns, `user_submitted_at`, `confirmation_number`, tighter claims update policy, `closed_at` / `last_verified_at`
2. `0005_review_default.sql` — new settlements default to `pending_review`
3. `0006_claim_states.sql` — self-file states, claim_events, server functions
4. `0007_corrective_notice_marker.sql` — durable D42 notice marker
5. `0008_claims_server_writes.sql` — revoke browser writes to `claims`
6. `0009_unpublish_fictional.sql` — unpublish all 22 fictional rows (16 seed slugs + 6 sample-aggregator), never a DELETE
7. `0010_feed_presence.sql` — `last_seen_at` and `missed_feed_count` so the nightly ingest can close rows missing from consecutive successful feeds (additive; no status changes here)
8. `0011_attribution.sql` — first-touch UTM/ref columns on profiles, `share_links` + `share_link_clicks`, `persist_first_attribution`. Additive; apply after 0010.
9. `0012_revoke_attribution_anon.sql` — revoke `persist_first_attribution` execute from `public` and `anon`; keep grant to `authenticated`. Additive; apply after 0011.
10. `0013_verified_fields.sql` — `verified_at` / `verified_by`, `eligibility_verified`, `proof_verified`, `form_field_order`. Additive. Public "Verified on" badge stays off until `VERIFIED_FIELDS_ENABLED=1`. Already applied on production.
11. `0014_proof_feedback.sql` — `proof_feedback` table (own-row RLS). Additive. Public UI stays off until `PROOF_FEEDBACK_ENABLED=1`.
12. `0015_assisted_filing.sql` — `lawsuits.assisted_filing_allowed` (default false), `claim_authorizations`, `filing_jobs`. Additive. UI and workers stay off until `ASSISTED_FILING_ENABLED=1`.
13. `0016_administrators.sql` — administrator registry + form mappings. Additive. Export/API stay off until `DIRECT_FILING_ENABLED=1`.
14. `0017_match_events.sql` — match events, feature snapshots, labels, labeled-outcomes view, `profiles.match_metrics_consent_at`. Additive. Writes stay off until `MATCH_METRICS_ENABLED=1`.
15. `0018_eligibility_drafts.sql` — pending eligibility rule drafts. Additive. Script/UI stay off until `ELIGIBILITY_DRAFTS_ENABLED=1`. Never auto-publishes.
16. `0019_ingest_alerts.sql` — `ingest_alerts` rows for failed or zero-update ingest. Additive. Email stays off until `INGEST_ALERT_EMAILS_ENABLED=1`.
17. `0020_soft_launch.sql` — `profiles.is_internal` and `profiles.cohort`. Additive.
18. `0021_link_check.sql` — official-link check columns. Additive. Checker stays off until `LINK_CHECK_ENABLED=1`.
19. `0022_payout_reports.sql` — user-reported payout columns on `recoveries`. Additive. UI stays off until `PAYOUT_REPORT_ENABLED=1`.
20. `0023_third_party_fee.sql` — `third_party_fee_status` / generated `third_party_fee_allowed`. Additive.
21. `0024_account_deletion.sql` — PII-free deletion audit table. Additive.
22. `0025_profile_consent_grant.sql` — grant `profiles.match_metrics_consent_at` update to authenticated. Additive. Already applied on production.
23. `0026_held_closure_decisions.sql` — `held_closure_decisions` (admin approve/dismiss of ingest circuit-breaker holds) and `ingest_alerts.reason` may be `warning`. Additive. **Not applied on production. Owner applies this in the SQL editor after merge; do not run it from this PR.**

CI applies 0001–0026 in that filename order on an empty database. Run 0010, 0011 and 0012 BEFORE merging or deploying code that needs them. 0012 and 0013 are already applied on production. Do not apply 0015–0019 or 0026 to production until this branch is reviewed. The `/api/health/schema` route (cron secret) confirms those columns and functions exist after deploy.

## Production order

1. **Set env vars in Vercel.**
   - **`NEXT_PUBLIC_CONTACT_EMAIL`** (required): an inbox someone reads. A production build stops without it, so the live site stays unchanged until it is set. To change the public contact email later, update this env var in Vercel (and, if needed, `NEXT_PUBLIC_POSTAL_ADDRESS` / `NEXT_PUBLIC_LEGAL_ENTITY`) and redeploy. Do not hard-code a new address in the repo.
   - **`SUPABASE_SERVICE_ROLE_KEY`** (required): claim writes are server-side.
   - **`NEXT_PUBLIC_LEGAL_ENTITY`** and **`NEXT_PUBLIC_POSTAL_ADDRESS`** (recommended): shown on Terms and Privacy.
   - **Leave unset (off):** `MATCH_EMAILS_ENABLED`, `DIGEST_ENABLED`, `ADMIN_RECOVERIES_ENABLED`, `ENABLE_SAMPLE_SOURCE`, `VERIFIED_FIELDS_ENABLED`, `CALENDAR_ICS_ENABLED`, `CLOSES_IN_CHIPS_ENABLED`, `SETTLEMENT_OG_ENABLED`, `NOTICE_LOOKUP_ENABLED`, `FORM_FIELD_ORDER_ENABLED`, `PROOF_FEEDBACK_ENABLED`, `CLOSED_ARCHIVE_ENABLED`, `CLOSING_SOON_EMAIL_ENABLED`, `HOME_NARROWING_ENABLED`, `HOME_WEDGE_ENTRIES_ENABLED`, `ELIGIBILITY_QUESTIONS_ENABLED`, `FORM_AUTOFILL_ENABLED`, `PARTNER_WIDGET_ENABLED`, `MATCH_UNSTRUCTURED_ENABLED`, `MATCH_STATE_ONLY_CAP_ENABLED`, `ASSISTED_FILING_ENABLED`, `DIRECT_FILING_ENABLED`, `MATCH_METRICS_ENABLED`, `ELIGIBILITY_DRAFTS_ENABLED`, `INGEST_ALERT_EMAILS_ENABLED`, `LINK_CHECK_ENABLED`, `PAYOUT_REPORT_ENABLED`, `FEE_DISCLOSURE_ENABLED`, `INGEST_MISSING_CLOSE_QUEUE_ENABLED`, `LAWSUITS_PAGINATION_ENABLED`, `ADMIN_HELD_CLOSURES_ENABLED` and `INGEST_HELD_IS_WARNING`.
   - **Optional:** `INGEST_MAX_CLOSE_SHARE` (default 0.2), `INGEST_MISSING_FEED_CLOSE_AFTER` (default 3), `INGEST_DRY_RUN` (plan closures; write nothing except the `jobs` row), `ALERT_WEBHOOK_URL` (POST `{job, error, at}` on ingest/digest failure; unset is a no-op).

2. **Before deploying**, run these in the Supabase SQL editor:
   1. `0004_prefill.sql` (any time).
   2. `0005_review_default.sql` (any time).
   3. `0006_claim_states.sql`.
   4. `0007_corrective_notice_marker.sql`.

   Once 0006 runs, the live code can no longer write `submitted` without a confirmation number, so its "file" action shows an error. That's intended. Deploy soon after.

3. **Merge and deploy.**

4. **Right after the deploy**, run `0008_claims_server_writes.sql`. It revokes browser writes to `claims`. Never run it before the deploy: the old code writes claims from the browser.

5. **After the read-only snapshot the private plan requires**, run `0009_unpublish_fictional.sql` in one session that starts with `set claimmatch.d38_export_done = 'yes';`. The app already hides these slugs in code.

6. **Run 0010 and 0011 (then 0012) BEFORE merging or deploying code that needs them.** Do not treat 0010 as “any time after the app is live”: ingest writes `last_seen_at` / `missed_feed_count`, and `/r` attribution writes first-touch columns. Apply in the SQL editor in this order:
   1. `0010_feed_presence.sql` — columns and an index only. The next nightly ingest starts the miss clock from zero; nothing closes on the first run after it lands. Optional: `INGEST_MISSING_FEED_CLOSE_AFTER` (default 3) and `INGEST_DRY_RUN=1` / `npm run scrape:dry-run` to preview closures.
   2. `0011_attribution.sql` — profile columns, share-link tables, and `persist_first_attribution`. Existing users keep a null first-touch until they next arrive with UTMs or a ref.
   3. `0012_revoke_attribution_anon.sql` — revoke execute from `anon` / `public`. Re-granting to anon is not recommended.

7. **Set the Vercel rollback floor** at this deployment.

Optional after deploy: `GET /api/health/schema` with `Authorization: Bearer $CRON_SECRET` should return 200. `ALERT_WEBHOOK_URL` (if set) receives `{job, error, at}` when the daily ingest or digest fails.

## Smoke checks after the deploy

Signed out (read-only):

- `/` and `/lawsuits` load, and listings show the "Unverified" label and an official link.
- An open settlement page (`/lawsuits/<slug>`) shows the answer block, FAQ and official link. `/settlements/closing-soon` and `/settlements/new` load.
- A test settlement slug, for example `/lawsuits/robocall-tcpa-settlement`, returns 404.
- `/claim/<slug>` redirects to `/login?next=…`.
- `/api/estimate`, `/api/claims/file-all`, `/api/recoveries` and `/api/subscribe` return 410.
- `/robots.txt` disallows the private paths.

Signed in as yourself:

- The dashboard groups your claims by next step and shows no dollar amounts.
- Settings shows your `/r/<code>` referral link. Admins can open `/admin/share-links` and create a campaign URL.
- Any older "filed" claim reads "Not filed" with the notice.
- The claim page shows copy-ready details (name, address, email) to copy into the official form.

## Nightly ingest reliability (Oct 2026)

### What was silent, and why

`vercel.json` schedules `GET /api/cron/daily` at `0 6 * * *`. From 26 Oct 2026 the
production run wrote nothing for three nights: no `lawsuits` updates, SettleSignal
`last_seen_at` still null, `missed_feed_count` still 0, past-deadline rows still
open, `jobs` empty (even after `recordIngestRun` shipped in PRs #22/#23),
`ingest_alerts` empty, `sources.last_run_at` still 14 Sep. The SettleSignal feed
itself returned 200 with ~897 records. `CRON_SECRET` is set; a request without
it correctly returns 401.

**Root cause (high confidence): the handler only wrote a `jobs` row after
`ingestAndExtract` finished, and that function does one Supabase write per
catalog change.** A ~900-row feed plus presence stamps is hundreds of sequential
HTTP updates. Vercel Hobby caps function duration at 10s (default) / 60s (max);
`maxDuration = 300` is accepted at build time but not honored on Hobby. The
isolate is killed during the feed fetch (20s timeout) or the write loop, before
`recordIngestRun`, `maybeRecordIngestAlert`, `touchSource`, or the response.
A killed run leaves no row and fires no alert.

Supporting evidence in code (before this fix):

- `src/app/api/cron/daily/route.ts` called `recordIngestRun` only after
  `await runStep('daily/ingest', ingestAndExtract)`.
- `src/lib/scraper/pipeline.ts` updated `lawsuits` one row at a time, and
  stamped `sources.last_run_at` only after that loop.
- `src/lib/scraper/sources/settlesignal.ts` uses a 20s feed timeout — already
  longer than Hobby's 10s default.
- `src/middleware.ts` ran a Supabase `getUser()` session refresh on every
  path, including `/api/cron/*`. Cron sends no cookies; a hang or throw there
  would also produce a silent night. That is now a pass-through. Confidence
  that middleware was the *primary* killer is medium — it is a real risk and
  is fixed regardless.
- Auth expects `Authorization: Bearer ${CRON_SECRET}`, which is exactly what
  Vercel Cron sends. A 401 from a **domain redirect** (old host → lawsuitai.org)
  would also write nothing, because the follow-up request drops `Authorization`.
  There is no host redirect in `next.config.mjs`; if Vercel project domains
  still 301/308 the cron host, point the production domain at lawsuitai.org
  so Cron hits it directly. Confidence: medium (cannot see project domain
  settings from the repo).

`serviceConfigProblem` (missing `SUPABASE_SERVICE_ROLE_KEY`) also skipped
`recordIngestRun`. Unlikely here — the live site already reads Supabase — but
the start row is now written before that check.

### What this deploy changes (on by default)

These are bug-fixes to the intended nightly path, not new product behavior:

- Middleware does not session-refresh or redirect `/api/cron/*`.
- The daily handler inserts a `jobs` row immediately (`status=running`,
  `payload.phase=started`) before any network work, then updates it to
  `done` / `failed`. The `job_status` enum has no `started` value; `running`
  is the existing equivalent so **no migration is required**.
- Catalog writes run in parallel chunks of 25 so a typical night finishes
  inside the Hobby cap.
- A leftover `running` row older than 15 minutes is marked failed on the next
  trigger and fires `ALERT_WEBHOOK_URL` if set.
- An uncaught throw in the handler records `failed` and fires the same hook.

### New env flags (default OFF)

| Flag | Default | Effect when set to exactly `1` |
| --- | --- | --- |
| `INGEST_MISSING_CLOSE_QUEUE_ENABLED` | off | After `INGEST_MISSING_FEED_CLOSE_AFTER` (default 3) consecutive successful-feed misses, show the open SettleSignal row on `/admin` as "Missing from feed, propose close" with one-click Close or Keep. **Never auto-closes.** Off: existing auto-close-after-N behavior stays. Uses `missed_feed_count` / `last_seen_at` — **no new migration**. |
| `LAWSUITS_PAGINATION_ENABLED` | off | `/lawsuits` paginates 24 per page, keeps filters/sort (known deadlines first), ISR (`revalidate=900`), `rel=next/prev`, canonical to page 1. Off: every open row still renders on one page. |
| `ADMIN_HELD_CLOSURES_ENABLED` | off | `/admin` and `/admin/held-closures` list circuit-breaker held closures (deduped by slug from recent `jobs` rows). Approve applies only that close (service role, audited). Dismiss hides the slug until the planned change differs. **Never auto-closes.** Needs `0026` on the target database. |
| `INGEST_HELD_IS_WARNING` | off | When the only ingest problem is held closures, the jobs row is `done` with `payload.phase=held_warning`, the cron answers **200** with the held count, and `ingest_alerts.reason=warning`. Failed writes and empty sources still 500. Off: held-only nights still 500. Needs `0026` only for the `warning` alert reason. |
| `HOME_WEDGE_ENTRIES_ENABLED` | off | Home cards for "Data breach & privacy" and "No proof required" when the live catalog has at least one matching open listing. `HOME_NARROWING_ENABLED` is the older name for the same cards. No match language, no invented counts. |

`0026_held_closure_decisions.sql` is **not** applied on production. After
merge, the owner runs it in the Supabase SQL editor (additive, re-runnable).
The new flags stay unset until then. SEO and smoke-workflow changes are
fixes and do not need a flag.

### Manual dry run in production (after merge)

Do this once, as yourself, with the cron secret. It plans every write and
persists **only** the `jobs` row.

1. Confirm the deploy is live on lawsuitai.org (not a preview).
2. From a machine that can reach production:

   ```bash
   curl -sS -D - -X GET \
     'https://lawsuitai.org/api/cron/daily?dryRun=1' \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H 'x-vercel-cron: 1'
   ```

   Expected: HTTP 200 or 500 (500 still means the run recorded — held closures
   or an empty source fail the step on purpose). Body includes `"dryRun": true`
   and a `jobId`.
3. In Supabase: `select id, status, payload, error, created_at from jobs order by created_at desc limit 5;`
   You should see a `pipeline` row with `payload.phase` `started` then
   `finished` or `failed`, and `payload.dryRun` true.
4. Confirm `lawsuits` and `sources.last_run_at` did **not** change.
5. Open `/admin` → Last catalog ingest. A dry run appears there. A
   `running` row that never finishes is a timeout; wait 15 minutes and
   trigger again, or inspect Vercel function logs.

To run a real write after a clean dry run, omit `?dryRun=1` (and do not set
`INGEST_DRY_RUN=1` in Vercel). Same `Authorization` header.

If the request 401s with the secret set, Cron or curl is hitting a host that
redirects (Authorization is dropped). Use the primary production domain.

## First nightly ingest after the deploy

The circuit breaker will likely hold most closures: about 190 rows, against a default limit of 20% of the open catalog. The cron answers 500 by design (unless `INGEST_HELD_IS_WARNING=1`), and `/admin` → "Last catalog ingest" lists the held rows. With `ADMIN_HELD_CLOSURES_ENABLED=1` (and `0026` applied), review and approve or dismiss each row instead of raising `INGEST_MAX_CLOSE_SHARE` for a whole night.

## Preview smoke (Vercel Deployment Protection)

The `smoke` GitHub workflow hits the preview URL. If Deployment Protection
is on, those requests 401 unless a bypass secret is sent.

1. In Vercel: Project → Settings → Deployment Protection → **Protection Bypass for Automation**. Generate a secret.
2. In GitHub: repo Settings → Secrets and variables → Actions → add `VERCEL_AUTOMATION_BYPASS_SECRET` with that value.
3. Playwright sends it as `x-vercel-protection-bypass` (and `x-vercel-set-bypass-cookie: samesitenone`).
4. If the GitHub secret is **absent**, the smoke job prints a notice and **exits 0** (does not fail the PR).

## Rollback

- **Before step 4 (0008):** a Vercel instant rollback to the previous deployment works. The old "file" action still errors because of 0006's check.
- **After 0008:** roll forward instead. If the old code must come back, re-grant first; the SQL is in 0008's header (it restores 0004's WITH CHECK update policy, not the looser 0001 version).
- Every migration in this sequence is additive.
