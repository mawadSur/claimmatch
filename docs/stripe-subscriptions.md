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

If `STRIPE_SECRET_KEY` or `STRIPE_PRICE_ID` is unset, public pages, CI, and builds keep working. Checkout and the Billing Portal return a clear 503.

When `SUBSCRIPTION_BILLING_ENABLED` is unset, Easy submit stays ungated (beta/testing). New-claim alerts are not membership-gated. Pricing, Terms, FAQ, and footer keep the free-during-beta wording.

## Stripe Dashboard

1. Create a Product (for example “Lawsuit AI membership”) with a **recurring** Price: **$19.99 / month**. Copy the Price id (`price_…`) into `STRIPE_PRICE_ID`.
2. Add a webhook endpoint: `https://<host>/api/webhooks/stripe`.
3. Subscribe the endpoint to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Enable Customer Billing Portal so members can cancel or add a payment method.

Checkout uses `mode: "subscription"`, `subscription_data.trial_period_days: 7`,
`payment_method_collection: "if_required"` and
`subscription_data.trial_settings.end_behavior.missing_payment_method: "cancel"`.
The trial therefore starts with **no card at all**: Stripe skips the card form because the
first invoice is zero, and if the member never adds a payment method the subscription
cancels itself at trial end rather than producing an unpayable invoice. Members cancel
anytime from Settings → Manage billing.

Two consequences worth knowing. A trialing member has no payment method on file, so day-7
conversion depends entirely on them returning to add one — `customer.subscription.trial_will_end`
is not in the webhook `HANDLED` set and there is no trial-ending email, so the cancellation is
silent today. And cardless trials are cheap to repeat with a fresh email address; checkout only
blocks a repeat when the *same* user already has a `trialing`/`active` row.

## Endpoints

- `POST /api/billing/checkout` — signed-in member; creates a Checkout Session (503 if Stripe env is unset, 409 if already trialing/active).
- `POST /api/billing/portal` — signed-in member; opens Customer Billing Portal (400 if no Stripe customer yet).
- `POST /api/webhooks/stripe` — verifies `STRIPE_WEBHOOK_SECRET` and idempotently upserts `public.subscriptions` on `user_id`.

Paid access is `trialing` or `active`. Admins, `profiles.is_internal`, and `INTERNAL_EMAILS` testers bypass the gate so staff can review Easy submit without a live subscription.

## Apply order (unapplied SQL)

1. `supabase/owner-apply/one-click-eight-easy-submit.sql` — backup, draft specs/policies, `claim_action_type = desk_file` for the eight settlements. A **legal_reviewer still must approve** each spec and policy in `/admin/filing`. SQL never sets `approved`.
2. `supabase/migrations/0054_stripe_subscriptions.sql` — `subscriptions` table + RLS.
3. Set the Vercel env vars above and redeploy.

Rollback notes are in each SQL file. Do not write these from this repo’s scripts.
