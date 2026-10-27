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
10. `0013_verified_fields.sql` — `verified_at` / `verified_by`, `eligibility_verified`, `proof_verified`, `form_field_order`. Additive. Public "Verified on" badge stays off until `VERIFIED_FIELDS_ENABLED=1`.

CI applies 0001–0013 in that filename order on an empty database. Run 0010, 0011 and 0012 BEFORE merging or deploying code that needs them. 0012 and 0013 are already applied on production. The `/api/health/schema` route (cron secret) confirms those columns and functions exist after deploy.

## Production order

1. **Set env vars in Vercel.**
   - **`NEXT_PUBLIC_CONTACT_EMAIL`** (required): an inbox someone reads. A production build stops without it, so the live site stays unchanged until it is set. To change the public contact email later, update this env var in Vercel (and, if needed, `NEXT_PUBLIC_POSTAL_ADDRESS` / `NEXT_PUBLIC_LEGAL_ENTITY`) and redeploy. Do not hard-code a new address in the repo.
   - **`SUPABASE_SERVICE_ROLE_KEY`** (required): claim writes are server-side.
   - **`NEXT_PUBLIC_LEGAL_ENTITY`** and **`NEXT_PUBLIC_POSTAL_ADDRESS`** (recommended): shown on Terms and Privacy.
   - **Leave unset (off):** `MATCH_EMAILS_ENABLED`, `DIGEST_ENABLED`, `ADMIN_RECOVERIES_ENABLED`, `ENABLE_SAMPLE_SOURCE`, `VERIFIED_FIELDS_ENABLED`, `CALENDAR_ICS_ENABLED`, `CLOSES_IN_CHIPS_ENABLED` and `SETTLEMENT_OG_ENABLED`.
   - **Optional:** `INGEST_MAX_CLOSE_SHARE` (default 0.2), `INGEST_MISSING_FEED_CLOSE_AFTER` (default 3), `INGEST_DRY_RUN` (plan closures; write nothing), `ALERT_WEBHOOK_URL` (POST `{job, error, at}` on ingest/digest failure; unset is a no-op).

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

## First nightly ingest after the deploy

The circuit breaker will likely hold most closures: about 190 rows, against a default limit of 20% of the open catalog. The cron answers 500 by design, and `/admin` → "Last catalog ingest" lists the held rows. Review the list, then set `INGEST_MAX_CLOSE_SHARE=1` for one run.

## Rollback

- **Before step 4 (0008):** a Vercel instant rollback to the previous deployment works. The old "file" action still errors because of 0006's check.
- **After 0008:** roll forward instead. If the old code must come back, re-grant first; the SQL is in 0008's header (it restores 0004's WITH CHECK update policy, not the looser 0001 version).
- Every migration in this sequence is additive.
