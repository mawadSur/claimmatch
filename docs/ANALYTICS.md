# Lawsuit AI product analytics

PostHog project **Lawsuit AI** (id `399692`). The project timezone is **UTC**.
Reporting days in this doc and in operator dashboards are **America/New_York**
calendar days.

Parent owns saved dashboards and routine insight updates. This file is the
event contract the app implements.

## What is live today

The public product is a **free-during-beta** claim assistant. People browse
open settlements, check the official notice, copy saved details, and file on
the administrator site themselves. Assisted filing and a 15% recovery fee are
**not live** (flags off; counsel/entity still open). Do not treat those as
current conversion.

## Reporting day (ET)

An ET reporting day `YYYY-MM-DD` is:

```
timestamp >= toTimeZone(toDateTime('YYYY-MM-DD 00:00:00'), 'America/New_York')
timestamp <  toTimeZone(toDateTime('YYYY-MM-DD 00:00:00'), 'America/New_York') + INTERVAL 1 DAY
```

In UTC that is 05:00 UTC on that date through 05:00 UTC the next date while
Eastern is on standard time (04:00 UTC during daylight time). Always convert
with `America/New_York`, never assume a fixed UTC offset.

Example: 5 Nov 2026 ET = `2026-11-05 05:00:00Z` inclusive through
`2026-11-06 05:00:00Z` exclusive.

## Filters (do not delete)

Keep raw history. Do not drop events project-wide and do not delete people.

Default traction filter (AND):

1. `properties.cm_traffic_kind` is `product` **or** unset (legacy events from
   before this property shipped).
2. `properties.$virt_is_bot` is not `true`.
3. `properties.$pathname` does not start with `/api`.
4. Person property `internal` is not `true`.
5. Host is a production host (`lawsuitai.org`), not a preview.

Cohort **Internal / Test users** (`279065`) is the project test-account
filter. It was empty because internal sessions called `opt_out_capturing()`.
The app now **tags** those sessions (`internal=true`,
`cm_traffic_kind=internal`) and keeps capturing so the cohort can fill. Do
not replace that filter with a project-wide drop.

