# DRAFT — for counsel review, not in effect

**One-click filing: retention schedule**

Status: engineering draft (GitHub issue #52, checklist items 8 and 14). Every period below is what the
software does today by default. Each row names the one setting that changes it. The firm approves or
changes each period; the founder then sets the environment variable (Vercel, takes effect on the next
deploy) or engineering changes the constant. The same list is returned in code by `retentionSchedule()`
(`src/lib/filing/retention.ts`); keep the two in step when either changes.

| Record | Default period | Setting | Where it runs |
|---|---|---|---|
| Member proof uploads (photos, documents) | Deleted 90 days after the claim's final status (submitted, withdrawn, not reported filed), or 90 days after the deadline plus the 30-day late-report window, whatever the status. Never while the claim is signed and may still be filed. | `DOCUMENT_RETENTION_DAYS` (code constant, `src/lib/filing/v2/contract-base.ts`) | Filing cron, `retentionSweep` (`src/lib/filing/channels/cron-sweeps.ts`) |
| Unfinished upload slots | 2 hours | none | Filing cron, `expirePendingUploads` |
| Jev partial-mode runs (checks while the member fills in the claim) | Kept with the claim | `JEV_PARTIAL_RUN_RETENTION_DAYS` (whole days, at least 30; unset = keep) | Filing cron, `pruneJevPartialRuns` |
| Jev pre-sign and pre-send runs (the checks before signing and sending) | Kept with the claim | none (deliberately: part of the filing record) | `jev_runs` |
| Signatures, signature voids, e-sign consents, filing jobs, staff confirmation screenshots | Kept while the account exists | see account deletion below | `claim_signatures`, `claim_signature_voids`, `esign_consents`, `claim_filing_jobs`, `claim_documents` (staff evidence) |
| The same records after account deletion | `delete`: deleted with the account (default, today's behavior) | `LEGAL_RECORDS_ON_ACCOUNT_DELETION` = `delete` \| `anonymize_and_retain` \| `retain` | `POST /api/account/delete`, `src/lib/filing/legal-records.ts` |
| Archived legal records (only with a keeping mode) | 2555 days (about 7 years) after deletion, then deleted with any kept file | `LEGAL_RECORD_RETENTION_DAYS` (whole days) | Filing cron, `archiveRetentionSweep`; table `filing_legal_record_archive` (0045) |
| Staff access and decision log | Kept indefinitely; keeps member IDs (not names) after account deletion | none: append-only for every role in the database (0041, 0042). A shorter period needs a new migration. | `filing_audit_log` |

## Account deletion: the three options (checklist item 8)

One setting covers signatures, voids, e-sign consents, filing jobs and staff evidence together.

- **`delete`** (default): everything goes with the account, as today. Files in private storage under the
  member's folder are removed first.
- **`anonymize_and_retain`**: before deletion, a copy without identity is written to the archive: what was
  signed (packet hash, statement, authorization text and version, lane, spec version, sign-in method and
  time, signed time), the consent text and time, the job's channel, status and dates, the evidence file's
  hash and size. Not kept: typed name, the signed packet text (it holds name, address and answers), IP,
  user agent, session, account and claim IDs, confirmation numbers, staff results, the evidence file.
- **`retain`**: the full rows are copied to the archive, and staff evidence files stay in storage until the
  retention period ends. Member proof uploads are still deleted.

Both keeping modes fail closed: if the archive cannot be written, the account is not deleted and the
member sees "Could not finish deleting the account. Please try again."

## Before changing a setting

1. The firm approves the period or option in writing.
2. The Privacy page states it (`docs/legal/one-click-privacy-additions.md`, section E and F).
3. Database migration 0045 is applied (the archive table) before any keeping mode is set.
4. The founder sets the variable in Vercel and redeploys.
