# Go-live environment (items 8–10)

**8 — D4:** Membership is a 7-day free trial, then $19.99/month (cancel anytime). Easy submit and new-claim alerts are included. Lawsuit AI takes 0 percent of settlement payouts. Set `SUBSCRIPTION_BILLING_ENABLED=1` (exactly `"1"`) with `AGENT_AUTH_CURRENT_VERSION=agent-auth-v3`. See `docs/stripe-subscriptions.md`. Do not enable `ASSISTED_FILING_ENABLED` (retired; use `ONE_CLICK_FILING_ENABLED`).

**9 — Agent auth:** Default unset = v1 (or v3 when the billing flag is on). Set `AGENT_AUTH_CURRENT_VERSION=agent-auth-v3` for membership disclosure. `agent-auth-v1` and `agent-auth-v2` text never change.

**10 — After 0049 on prod:** `OWED_ESTIMATE_HEADER_ENABLED=1` and/or `SELF_FILED_REPORT_ENABLED=1`, then redeploy. Preview first.
