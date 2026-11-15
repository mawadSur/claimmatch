# DRAFT — for counsel review, not in effect

**One-click filing: law-firm sign-off checklist (GitHub issue #52)**

`ONE_CLICK_FILING_ENABLED` stays off in production until every item below is signed. For each item: what
the firm approves, and the exact file, setting or admin screen where that approval is recorded or takes
effect. "Console" means `/admin/filing` (signed-in staff; legal_reviewer actions are enforced again by
the database, migrations 0042 and 0045).

| # | Item | What the firm approves | Where it is approved / takes effect | Software status |
|---|---|---|---|---|
| 1 | Terms: agency section | Final wording of the agency section | Draft: `docs/legal/one-click-terms-agency-section.md`. Takes effect when engineering ports it into `src/app/terms/page.tsx` | Draft ready; live page untouched |
| 2 | Privacy additions | Final wording | Draft: `docs/legal/one-click-privacy-additions.md`. Live: `src/app/privacy/page.tsx` | Draft ready; live page untouched. Data export of one-click records not built |
| 3 | E-SIGN consent | Text and version `esign-v1` | `src/lib/filing/v2/esign.ts` (`ESIGN_TEXT_V1`). A wording change means a new `ESIGN_TEXT_VERSION` | Built |
| 4 | Agent authorization | Text `agent-auth-v1`, per channel, incl. what Lawsuit AI owes on a miss | `src/lib/filing/v2/authorization-text.ts`. A wording change means a new `AGENT_AUTHORIZATION_VERSION` | Built |
| 5 | Per-settlement sign-off | Each policy version (with its sources) and each spec version (verbatim statement, class definition, questions) | Console, `/admin/filing/settlements/{id}`: Policies and Spec panels, "Approve" (legal_reviewer only; records reviewer, time, notes, documents reviewed; a draft edited after reading is refused) | Built |
| 6 | Agent certifications | Whether a form where the submitter swears to facts may be filed by an agent | Same screen, policy field "Allow agent certification" (`agent_certification_allowed`). Off by default; a spec with `requires_agent_certification` stays self-file without it | Built and enforced (`chooseLane`, Jev) |
| 7 | Fee status | `lawsuits.third_party_fee_status` per settlement | `/admin/catalog` (fee status column). This build charges no fee; payout always to the member | Built (recorded and shown; no fee is charged, so it gates nothing) |
| 8 | Account deletion vs legal records | `delete`, `anonymize_and_retain` or `retain`; and the archive period | Vercel env `LEGAL_RECORDS_ON_ACCOUNT_DELETION` (default `delete`) and `LEGAL_RECORD_RETENTION_DAYS` (default 2555). See `docs/legal/retention-schedule.md` | Built (0045 archive, fail-closed) |
| 9 | Health consent | Consent text for each health-sensitive settlement (WA My Health My Data Act) | Settlement screen, policy fields "Health-sensitive settlement" and "Health consent text". Without the text, flagged answers and documents are never collected and the claim is self-file | Built and enforced |
| 10 | States | The states the firm covers, per policy | Policy field "States the law firm covers" (`allowed_states`; required when agent filing is allowed; administrator level can only narrow it) | Built and enforced |
| 11 | Filing desk procedures | The procedure | Draft: `docs/legal/filing-desk-procedures.md`. Desk rules shown on `/admin/filing/desk` | Draft ready; software built |
| 12 | Channels | Each administrator claims address verified at its source; written agreement before bulk or API; objections honored within 24h | Policy "Channels" editor. Approval is refused unless an enabled email channel's `published_at_url` is among the documents reviewed, and an enabled bulk or API channel has a reviewed "Administrator letter" (`src/lib/filing/v2/approval-checks.ts`). Objections and kill switch: Controls panel | Built (new approval checks); API adapters do not exist, so the API channel can never be chosen |
| 13 | Copy: per-claim disclaimers | The per-claim sentences | `src/lib/copy.ts`: `CLAIM_AGENT_LEGAL_SENTENCE`, `PREFILL_AGENT_LANE_NOTE`, `ONE_CLICK_AGENT_NOTE`, `MAY_FILE_*`. Applied by `claimLegalDisclaimer` and `claimFiledByLawsuitAi` | Built (web). Mobile app copy not changed |
| 14 | Retention periods | Documents 90 days, Jev runs, signatures, audit log | `docs/legal/retention-schedule.md`; settings `JEV_PARTIAL_RUN_RETENTION_DAYS`, `LEGAL_RECORD_RETENTION_DAYS`; constant `DOCUMENT_RETENTION_DAYS` | Built |
| 15 | App stores (later) | Store listings, iOS privacy manifest, App Store privacy answers, Play Data safety | Not started | Not built |

## Open founder decisions (#52)

| Decision | What is built | Where |
|---|---|---|
| Desk stops at CAPTCHAs: per-settlement switch? | Switch built, default "stop" everywhere; only a legal_reviewer changes it, with notes, audited. It has no effect until a new authorization version tells members a desk agent may complete a CAPTCHA (agent-auth-v1 says the agent stops) | Console, settlement Controls panel, "Desk rule for checks on the official form"; `filing_controls.desk_challenge_mode` (0045); `VERSIONS_COVERING_STAFF_CAPTCHA` in `authorization-text.ts` |
| "Withdrawn" is final? | Today it is final: a withdrawn one-click claim cannot be reopened (state machine, 0042) | `src/lib/filing/v2/contract-base.ts` `CLAIM_TRANSITIONS` and the 0042 trigger |
| "Does not charge me a fee" while D4 is undecided? | Text unchanged | `agent-auth-v1` |

## Sign-off record

| # | Approved by | Date | Version / setting approved | Notes |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | esign-v1 | |
| 4 | | | agent-auth-v1 | |
| 5 | (per settlement, in the console) | | | |
| 6 | (per settlement, in the console) | | | |
| 7 | (per settlement, in the catalog) | | | |
| 8 | | | LEGAL_RECORDS_ON_ACCOUNT_DELETION = | |
| 9 | (per settlement, in the console) | | | |
| 10 | (per policy, in the console) | | | |
| 11 | | | | |
| 12 | (per policy, in the console) | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
