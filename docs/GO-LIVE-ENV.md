# Go-live environment (items 8–10)

**8 — D4:** Keep `FEE_DISCLOSURE_ENABLED` off until `docs/product/D4-monetization-position.md` is decided. Do not enable `ASSISTED_FILING_ENABLED` (retired; use `ONE_CLICK_FILING_ENABLED`).

**9 — Agent auth:** Default unset = v1. Set `AGENT_AUTH_CURRENT_VERSION=agent-auth-v2` only after checklist 4b + desk sign-off; redeploy.

**10 — After 0049 on prod:** `OWED_ESTIMATE_HEADER_ENABLED=1` and/or `SELF_FILED_REPORT_ENABLED=1`, then redeploy. Preview first.
