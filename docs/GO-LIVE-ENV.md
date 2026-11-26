# Go-live environment (items 8–10)

**8 — D4:** Counsel signed off the 15% recovery-only Easy submit fee (2026-11-26). Set `FEE_DISCLOSURE_ENABLED=1` (exactly `"1"`) with `AGENT_AUTH_CURRENT_VERSION=agent-auth-v3`. See `docs/stripe-fee-invoices.md`. Do not enable `ASSISTED_FILING_ENABLED` (retired; use `ONE_CLICK_FILING_ENABLED`).

**9 — Agent auth:** Default unset = v1 (or v3 when the fee flag is on). Set `AGENT_AUTH_CURRENT_VERSION=agent-auth-v3` for the fee disclosure. `agent-auth-v1` and `agent-auth-v2` text never change.

**10 — After 0049 on prod:** `OWED_ESTIMATE_HEADER_ENABLED=1` and/or `SELF_FILED_REPORT_ENABLED=1`, then redeploy. Preview first.
