# Stripe membership (7-day free trial, then $19.99/month)

Lawsuit AI bills a **membership**, not a percentage of settlement payouts. Browsing, matching, and filing yourself on official settlement sites stay free. Easy submit and new-claim alerts are included with membership: a 7-day free trial, then $19.99/month, cancel anytime. Administrators pay members directly. Lawsuit AI takes 0 percent of settlement payouts and never holds or redirects settlement funds.

Do not apply `supabase/migrations/0054_stripe_subscriptions.sql` from CI. An owner applies it, then sets Vercel env vars and redeploys. Do not write to the production database from this repo’s scripts.

## Vercel env vars

Set these on the Lawsuit AI Vercel project (Production, and Preview if you will test Checkout there). Never commit values.

| Name | Value |
| --- | --- |
| `SUBSCRIPTION_BILLING_ENABLED` | `1` (the app reads exactly `"1"`, not `true`) |
| `AGENT_AUTH_CURRENT_VERSION` | `agent-auth-v3` (optional once the billing flag is on: v3 is the default) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_ID` | Stripe Price id for the **$19.99/month** recurring membership |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /api/webhooks/stripe` |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Optional. Billing Portal configuration id (`bpc_…`) pinning the portal to the LawsuitAI-only configuration. Unset means Stripe's default configuration. |

Missing Stripe configuration does not break public pages, CI, or builds. With billing enabled, checkout returns 503 if either the secret key or price ID is missing. The Billing Portal requires the secret key but not the price ID.

When `SUBSCRIPTION_BILLING_ENABLED` is unset, Easy submit stays ungated (beta/testing). New-claim alerts are not membership-gated. Pricing, Terms, FAQ, and footer keep the free-during-beta wording.

## Stripe Dashboard

1. Create a Product (for example “Lawsuit AI membership”) with a **recurring** Price: **$19.99 / month**. Copy the Price id (`price_…`) into `STRIPE_PRICE_ID`.
2. Add a webhook endpoint: `https://<host>/api/webhooks/stripe`.
3. Subscribe the endpoint to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end` (needed for the optional reminder)
   - `invoice.payment_failed`
4. Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Enable Customer Billing Portal so members can cancel or add a payment method.

Checkout uses `mode: "subscription"`. A returning customer must provide a payment method.
A **first** trial uses `payment_method_collection: "if_required"` and sets
`subscription_data.trial_period_days: 7` and
`subscription_data.trial_settings.end_behavior.missing_payment_method: "cancel"`.
That first trial starts with **no card at all**: Stripe skips the card form because the
first invoice is zero, and if the member never adds a payment method the subscription
cancels itself at trial end rather than producing an unpayable invoice. Members cancel
anytime from Settings → Manage billing.

Checkout is gated on `SUBSCRIPTION_BILLING_ENABLED=1`. Before creating a session it lists
the Stripe customer's subscriptions (`status: 'all'`), refuses when any is still
`trialing|active|past_due|unpaid|incomplete|paused`, and reuses an open Checkout Session
instead of minting a second one. A later checkout after every prior subscription is
terminal (`canceled` / `incomplete_expired`) is **paid from day one** — no second trial
for that Stripe customer. Fresh email addresses can still get a first trial; that is a
Stripe customer boundary, not a government-ID bound.

Webhook writes track one subscription per user. A new ongoing subscription can replace
an ended one, but events for unrelated subscriptions cannot overwrite an ongoing one.
A `customer.subscription.deleted` for an abandoned first subscription cannot revoke
access while a later subscription is live. `invoice.payment_failed`
re-retrieves the subscription before writing, so a recovered invoice does not force `past_due`.

`customer.subscription.trial_will_end` is handled and can send the reminder email when
`TRIAL_WILL_END_EMAIL_ENABLED=1`.

## Endpoints

- `POST /api/billing/checkout` — signed-in member; creates a Checkout Session (404 if billing is off, 503 if Stripe env is unset, 409 if an ongoing subscription already exists).
- `POST /api/billing/portal` — signed-in member; opens Customer Billing Portal (400 if no Stripe customer yet).
- `POST /api/webhooks/stripe` — verifies `STRIPE_WEBHOOK_SECRET` and syncs `public.subscriptions` for the tracked subscription only.

Paid access is `trialing` or `active`. Admins, `profiles.is_internal`, and `INTERNAL_EMAILS` testers bypass the gate so staff can review Easy submit without a live subscription.

## Apply order (unapplied SQL)

1. `supabase/owner-apply/one-click-eight-easy-submit.sql` — backup, draft specs/policies, `claim_action_type = desk_file` for the eight settlements. A **legal_reviewer still must approve** each spec and policy in `/admin/filing`. SQL never sets `approved`.
2. `supabase/migrations/0054_stripe_subscriptions.sql` — `subscriptions` table + RLS.
3. Set the Vercel env vars above and redeploy.

Rollback notes are in each SQL file. Do not write these from this repo’s scripts.
