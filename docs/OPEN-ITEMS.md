# Open items

Verified against `main` at `164035d` on 2026-11-27. Every item carries
`file:line` evidence. Produced by seven read-only reviewers, one per area,
each required to return `cannot_determine` rather than guess.

PRs #86 and #87 fixed the homepage payout-ranking and above-the-fold copy
issues. The checklist below preserves the original audit findings and line
references. Follow-up status is recorded here; fixes are local until deployed.

| Area | Follow-up status |
| --- | --- |
| Billing | Checkout respects the billing flag, refuses a second ongoing subscription, and uses Stripe subscription history to allow only paid checkout for returning customers. Checkout buttons no longer promise a trial. Webhooks protect the tracked row against events from unrelated subscriptions. The trial limit is per Stripe customer, not per person. |
| Settings and auth | Gated settings saves preserve email consent. Confirmed web login offers a sign-in link first and makes password alternatives easier to tap. The dashboard no longer says discarded preview answers were used. Applying the Supabase email template and deciding whether Skip should retain answers are separate. |
| Filing desk | A full desk and an unreadable capacity count now have distinct copy. Already-admitted packets can still be signed when capacity fills; dashboard list summaries do not yet carry the admission history. The ceiling policy and stuck-job reaper remain open. |
| Public surfaces and payout | The featured settlement list has a non-affiliation notice. Paper fallback UI and emails no longer assert outreach was sent. Catalog value ranking shares the per-person payout parser, and homepage surfaces share the same settlement counts. Parser limits and homepage audience ordering remain open. |
| Flags and migrations | PIN outreach intake and the paper fallback card have separate default-off gates. Missing flag names were added to `.env.example`. Migration 0056 documents prerequisites; production application is still unverified. |
| Mobile and local hygiene | Expo dependencies were aligned; Expo Doctor passed 20/20 checks locally. The current checkout has one worktree and no local `worktree-wf_*` branches to prune. No remote branches were touched. |

Terms and fee promises, trial email consent policy, coverage disclosures, production
flag values and migration state, and mobile required-check policy are still open.

There are **no conversion or drop-off figures anywhere in this document**. There
is no analytics access, and the funnel events added in #84 only began collecting
on 2026-11-27, so no history exists. Every number here is a line count, a byte
count, a flag default, or a contradiction between two strings.

Legend: **DECIDE** needs a product or legal decision first &middot; **1H** under an
hour &middot; **HALF** about half a day &middot; **ENV** an environment variable only.

---

## Blockers

- [x] **The 7-day trial restarts indefinitely.** `DECIDE`
  The only guard is `PAID_ACCESS = new Set(['trialing','active'])`
  (`src/lib/subscriptions.ts:31`), checked at `:233`. The other six statuses in
  the enum at `:19-28` — `past_due, canceled, incomplete, incomplete_expired,
  unpaid, paused` — all pass, as does no subscription row at all. A cardless
  trial that ends without a card lands on `canceled` by way of this project's
  own `trial_settings.end_behavior.missing_payment_method: 'cancel'` (`:272`),
  which is one of the statuses that passes. `trial_period_days` is then granted
  unconditionally at `:269` and never consults `existing.trial_end`.
  Decide first: does a lapsed member get a no-trial checkout, a second trial,
  or a refusal? Exposure is gated on `SUBSCRIPTION_BILLING_ENABLED`
  (`src/lib/flags.ts:208`), whose deployed value cannot be read from the repo.

