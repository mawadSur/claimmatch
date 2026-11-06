# ClaimMatch product analytics

PostHog project **ClaimMatch** (id `399692`). The project timezone is **UTC**.
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
| `official_form_opened` | Click on the official claim-form link | `lawsuit_id`, `slug`, `intent=official_form`, `is_filing=false` | Filed |
| `prefill_opened` | Prefill packet mounted | `lawsuit_id`, `slug` | Filed |
| `prefill_completed` | Copy-all or save of the packet | `lawsuit_id`, `slug`, `method` | Filed |
| `claim_tracking_started` | Claim row created to track | — | Filed |
| `claim_reported_filed` | User confirmed filing **and** the claim row saved as `reported_filed` or `submitted` | `evidence=user_reported_and_saved`, `claim_status`, `with_confirmation_number`, `is_filing=true` | Official-form click; dashboard “I submitted this” |
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

## Local / preview checks

Playwright smoke sends `ClaimMatchSmoke/1.0` so those hits tag as `test`.
Do not treat smoke or the 100-buyer panel as conversion.
