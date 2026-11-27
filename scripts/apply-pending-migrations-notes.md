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
| 0050 catalog_public_guardrails | **No** | **No** | Not applied. Owner applies in the SQL editor after merge. Adds `lawsuits.is_test` and `deadline_override` / `_note` / `_at`. Do not run from this PR. |
| 0051 claim_profile | **No** (assumed) | **No** | Not applied and not previously listed. Adds `lawsuits.claim_action_type` (6-value CHECK) and `claim_action`. Required before `NO_PIN_BREACH_PRIORITY_ENABLED` does anything. See the checklist below. |
| 0053 requested_notice | (not checked) | **No** | Mentioned by `supabase/owner-apply/README.md` only. Confirm before applying `top20-verification-2026-11.sql`. |

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

## Ready-to-run checklist: no-PIN / data-breach priority (0051)

`NO_PIN_BREACH_PRIORITY_ENABLED` ranks eligible no-PIN data-breach settlements
first on the dashboard, the logged-out preview and `/lawsuits`. The signal is
`lawsuits.claim_action_type` (`desk_file` / `online_form` are the positives,
`needs_notice_id` the negative). **The flag is inert until steps 1-3 below are
done**: `lookupLawsuits()` selects `*`, so a missing column silently yields
`claim_action_type: undefined` for every row and the code treats that as "not
known to be no-PIN" (`src/lib/claim-priority.ts`). No error, no change.

Run in order, in the Supabase SQL editor. Nothing here runs from CI or an
agent session.

1. **Pre-check** — is the column already there?
   ```sql
   select exists (
     select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits'
       and column_name = 'claim_action_type'
   ) as has_0051_claim_action_type;
   ```
   If this is already `true`, skip step 2.

2. **Apply the migration** — paste `supabase/migrations/0051_claim_profile.sql`.
   It adds `lawsuits.claim_action_type` with the six-value CHECK plus
   `claim_action jsonb`, and is the migration `supabase/tests/84_claim_profile.sql`
   asserts in the `db-migrations` job. Do **not** record a version row unless
   the apply succeeded; follow the existing 0041-0049 bookkeeping note above.

3. **Populate the column** — paste `supabase/owner-apply/claim-action-types.sql`.
   Regenerate it first with `npx tsx scripts/claim-action-types.ts` so it
   matches `src/lib/claim-action-catalog.ts`; the checked-in copy had drifted by
   nine rows before this change. Every `update` is guarded by
   `status = 'open' and review_status = 'published'`, and closed / hidden /
   unpublished duplicates are skipped.
   Expected: **112 rows applied** — `needs_notice_id=44`, `automatic_payment=22`,
   `online_form=15`, `not_open=15`, `desk_file=10`, `mail_in=6`.

4. **Verify the counts** before flipping the flag.
   ```sql
   select claim_action_type, count(*)
     from public.lawsuits
    where status = 'open' and review_status = 'published'
    group by 1
    order by 2 desc;
   ```

5. **Flip the flag** in Vercel: `NO_PIN_BREACH_PRIORITY_ENABLED=1`, then
   redeploy (env changes apply on the next deploy). The dashboard is
   `force-dynamic` and changes at once; `/lawsuits` and `/` are ISR, so their
   order only changes after revalidation.

6. **Roll back** by removing the env var or setting it to anything other than
   `1`. No SQL is reverted and no match score was ever changed.

### Related, no SQL needed

`MATCH_SPECIFICITY_GATE_ENABLED` (the employer / class-period match gate) is
**default on** and needs no migration. Kill it with
`MATCH_SPECIFICITY_GATE_ENABLED=0`. After deploying it, re-run the match
recompute (`persistStoredMatches` / the match sweep) so rows already written
into `public.matches` at score 1.0 are re-scored — tightened matcher code does
not rewrite stored rows, and the dashboard renders a stored score verbatim.

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