- [x] **A second Stripe subscription can be created on the same customer.** `1H`
  `past_due` passes the guard, and checkout reuses the existing customer id
  (`src/lib/subscriptions.ts:241`, session created at `:263-266`). Nothing
  enumerates the customer's existing subscriptions: `grep -rn
  "subscriptions.list" src/` returns nothing. The only Stripe subscription
  reads are single-id `retrieve` calls in the webhook
  (`src/app/api/webhooks/stripe/route.ts:86,:127`). The schema does not help
  either — `supabase/migrations/0054_stripe_subscriptions.sql:15-17` allows
  exactly one subscription id per user, with no notion of a second.
  Fix: `stripe.subscriptions.list({ customer, status: 'all' })` before creating
  the session; refuse when any is `trialing|active|past_due|unpaid|incomplete`.

- [ ] **The Terms of Service commit to "never takes a share", unconditionally.** `DECIDE`
  `src/app/terms/page.tsx:75-76` and `:127-128` make the commitment in **both**
  branches of the billing-disclosure flag, so the else-branch
  (`'Lawsuit AI never handles settlement money and never takes a share of it.'`)
  is live even with disclosure off. `CLAUDE.md` records monetization as
  undecided and this stance as internal and under review. This is a contract
  document, not marketing copy. Needs counsel before anyone edits it.

---

## Billing and the trial

- [x] **One subscription row per user, last writer wins.** `HALF`
  `src/lib/subscriptions.ts:181` upserts `onConflict: 'user_id'`, and `:206`
  writes whichever `stripe_subscription_id` arrived last. The webhook never
  checks that an event's subscription is the one the row holds
  (`src/app/api/webhooks/stripe/route.ts:96-103,:132-136`). So once a second
  subscription exists, a `customer.subscription.deleted` for the *first* writes
  `canceled` over the row (`:102`), revoking access while the second is still
  live and billable at Stripe. This is the "charged for a subscription the app
  no longer tracks" half of the problem.

- [ ] **Nothing records that a trial was consumed.** `HALF`
  `trial_end` exists (`0054_stripe_subscriptions.sql:29`), is written
  (`src/lib/subscriptions.ts:208`) and selected (`:116`), but its only readers
  are display and the reminder email (`src/lib/dashboard-server.ts:68,122,124`;
  `src/lib/trial-will-end.ts:103,134`). There is no `trial_used` fact anywhere
  in `src/` or `supabase/migrations/`. Stripe has no built-in once-per-customer
  trial, and this code adds none. Inferring from `trial_end` is unsafe because
  it is overwritten by whichever subscription wrote last.
  Follow-up: checkout now uses Stripe subscription history and local subscription
  identity; no separate local `trial_used` field was added.

- [x] **The restart is the normal UI path, not just a reachable API.** `1H`
  `src/app/settings/page.tsx:138-140` renders the start-trial CTA for any
  non-paid status.

- [x] **Checkout is not gated on the billing flag.** `1H`
  `createCheckoutSession` never calls `flags.subscriptionBilling()`, so a real
  Stripe trial can be started while billing is flagged off.

---

## Lifecycle email

- [ ] **The trial-ending warning is gated on a marketing opt-in.** `DECIDE`
  The `trial_will_end` send path checks `profiles.email_opt_in`, so a trialing
  member who never opted into marketing gets no warning that access is about to
  end. This is a transactional notice behind a marketing consent.

- [ ] **Nothing on the subscribe path turns that opt-in on.** `DECIDE`
  So the gate above is normally closed.

- [x] **Saving Settings without membership access clears the opt-in.** `1H`
  The notification-preferences save posts `email_opt_in: false`, silently
  disabling the notice the trial depends on.

- [ ] **`TRIAL_WILL_END_EMAIL_ENABLED` must be exactly `"1"`.** `ENV`
  Unset means the entire send path is a no-op.

---

## Onboarding and auth

- [ ] **Skip destroys the preview answers.** `DECIDE`
  The skip branch persists nothing and clears both stores — `localStorage` and
  the `cm_preview` cookie — leaving an empty matching profile, so the product
  looks as though it has nothing for the visitor.

- [x] **The dashboard banner still claims it used those answers.** `1H`
  After Skip, the banner asserts the list was built from preview answers that
  were discarded.

- [x] **Magic-link signup dead-ends on a password form.** `1H`
  `AuthForm` defaults signup to OTP; `/login` opens in password mode on
  `confirmed=1`. Opening the link in another browser — the common mobile case —
  presents a password form for an account that may have no password.

- [x] **Both escape routes there are small text links, not buttons.** `1H`

---

## The filing desk

- [ ] **The capacity counter is global across all settlements.** `DECIDE`
  The ceiling is `daily_capacity x sla_business_days`, 20 by default, shared by
  every settlement rather than per-settlement.

- [ ] **Stuck jobs count toward capacity forever.** `HALF`
  `needs_attention` and `exported` are open statuses with no age filter and no
  reaper, so the queue degrades monotonically toward a permanent stop.

- [x] **Hitting the ceiling blames the settlement, not the queue.** `1H`
  `desk_at_capacity` maps to `not_offered_for_settlement`
  (`src/lib/filing/v2/contract-base.ts:155`), so the member is told this
  settlement cannot be filed.

- [x] **A failed count *read* reports `desk_at_capacity`.** `1H`
  Producing the same member-facing message for an infrastructure error.

- [ ] **Crossing the ceiling moves mid-packet members to self-file.** `HALF`
  Partially mitigated: the background hand-back sweep deliberately ignores
  capacity. Follow-up: signing now preserves prior admission. The dashboard
  list summary still lacks the history used by that check.

---

## Public claims

- [ ] **`/pricing` ships "takes 0 percent of your payouts" in FAQPage JSON-LD.** `DECIDE`
  Machine-readable, durable, and re-quotable by search and answer engines after
  the page changes.

- [ ] **The same claim is site-wide.** `DECIDE`
  Also in Organization/WebSite JSON-LD, the `<meta>` description, and
  `llms.txt`. Across six files: `src/app/terms/page.tsx`,
  `src/app/signup/page.tsx`, `src/app/pricing/page.tsx`,
  `src/components/Footer.tsx`, `src/lib/utils.ts`, `src/lib/copy.ts:36`
  ("takes 0 percent of your settlement payouts. Administrators pay you directly
  and you keep 100 percent.").

- [ ] **The Easy submit coverage ratio is stated nowhere.** `DECIDE`
  The membership is priced on Easy submit, which works on a minority of the
  catalog, and the hero conveys this only with the word "eligible".

- [x] **No non-affiliation statement on the homepage.** `1H`
  None appears near the featured third-party settlement names; it exists only in
  `/terms` and the e-sign authorization. This is the cheap half of the
  disclosure exposure in `docs/legal`.

- [x] **The paper-fallback headline asserts "No reply after 7 days".** `1H`
  Shown even when no administrator email was ever sent.

---

## Homepage audience fit

- [ ] **Card selection never reads `claim_action_type`.** `HALF`
  Both the top-payout and closing-soon lists choose on payout and deadline
  alone, so rows needing a mailed notice ID are featured to visitors who do not
  have one.

- [ ] **`NO_PIN_BREACH_PRIORITY_ENABLED` is off *and* unwired on the homepage.** `DECIDE`
  Even when enabled it does not affect homepage ordering at all. The no-PIN /
  breach-first work is inert on this surface.

- [ ] **`/check` is still flag-gated off and 404s.** `ENV`
  One environment variable turns on the notice-verification page. Note it
  searches the entire published catalog, not only notice-ID rows.

---

## Payout readers

- [ ] **`PER_PERSON_CEILING` is a $50,000 cliff in both directions.** `DECIDE`
  `src/lib/top-payouts.ts`. It drops genuine per-person caps at or above it, and
  admits any fund total just below it. Load-bearing today — measured against the
  live catalog, 8 of the correct drops survive on the ceiling alone — but it is
  true of today's rows and nothing else. Data-breach settlements routinely cap
  documented losses well above $50k.

- [x] **A second, looser payout reader still ships.** `1H`
  `src/lib/catalog-page.ts` holds `listedPayoutAmount` / `sortCatalogValueFirst`
  with no ceiling, no fund guards, and a regex whose dollar sign is **optional**,
  so it reads years and quantities as dollars. Gated behind
  `CATALOG_VALUE_RANK_ENABLED` (off), so not live — but the repo now holds two
  contradictory definitions of "this listing's payout".

- [x] **`payout-stats.ts` duplicates `home-stats.ts`.** `1H`
  It re-derives `open` and `closingSoon`, and `src/app/page.tsx` calls both over
  the same rows. They agree today; any future change to one caller's row set
  makes the hero and the stats strip disagree.

---

## Flags, migrations, CI, hygiene

- [ ] **`0056` has an apply-order hazard.** `1H`
  `supabase/migrations/0056_pin_admin_email.sql:48` does
  `create or replace function public.claim_apply_change(...)`, so it assumes
  0052 and 0053 are already applied. Follow-up: the migration header now
  documents its dependencies, including 0055. Production order remains unverified.

- [x] **The PIN-admin outreach CTA and its write endpoint are ungated.** `1H`
  `src/app/api/claims/pin-admin-email/route.ts:20` states it plainly: "Outbound
  send is gated by `PIN_ADMIN_EMAIL_ENABLED` (default off)". Only the *send* is
  gated. The CTA (`src/components/claims/NoticeIdSection.tsx:243`) and the write
  path run with no flag. PIN-gated administrator outreach was explicitly
  deferred pending product and legal decisions.

- [x] **The mail-in paper-form card has no flag at all.** `1H`
  `PAPER_FALLBACK_REMINDER_ENABLED` gates only the drip email, not
  `src/components/claims/PaperFallbackCard.tsx`. Mail-in paper workflows were
  also explicitly deferred.

- [x] **Twelve catalog flags are missing from `.env.example`.** `1H`
  Including `ONE_CLICK_FILING_ENABLED`, `DASHBOARD_VALUE_ENABLED` and
  `NO_PIN_BREACH_PRIORITY_ENABLED`.

- [ ] **`mobile` CI has been red on `main` since 2026-11-26.** `1H`
  `expo-doctor` reports 10 out-of-date Expo packages (`expo 58.0.26` against
  `~58.1.0`, nine patch-level). `mobile/package.json` has no `expo` config
  block, so no `expo.install.exclude` exists — the documented way to silence
  them. Either upgrade or exclude.

- [ ] **`mobile` can never block a merge.** `DECIDE`
  Expo doctor runs un-tolerated, but `mobile` is not a required check
  (required: `verify`, `db-migrations`). So the job is red by design and carries
  no signal. Either make it required or tolerate the step.

- [x] **85 local branches and 25 git worktrees.** `1H`
  Twenty are `worktree-wf_*` left by workflow runs. Prune the unchanged ones.

---

## Needs production access

None of these can be answered from the repository. Listed so they are not
mistaken for things already known.

- [ ] Are migrations `0054`, `0055` and `0056` applied to production?
- [ ] **Is `lawsuits.claim_action_type` populated in production?** If it is null
      or absent, every per-card label silently degrades to "Start your claim" —
      the dangerous class of defect, where a shipped feature looks live and does
      nothing.
- [ ] How many settlements does Easy submit cover at runtime?
- [ ] Is `CATALOG_VALUE_RANK_ENABLED` set in the deployed environment?
- [ ] Does the live database have 0055's dedupe column and kind constraint?
- [ ] **The stated per-person payout on the ten settlements Easy submit can
      actually file.** Still the single highest-value unknown: a day of reading
      official notices, no analytics or users required, and it decides whether
      the offer should be rebuilt around filing.
- [ ] How many settlements would `/check` serve? The notice-ID subset is 44 rows
      in the curated set, but the page searches the whole catalog.
- [ ] The exact Expo mismatch count is not derivable from the repo.

---

## Already fixed — do not redo

- Rows that are not open yet are segregated into their own headed section with
  no action button.
- `automatic_payment` rows show "No claim needed" instead of a claim button.
- Cards **do** label by `claim_action_type` through the CTA label. The remaining
  gap is that there is no per-card explanation, only button text.
- Every flag reviewed defaults **off**. None of the legally sensitive features
  ships on by default (but see the two ungated paths above, which have no flag
  rather than a flag set off).
- `0055` and `0056` are both genuinely additive / expand-only and RLS-safe as
  written. Migrations 0050-0056 are contiguous with no gaps.
- `verify` and `db-migrations` are required and unfiltered; `mobile` is
  path-filtered; `smoke` is deploy-triggered and self-skipping.

## Corrections to earlier reports

Recorded because each one changed a recommendation.

- Migration `0051` **is** applied. An earlier pass claimed it was not.
- `/lawsuits` is **not** ISR-cached. `revalidate = 900` is dead code because
  `Nav` calls `supabase.auth.getUser()` from the root layout, so every route
  reads cookies and opts out of static rendering.
- The homepage is **30 KB brotli** over the wire, not 266 KB. The real weight
  was uncompressed JS, of which `posthog-js` is 291 KB.
- `/check` returning 404 is a **flag, not a bug**.
- The median stated per-person payout is **$250 across 22 listings**, not $99
  across 58 figures. The earlier figure was the median of dollar *figures*, so a
  verbose listing voted several times (one row alone yields $0.50, $2.50 and
  $12.50). One figure per listing is the only unit a public sentence can use.
  Of 98 open settlements, **76 state no per-person amount at all**. The top is
  $5,000 (four listings, all documented-loss caps), not $15,000 — that was a
  service award to a named plaintiff. The lowest is $8, not $0.50.
- The "13 featured / 5 needing a notice ID / 3 not open / 5 of 11 buttons"
  figures **cannot be re-derived from code**. They were read from the live RSC
  payload on the audit date and are a snapshot, not a property of the source.
- The consumer panel in the founder pack produced **40** simulated buyers, not
  100; three downstream lenses cited a denominator that was never produced.

## Flagged for counsel — unverified

These came from an agent's web research and **have not been verified**. The
dockets and the assurance document were not read. Treat them as leads, not
facts. What *was* verified is everything on this codebase's side of each
comparison.

- A DC Attorney General assurance (reported executed 2024-11-01) requiring
  prominent disclosure of fees and of non-affiliation with the settlements
  promoted. See the non-affiliation and coverage-ratio items above.
- Two reported rulings upholding administrators' rejection of third-party claim
  submissions. If accurate, Easy submit's narrow coverage is a **legal ceiling,
  not an engineering backlog**, and any roadmap that assumes it grows assumes
  away two adverse rulings against better-funded competitors.
- The "0 percent" commitments above, which turn an undecided position into a
  durable public promise.