Preserve first-touch UTMs (`utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `ref`). `cm_traffic` is a closed query param (`test` |
`internal` | `bot`) and never overwrites campaign tags.

## Dedup

- Count people with `person_id`, not `distinct_id` (anonymous bots mint a new
  distinct id per hit).
- Page-level events (`landing_viewed`, `settlement_viewed`, `signup_started`,
  `matches_viewed`, `signup_completed` on email confirm) fire once per mount
  via `CaptureOnce`.
- `match_viewed` fires once per claim-flow mount (`useRef`).
- Funnel steps are separate events. Do not OR them into one “converted”
  milestone.

## Traffic kinds (`cm_traffic_kind`)

| Value | Meaning | How it is set |
| --- | --- | --- |
| `product` | Default visitor | Absence of the other signals |
| `test` | Synthetic / Playwright | UA `ClaimMatchSmoke`, Playwright, `navigator.webdriver`, `?cm_traffic=test` |
| `bot` | Agents, crawlers, curl | UA markers (claude-code, Perplexity, curl, …), `?cm_traffic=bot` |
| `internal` | Tester allowlist | `INTERNAL_EMAILS` / `profiles.is_internal` after identify |

PostHog also sets `$virt_is_bot` / `$virt_traffic_type`. Use both: our tag
catches smoke tests PostHog may call Regular; theirs catches IPs and lists we
do not ship.

## Event dictionary

Events fire only with the evidence column. Login is not signup. An official
form click is not a filing.

| Event | When it fires | Required evidence properties | Not this |
| --- | --- | --- | --- |
| `landing_viewed` | Home mounted | — | Catalog or claim views |
| `settlement_viewed` | Settlement page mounted | `lawsuit_id`, `slug` | Filing |
| `signup_started` | `/signup` mounted | — | Login |
| `signup_submitted` | Signup form passed client validation and was sent | — | Completion |
| `signup_completed` | Account actually created | `evidence=session_after_signup` **or** `evidence=email_confirmed` | `login_completed` |
| `signup_error` | Signup validation or API error | `code` (no error message / email) | — |
| `login_completed` | Password sign-in returned a user | `evidence=password_sign_in` | Signup |
| `profile_completed` | Onboarding **save** succeeded with name and/or state | `evidence=onboarding_saved`, `has_name`, `has_state`, `onboarded=true` | Skip onboarding; empty save |
| `matches_viewed` | Dashboard rendered ≥1 matcher row | `match_count` ≥ 1, `strong_count`, `possible_count` | Empty / failed catalog |
| `match_viewed` | Claim flow mounted | `lawsuit_id`, `slug`, `source=claim_flow` | “You qualify” |
| `official_form_opened` | Click on the official claim-form link (claim flow or signed-out settlement page) | `lawsuit_id`, `slug`, `intent=official_form`, `is_filing=false`; settlement-page clicks also send `source=settlement_page` | Filed |
| `eligibility_quiz_started` | First answer on the signed-out settlement checklist | `lawsuit_id`, `slug`, `prompt_count`, `signed_out=true` | A qualify verdict |
| `eligibility_quiz_completed` | User submitted the checklist | `lawsuit_id`, `slug`, `checks_yes`, `checks_no`, `checks_total`, `is_filing=false`, `is_qualify_verdict=false` | “You qualify” |
| `prefill_opened` | Prefill packet mounted | `lawsuit_id`, `slug` | Filed |
| `prefill_completed` | Copy-all or save of the packet | `lawsuit_id`, `slug`, `method` | Filed |
| `claim_tracking_started` | Claim row created to track | — | Filed |
| `claim_reported_filed` | User confirmed filing **and** the claim row saved as `reported_filed` or `submitted` | `evidence=user_reported_and_saved`, `claim_status`, `with_confirmation_number`, `is_filing=true` | Official-form click; dashboard “I submitted this” |
| `claim_filed` | Same moment as `claim_reported_filed` (funnel alias) | Same evidence as `claim_reported_filed` | Official-form click |
| `match_alert_sent` | Server: a match-alert email was accepted by Resend | `claim_count`, `source=profile\|subscriber` | Dry-run; flag off |
| `match_alert_clicked` | Server: one-click start token consumed | `created_user` | Scanner GET |
| `match_alert_signup_completed` | Server: token created a new account (no password) | `evidence=match_alert_token` | Existing-user sign-in |
| `match_alert_unsubscribed` | Server: `/api/unsubscribe` turned off alerts | `source=unsubscribe` | Settings toggle |
| `match_feedback` | Dashboard feedback button | `feedback_label`, `is_filing=false` | Confirmed filing |

`profile_completed` and `claim_reported_filed` were not in the taxonomy
before this change (`profile_completed` had no capture site; confirmed filing
existed as `claim_reported_filed` but had never fired). Do not backfill them.

## `/api/health/schema'` pageviews (5 Nov 2026 ET)

Observed: **12 pageviews / 12 distinct ids** for pathname
`/api/health/schema'` (trailing apostrophe). Correct
`GET /api/health/schema` without the cron secret is **401 JSON**. The
malformed path used to return **HTML 404** (root `not-found`), which loaded
PostHog and captured `$pageview`.

Callers (user agents, not a repo `href`): Safari, spoofed Edge automation,
`claude-code` CLI, Perplexity-User, Claude-User, mixed Chrome. Burst around
16:29–16:30 UTC after one Safari hit at 15:29 UTC. This matches agents
copying the shell-quoted curl from the production runbook, not an in-app
link. The app had no `href` to that quoted path.

Fix: quoted `/api/*` paths and unmatched API routes return **JSON 404**;
client `$pageview` skips `/api` and quoted pathnames. Raw historical
pageviews stay.

## Parent dashboard 2315315 (do not edit from this PR)

Parent owns [Lawsuit AI traction](https://us.posthog.com/project/399692/dashboard/2315315)
and the ET daily routine. This PR does not create or rewrite that dashboard.
Use these property names on existing tiles.

**Clean traction filter** (AND). Keep raw events; filter at query time.

```
(
  properties.cm_traffic_kind IN ('product')
  OR properties.cm_traffic_kind IS NULL
)
AND (properties.$virt_is_bot IS NULL OR properties.$virt_is_bot != true)
AND (properties.$pathname IS NULL OR properties.$pathname NOT LIKE '/api%')
AND (person.properties.internal IS NULL OR person.properties.internal != true)
AND (
  properties.$host IN ('lawsuitai.org', 'www.lawsuitai.org')
  OR properties.$current_url LIKE '%lawsuitai.org%'
)
```

Cohort **Internal / Test users** (`279065`) is empty today. Still exclude it
explicitly (`person_id NOT IN cohort 279065`) so the tile stays correct when
the cohort fills from tagged internal sessions. Do not rely on the empty
cohort alone.

Count unique people with `person_id`, not `distinct_id`.

**ET reporting day** for 5 Nov 2026: `2026-11-05 05:00:00Z` inclusive through
`2026-11-06 05:00:00Z` exclusive. Parent’s clean read for that day was
**4 visitors / 5 pageviews** vs raw **17 / 21**. That gap is API/health
HTML 404s plus bot/automation; after this deploy those paths return JSON
and skip `$pageview`.

### Tiles to add or retarget (new events)

These names did not exist or never fired before this change. Do not backfill.

| Tile | Event | Extra filter |
| --- | --- | --- |
| Signup | `signup_completed` | `properties.evidence IN ('session_after_signup','email_confirmed')` |
| Login (not signup) | `login_completed` | `properties.evidence = 'password_sign_in'` |
| Profile | `profile_completed` | `properties.evidence = 'onboarding_saved'` |
| Matches listed | `matches_viewed` | `properties.match_count >= 1` |
| Claim flow opened | `match_viewed` | `properties.source = 'claim_flow'` |
| Official form intent | `official_form_opened` | `properties.intent = 'official_form' AND properties.is_filing = false` |
| Signed-out official form | `official_form_opened` | `properties.source = 'settlement_page' AND properties.is_filing = false` |
| Eligibility checklist started | `eligibility_quiz_started` | `properties.signed_out = true` |
| Eligibility checklist finished | `eligibility_quiz_completed` | `properties.is_qualify_verdict = false AND properties.is_filing = false` |
| User-confirmed filing | `claim_reported_filed` | `properties.evidence = 'user_reported_and_saved' AND properties.is_filing = true` |

Do not chart `match_feedback` as filed. Do not chart `$pageview` on `/api*`
as product traffic. Smoke UA `ClaimMatchSmoke/1.0` sets
`cm_traffic_kind=test`; `?cm_traffic=test|internal|bot` is the closed query
param (never a UTM).

## Local / preview checks

Playwright smoke sends `ClaimMatchSmoke/1.0` so those hits tag as `test`.
Do not treat smoke or the 100-buyer panel as conversion.

## Isolated authenticated journey (not production E2E)

`npm run test:e2e:isolated` boots a **loopback GoTrue/PostgREST fixture**
(`scripts/isolated-backend.mjs` on `127.0.0.1`) and the real Next.js UI.
It never uses production Supabase, never sends email, and intercepts
`/ingest` so events do not reach PostHog project 399692.

| Piece | Real or mocked |
| --- | --- |
| Next.js UI (signup, onboarding, dashboard, claim flow) | **Real** app code |
| Auth, profiles, catalog, claim RPCs | **Mocked** isolated backend |
| Official administrator form | **Intercepted** `isolated-admin.claimmatch.test` HTML; no submit |
| PostHog `/ingest` | **Intercepted**; events asserted in Playwright, not stored in 399692 |
| Production / preview URL | **Not used** |

Vitest helpers are not a substitute for this path. Post-deploy smoke stays
read-only (`e2e/smoke.spec.ts` + `e2e/journey-public.spec.ts` only).
