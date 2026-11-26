# Stripe fee invoices (Easy submit recovery-only fee)

Counsel-cleared recovery-only fee: Lawsuit AI invoices **15 percent of a confirmed payout** after the settlement administrator pays the member. Matching is free. Filing yourself on the official site is free. If there is no recovery, the member owes $0. Lawsuit AI never holds or redirects settlement funds.

Do not apply `supabase/migrations/0054_stripe_fee_invoices.sql` from CI. An owner applies it, then sets Vercel env vars and redeploys.

## Vercel env vars

Set these on the Lawsuit AI Vercel project (Production, and Preview if you will test invoices there). Never commit values.

| Name | Value |
| --- | --- |
| `FEE_DISCLOSURE_ENABLED` | `1` (the app reads exactly `"1"`, not `true`) |
| `AGENT_AUTH_CURRENT_VERSION` | `agent-auth-v3` (optional once the fee flag is on: v3 is the default) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/webhooks/stripe` |

If `STRIPE_SECRET_KEY` is unset, public pages, CI, and builds keep working. The admin “Send invoice” action returns a clear 503: Stripe is not configured.

## Webhook

Endpoint: `POST /api/webhooks/stripe`

Stripe events handled:

- `invoice.paid` / `invoice.payment_succeeded` → `fee_invoices.status = paid`
- `invoice.voided` → `void`
- `invoice.marked_uncollectible` → `uncollectible`

Updates are keyed on `stripe_invoice_id` and are idempotent.

## Admin

On `/admin/filing`, admins (not filing agents or legal reviewers alone) see **Recovery fee invoice**. Enter the claim UUID, the confirmed payout in USD, and net-14 or net-30. Stripe emails the member a hosted invoice.

## Apply order (unapplied SQL)

1. `supabase/owner-apply/one-click-eight-easy-submit.sql` — backup, draft specs/policies, `claim_action_type = desk_file` for the eight settlements. A **legal_reviewer still must approve** each spec and policy in `/admin/filing`. SQL never sets `approved`.
2. `supabase/migrations/0054_stripe_fee_invoices.sql` — `fee_invoices` table + RLS.
3. Set the Vercel env vars above and redeploy.

Rollback notes are in each SQL file. Do not write these from this repo’s scripts.
