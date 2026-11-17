# Migration apply log (owner-maintained)

Update this after each Supabase SQL editor session. Do not commit secrets.

## Production status (as of 2026-11-17 — verify in SQL editor)

| Migration | Applied (Y/N) | Date | Notes |
|-----------|-----------------|------|-------|
| 0029 held_closure_triage | | | Gates held-closure triage flags |
| 0031 drip_email_sends | | | Founder yes for drip |
| 0032 mobile_client_hardening | | | SEC-9; required for mobile launch |
| 0033 beta_feedback | | | Optional |
| 0041–0044 one-click core | | | Pre/post-check in runbook |
| 0046 one_click_test_mode | | | Before test-mode deploy |
| 0047 one_click_test_packets | | | Before go-live deploy |
| 0048 withdrawn_final | | | |
| 0049 self_filed_reports | | | Before `SELF_FILED_REPORT_ENABLED` |

## Staging status

| Migration | Applied (Y/N) | Date | Notes |
|-----------|-----------------|------|-------|
| (mirror prod tracking here) | | | |

## Pre-check snippet (reusable)

```sql
select
  to_regclass('public.claim_packets')          is not null as has_one_click,
  to_regclass('public.self_filed_reports')     is not null as has_0049,
  to_regclass('public.drip_email_sends')       is not null as has_0031;
```