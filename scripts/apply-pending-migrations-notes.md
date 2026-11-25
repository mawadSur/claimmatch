# Migration apply log (owner-maintained)

Update this after each Supabase SQL editor session. Do not commit secrets.
Do not run migrations or record scripts from an agent session.

**Verified read-only on production 2026-11-25.** There is no staging Supabase project yet — do not mark staging applied.

## Production status (verified 2026-11-25)

Latest **recorded** row in `supabase_migrations.schema_migrations`: `0036_match_alert_emails`.
Objects can exist on the database without a matching recorded version.

| Migration | Objects present? | Recorded in `schema_migrations`? | Date / notes |
|-----------|------------------|----------------------------------|--------------|
| 0029 held_closure_triage | (not re-checked this pass) | | Gates held-closure triage flags |
| 0031 drip_email_sends | (not re-checked this pass) | | Founder yes for drip |
| 0032 mobile_client_hardening | Yes | **Yes** — `20261110013803` / `0032_mobile_client_hardening` | SEC-9; applied and recorded |
| 0033 beta_feedback | (not re-checked this pass) | | Optional |
| 0036 match_alert_emails | Yes (latest recorded) | **Yes** | Latest recorded as of this check |
| 0037 verification_drafts | **No** | **No** | Not applied. Do not record. Do not apply from this leftover work. |
| 0041–0044 one-click core | **Yes** — `claim_packets`, `claim_signatures`, `claim_filing_jobs`, `filing_policies`, `filing_specs`, `filing_controls`, `staff_roles`, `filing_enqueue` | **No** | Present, not recorded |
| 0045 one_click_go_live_gate | **Yes** — `filing_controls.desk_challenge_mode`, `filing_legal_record_archive` | **No** | Present, not recorded |
| 0046 one_click_test_mode | **Yes** — `claim_filing_jobs.is_test`, `filing_enqueue_test` | **No** | Present, not recorded |
| 0047 one_click_test_packets | **Yes** — `claim_packets.is_test` | **No** | Present, not recorded |
| 0048 withdrawn_final | **Yes** — `claims_withdrawn_final` function + trigger | **No** | Present, not recorded |
| 0049 self_filed_reports | **Yes** — `self_filed_reports` | **No** | Present, not recorded. Before `SELF_FILED_REPORT_ENABLED`. |

### Counts on production (no PII, 2026-11-25)

- `claim_packets`: 1 test / 0 non-test
- `claim_filing_jobs`: 1 test job
- `claim_signatures`: 1
- `filing_policies`: 1 approved policy on a test-like settlement only
- `filing_specs`: 1 approved spec on a test-like settlement only
- `filing_controls`: 0 rows
- `self_filed_reports`: 0
- `staff_roles`: 1 row

Owner-only bookkeeping (do **not** run from this leftover work): `scripts/record-applied-migrations-0041-0049.sql`. Exact `schema_migrations.version` timestamps for 0041–0049 are **not** in the repo; the script uses `OWNER_CONFIRM_VERSION_*` placeholders and refuses to insert until they are replaced. 0032 is a comment only. 0037 is excluded.

## Staging status

| Migration | Applied (Y/N) | Date | Notes |
|-----------|-----------------|------|-------|
| (none — no staging project yet) | N | | Do not mark applied. Mirror this table after staging exists. |

## Pre-check snippet (reusable, read-only)

```sql
select
  to_regclass('public.claim_packets')          is not null as has_one_click,
  to_regclass('public.self_filed_reports')     is not null as has_0049,
  to_regclass('public.drip_email_sends')       is not null as has_0031,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'filing_controls'
      and column_name = 'desk_challenge_mode'
  ) as has_0045_desk_challenge,
  to_regclass('public.filing_legal_record_archive') is not null as has_0045_archive,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_packets'
      and column_name = 'is_test'
  ) as has_0047_packet_is_test;
```
